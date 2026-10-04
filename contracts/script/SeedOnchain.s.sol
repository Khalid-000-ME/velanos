// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {VelanosVault} from "../src/VelanosVault.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {BondManager} from "../src/BondManager.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {Mandate, VaultKind} from "../src/VelanosTypes.sol";

/**
 * @notice Opens one vault on the live deployment of the current chain (SEED_ASSETS, SEED_VAULT_NAME, SEED_VAULT_SYMBOL, SEED_METADATA) using the operator's and depositor's own USDG.
 *
 *         Sizes are set by what the wallets actually hold (50 USDG of bond, 80 USDG of deposit), kept
 *         in the same proportions as the protocol's tier-1 rules: a bond of a quarter of the
 *         allocation cap, an 8% loss floor and a per-violation penalty a fifth of the bond.
 */
contract SeedOnchain is Script {
    using stdJson for string;

    uint256 constant ONE_USDG = 1e6;

    function run() external {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../packages/config/deployments/", vm.toString(block.chainid), ".json"));
        AgentRegistry registry = AgentRegistry(json.readAddress(".contracts.AgentRegistry"));
        VaultFactory factory = VaultFactory(json.readAddress(".contracts.VaultFactory"));
        BondManager bond = BondManager(json.readAddress(".contracts.BondManager"));
        address adapter = json.readAddress(".contracts.StockSwapAdapter");
        address usdg = json.readAddress(".assets.USDG.address");
        string[] memory tickers = vm.envString("SEED_ASSETS", ",");

        uint256 operatorPk = vm.envUint("OPERATOR_PK");
        uint256 depositorPk = vm.envUint("DEPOSITOR_PK");
        address operator = vm.addr(operatorPk);
        address depositor = vm.addr(depositorPk);
        address agentSigner = vm.addr(vm.envUint("AGENT_SIGNER_PK"));

        address[] memory assets = new address[](tickers.length);
        for (uint256 i; i < tickers.length; ++i) {
            assets[i] = json.readAddress(string.concat(".assets.", tickers[i], ".address"));
        }
        address[] memory adapters = new address[](1);
        adapters[0] = adapter;

        vm.startBroadcast(operatorPk);
        uint256 agentId = registry.register(agentSigner, "Delta", "ipfs://delta", 0);

        Mandate memory m = Mandate({
            agentSigner: agentSigner,
            operator: operator,
            settlementAsset: usdg,
            kind: VaultKind.SPOT,
            allowedAssets: assets,
            allowedAdapters: adapters,
            maxAllocation: 200 * ONE_USDG,
            maxTradeAmount: 30 * ONE_USDG,
            maxAssetExposureBps: 4_000,
            maxSlippageBps: 100,
            maxLeverageBps: 10_000,
            maxDrawdownBps: 800,
            maxDailyLossBps: 300,
            start: uint64(block.timestamp),
            expiry: uint64(block.timestamp) + 14 days,
            bondRequired: 50 * ONE_USDG,
            perViolationPenalty: 10 * ONE_USDG,
            reporterBountyBps: 1_000,
            riskTier: 1,
            metadataURI: vm.envString("SEED_METADATA")
        });
        (address vault,) = factory.createVault(agentId, m, vm.envString("SEED_VAULT_NAME"), vm.envString("SEED_VAULT_SYMBOL"));

        IERC20(usdg).approve(address(bond), 50 * ONE_USDG);
        bond.stake(vault, 50 * ONE_USDG);
        vm.stopBroadcast();

        vm.startBroadcast(depositorPk);
        IERC20(usdg).approve(vault, 80 * ONE_USDG);
        VelanosVault(vault).deposit(80 * ONE_USDG, depositor);
        vm.stopBroadcast();

        console2.log("agentId", agentId);
        console2.log("vault A  Delta ETH I", vault);
        vm.writeFile(
            string.concat(vm.projectRoot(), "/../packages/config/deployments/seed-", vm.toString(block.chainid), ".json"),
            string.concat(
                '{"chainId":', vm.toString(block.chainid), ',"agentId":', vm.toString(agentId), ',"vaults":{"A":"', vm.toString(vault), '"}}'
            )
        );
    }
}
