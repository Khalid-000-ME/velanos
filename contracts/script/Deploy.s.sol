// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {AgentRegistry} from "../src/AgentRegistry.sol";
import {BondManager} from "../src/BondManager.sol";
import {PolicyGuard} from "../src/PolicyGuard.sol";
import {ViolationCourt} from "../src/ViolationCourt.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {PerpAdapterDeployer, VaultDeployer} from "../src/VaultDeployer.sol";
import {AegisPriceOracle} from "../src/oracle/AegisPriceOracle.sol";
import {StockSwapAdapter} from "../src/adapters/StockSwapAdapter.sol";
import {MockStockToken} from "../src/testenv/MockStockToken.sol";
import {MockUSDG} from "../src/testenv/MockUSDG.sol";
import {OracleSwapPool} from "../src/testenv/OracleSwapPool.sol";

/**
 * @notice Deploys the protocol and writes every address to
 *         `packages/config/deployments/<chainId>.json`.
 *
 * That file is the only place addresses live. Nothing in the apps, the SDK or the UI contains an
 * address literal, so a redeploy is a one-file change and a stale address is impossible to
 * paper over.
 *
 * The integration modes (`USDG_MODE`, `STOCK_TOKEN_MODE`, `PERP_MODE`) are recorded in the same
 * file and surfaced in the UI status bar, so what is real and what is a test stand-in is always
 * visible rather than implied.
 */
contract Deploy is Script {
    using stdJson for string;

    struct Deployed {
        AegisPriceOracle oracle;
        PolicyGuard guard;
        VaultFactory factory;
        AgentRegistry registry;
        ViolationCourt court;
        BondManager bond;
        StockSwapAdapter stockAdapter;
        MockUSDG usdg;
    }

    uint64 internal warnCooldown;
    uint64 internal settleGrace;
    uint64 internal bondCooldown;

    string internal usdgMode;
    string internal stockMode;
    string internal perpMode;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);

        warnCooldown = uint64(vm.envOr("WARN_COOLDOWN_SECONDS", uint256(120)));
        settleGrace = uint64(vm.envOr("SETTLE_GRACE_SECONDS", uint256(300)));
        bondCooldown = uint64(vm.envOr("BOND_COOLDOWN_SECONDS", uint256(300)));
        usdgMode = vm.envOr("USDG_MODE", string("mock"));
        stockMode = vm.envOr("STOCK_TOKEN_MODE", string("mock"));
        perpMode = vm.envOr("PERP_MODE", string("gmx"));

        console2.log("deployer", deployer);
        console2.log("chainId", block.chainid);

        vm.startBroadcast(pk);
        Deployed memory d = _deployCore(deployer);
        string memory assetsJson = _deployTestEnv(d, deployer);
        vm.stopBroadcast();

        _writeDeployment(d, assetsJson);
    }

    function _deployCore(address deployer) internal returns (Deployed memory d) {
        d.oracle = new AegisPriceOracle(deployer);
        d.guard = new PolicyGuard();
        d.factory = new VaultFactory(address(d.guard), address(d.oracle), warnCooldown, settleGrace, deployer);
        d.registry = new AgentRegistry(address(d.factory));
        d.court = new ViolationCourt(address(d.guard), address(d.factory));
        d.bond = new BondManager(address(d.court), address(d.factory), bondCooldown);

        // The vault's creation code lives in its own contract so the factory stays under the
        // EIP-170 size limit; see VaultDeployer.
        d.factory.setDeployers(
            address(new VaultDeployer(address(d.factory))), address(new PerpAdapterDeployer(address(d.factory)))
        );
        d.factory.wire(address(d.registry), address(d.court), address(d.bond), deployer);
        d.factory.setPerpModeMock(_eq(perpMode, "mock"));
    }

    /**
     * @dev Deploys the settlement token, the stock tokens and one oracle-priced pool per stock,
     *      then seeds every pool deeply enough that the venue is never the reason a demo fails.
     */
    function _deployTestEnv(Deployed memory d, address deployer) internal returns (string memory assetsJson) {
        d.usdg = new MockUSDG(deployer);
        d.oracle.pinSettlementAsset(address(d.usdg));

        d.stockAdapter = new StockSwapAdapter(address(d.usdg), address(d.factory), deployer);
        d.factory.setAdapterAllowed(address(d.stockAdapter), true);

        d.usdg.mint(deployer, 10_000_000e6);

        string[5] memory symbols = ["TSLA", "AMZN", "AMD", "PLTR", "NFLX"];
        string[5] memory names =
            ["Test Tesla", "Test Amazon", "Test AMD", "Test Palantir", "Test Netflix"];
        string[5] memory tickers = ["tTSLA", "tAMZN", "tAMD", "tPLTR", "tNFLX"];
        // Round demo prices, in 8-decimal USD. Labelled as test prices everywhere they appear.
        uint256[5] memory prices = [uint256(250e8), 200e8, 160e8, 40e8, 700e8];

        assetsJson = "{";
        assetsJson = string.concat(
            assetsJson,
            '"USDG":{"address":"',
            vm.toString(address(d.usdg)),
            '","decimals":6,"symbol":"tUSDG","name":"Test Global Dollar"}'
        );

        for (uint256 k; k < symbols.length; ++k) {
            MockStockToken token = new MockStockToken(names[k], tickers[k], 18, deployer);
            d.oracle.setPrice(address(token), prices[k]);

            OracleSwapPool pool =
                new OracleSwapPool(address(d.usdg), address(token), address(d.oracle), deployer);
            d.stockAdapter.setPool(address(token), address(pool));

            // Forbidden stocks (PLTR, NFLX) still get a pool: a violation must be rejected by the
            // mandate, never by a missing venue, or the demo would prove the wrong thing.
            token.mint(deployer, 200_000e18);
            d.usdg.approve(address(pool), type(uint256).max);
            token.approve(address(pool), type(uint256).max);
            pool.seed(400_000e6, 10_000e18);

            assetsJson = string.concat(
                assetsJson,
                ',"',
                symbols[k],
                '":{"address":"',
                vm.toString(address(token)),
                '","decimals":18,"symbol":"',
                tickers[k],
                '","name":"',
                names[k],
                '","pool":"',
                vm.toString(address(pool)),
                '"}'
            );
        }
        assetsJson = string.concat(assetsJson, "}");
    }

    function _writeDeployment(Deployed memory d, string memory assetsJson) internal {
        string memory path =
            string.concat(vm.projectRoot(), "/../packages/config/deployments/", vm.toString(block.chainid), ".json");

        string memory contracts = string.concat(
            "{",
            '"AegisPriceOracle":"', vm.toString(address(d.oracle)), '",',
            '"PolicyGuard":"', vm.toString(address(d.guard)), '",',
            '"AgentRegistry":"', vm.toString(address(d.registry)), '",',
            '"BondManager":"', vm.toString(address(d.bond)), '",',
            '"ViolationCourt":"', vm.toString(address(d.court)), '",',
            '"VaultFactory":"', vm.toString(address(d.factory)), '",',
            '"StockSwapAdapter":"', vm.toString(address(d.stockAdapter)), '"',
            "}"
        );

        string memory mode = string.concat(
            '{"usdg":"', usdgMode, '","stocks":"', stockMode, '","perp":',
            _eq(perpMode, "gmx") ? '"gmx"' : '"mock"', "}"
        );

        string memory json = string.concat(
            "{",
            '"chainId":', vm.toString(block.chainid), ",",
            '"mode":', mode, ",",
            '"contracts":', contracts, ",",
            '"assets":', assetsJson, ",",
            '"deployedAtBlock":', vm.toString(block.number),
            "}"
        );

        vm.writeFile(path, json);
        console2.log("wrote", path);
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
