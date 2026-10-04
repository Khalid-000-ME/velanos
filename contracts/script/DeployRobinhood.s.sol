// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Deploy} from "./Deploy.s.sol";
import {MockUSDG} from "../src/testenv/MockUSDG.sol";
import {StockSwapAdapter} from "../src/adapters/StockSwapAdapter.sol";
import {OracleSwapPool} from "../src/testenv/OracleSwapPool.sol";

/**
 * @notice Deploys Velanos to Robinhood Chain testnet against the tokens already there: Paxos USDG and
 *         the faucet's tokenised stocks. Nothing is minted or mocked.
 *
 *         Testnet stock tokens have no price feed, so each price is set by a dedicated updater key from a
 *         live market quote (see apps/watcher). The oracle exposes the updater role publicly and the
 *         UI says where prices come from.
 *
 *         Prices are passed in as 8-decimal USD integers: PRICE_TSLA, PRICE_AMZN, PRICE_AMD, PRICE_PLTR,
 *         PRICE_NFLX.
 */
contract DeployRobinhood is Deploy {
    address constant USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant AMZN = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02;
    address constant AMD = 0x71178BAc73cBeb415514eB542a8995b82669778d;
    address constant PLTR = 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0;
    address constant NFLX = 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93;

    // Each pool holds one stock and a little USDG, so a buy and a sell can both settle.
    uint256 constant POOL_USDG = 8e6;
    uint256 constant POOL_STOCK = 1 ether;

    function run() external pure override {
        revert("use deploy()");
    }

    function deploy() external {
        require(block.chainid == 46630, "Robinhood Chain testnet only");
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
        d.oracle.grantUpdater(vm.addr(vm.envUint("PRICE_UPDATER_PK")));

        d.stockAdapter = new StockSwapAdapter(USDG, address(d.factory), deployer);
        d.factory.setAdapterAllowed(address(d.stockAdapter), true);

        address[5] memory tokens = [TSLA, AMZN, AMD, PLTR, NFLX];
        string[5] memory tickers = ["TSLA", "AMZN", "AMD", "PLTR", "NFLX"];
        string[5] memory names = ["Tesla", "Amazon", "AMD", "Palantir", "Netflix"];
        string[5] memory priceKeys = ["PRICE_TSLA", "PRICE_AMZN", "PRICE_AMD", "PRICE_PLTR", "PRICE_NFLX"];

        string memory assets = string.concat(
            "{",
            '"USDG":{"address":"', vm.toString(USDG), '","decimals":6,"symbol":"USDG","name":"Global Dollar"}'
        );
        for (uint256 k; k < 5; ++k) {
            d.oracle.setPrice(tokens[k], vm.envUint(priceKeys[k]));
            OracleSwapPool pool = new OracleSwapPool(USDG, tokens[k], address(d.oracle), deployer);
            d.stockAdapter.setPool(tokens[k], address(pool));
            IERC20(USDG).approve(address(pool), POOL_USDG);
            IERC20(tokens[k]).approve(address(pool), POOL_STOCK);
            pool.seed(POOL_USDG, POOL_STOCK);
            pool.setParams(30, 20_000e8);

            assets = string.concat(
                assets, ',"', tickers[k], '":{"address":"', vm.toString(tokens[k]),
                '","decimals":18,"symbol":"', tickers[k], '","name":"', names[k],
                '","pool":"', vm.toString(address(pool)), '"}'
            );
        }
        vm.stopBroadcast();

        _writeDeployment(d, string.concat(assets, "}"));
    }
}
