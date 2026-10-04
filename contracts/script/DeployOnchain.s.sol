// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Deploy} from "./Deploy.s.sol";
import {MockUSDG} from "../src/testenv/MockUSDG.sol";
import {StockSwapAdapter} from "../src/adapters/StockSwapAdapter.sol";
import {OracleSwapPool} from "../src/testenv/OracleSwapPool.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
}

/**
 * @notice Deploys Velanos to Arbitrum Sepolia against tokens that already exist there. Nothing is
 *         minted and nothing is mocked:
 *
 *         - Settlement and bond asset: Paxos Global Dollar (USDG), pinned at $1.
 *         - Traded asset in the mandate: canonical WETH, priced live by Chainlink ETH/USD.
 *         - A forbidden asset (so a rule-101 violation is real): Circle USDC, priced by Chainlink USDC/USD.
 *
 *         Both swap pools are funded from the deployer's own real balances. A pool is oracle-priced, so
 *         it quotes the Chainlink price plus a fee, and the vault's slippage rule measures against it.
 */
contract DeployOnchain is Deploy {
    address constant USDG = 0xFFC95faa3d63Cde504a05B567C600B78C0b41892;
    address constant WETH = 0x980B62Da83eFf3D4576C647993b0c1D7faf17c73;
    address constant USDC = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;
    address constant ETH_USD_FEED = 0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165;
    address constant USDC_USD_FEED = 0x0153002d20B96532C639313c2d54c3dA09109309;

    // Chainlink's testnet feeds have a 24h heartbeat; allow one missed beat before a price is stale.
    uint32 constant MAX_STALENESS = 2 days;

    uint256 constant WETH_POOL_USDG = 40e6;
    uint256 constant WETH_POOL_WETH = 0.03 ether;
    uint256 constant USDC_POOL_USDG = 10e6;
    uint256 constant USDC_POOL_USDC = 10e6;

    function run() external pure override {
        revert("use deploy()");
    }

    function deploy() external {
        require(block.chainid == 421614, "Arbitrum Sepolia only");
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);

        warnCooldown = uint64(vm.envOr("WARN_COOLDOWN_SECONDS", uint256(120)));
        settleGrace = uint64(vm.envOr("SETTLE_GRACE_SECONDS", uint256(300)));
        bondCooldown = uint64(vm.envOr("BOND_COOLDOWN_SECONDS", uint256(300)));
        usdgMode = "official";
        stockMode = "official";
        perpMode = "none";

        vm.startBroadcast(pk);
        Deployed memory d = _deployCore(deployer);
        d.usdg = MockUSDG(USDG); // typed handle only; the real token is never touched as a mock
        d.oracle.pinSettlementAsset(USDG);

        d.oracle.setFeed(WETH, ETH_USD_FEED, MAX_STALENESS);
        d.oracle.setFeed(USDC, USDC_USD_FEED, MAX_STALENESS);

        d.stockAdapter = new StockSwapAdapter(USDG, address(d.factory), deployer);
        d.factory.setAdapterAllowed(address(d.stockAdapter), true);

        address wethPool = _pool(d, WETH, WETH_POOL_USDG, WETH_POOL_WETH, deployer, true);
        address usdcPool = _pool(d, USDC, USDC_POOL_USDG, USDC_POOL_USDC, deployer, false);
        vm.stopBroadcast();

        string memory assets = string.concat(
            "{",
            '"USDG":{"address":"', vm.toString(USDG), '","decimals":6,"symbol":"USDG","name":"Global Dollar"},',
            '"ETH":{"address":"', vm.toString(WETH), '","decimals":18,"symbol":"WETH","name":"Wrapped Ether","pool":"',
            vm.toString(wethPool), '","feed":"', vm.toString(ETH_USD_FEED), '"},',
            '"USDC":{"address":"', vm.toString(USDC), '","decimals":6,"symbol":"USDC","name":"USD Coin","pool":"',
            vm.toString(usdcPool), '","feed":"', vm.toString(USDC_USD_FEED), '"}',
            "}"
        );
        _writeDeployment(d, assets);
    }

    /// @dev Creates one oracle-priced pool against USDG and funds it from the deployer's own balances.
    ///      The WETH side is wrapped from the deployer's ETH, so no token is minted anywhere.
    function _pool(Deployed memory d, address token, uint256 usdgIn, uint256 tokenIn, address owner, bool wrap)
        internal
        returns (address)
    {
        OracleSwapPool pool = new OracleSwapPool(USDG, token, address(d.oracle), owner);
        d.stockAdapter.setPool(token, address(pool));

        if (wrap) IWETH(token).deposit{value: tokenIn}();
        IERC20(USDG).approve(address(pool), usdgIn);
        IERC20(token).approve(address(pool), tokenIn);
        pool.seed(usdgIn, tokenIn);
        // Pools here hold tens of dollars, not tens of thousands. Price impact is therefore not charged
        // on a "depth" that does not exist; the vault's own size cap bounds every trade instead.
        pool.setParams(30, 20_000e8);
        return address(pool);
    }
}
