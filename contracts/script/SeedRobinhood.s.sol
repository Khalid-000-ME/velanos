// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {VelanosVault} from "../src/VelanosVault.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {BondManager} from "../src/BondManager.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MockUSDG} from "../src/testenv/MockUSDG.sol";
import {Mandate, VaultKind} from "../src/VelanosTypes.sol";

/**
 * @notice Creates the five demo vaults (A–E) described in the demo runbook and funds them.
 *
 * Each vault exists to carry specific scenarios, and a fresh seed produces fresh addresses so the
 * whole demo can be replayed from scratch between takes. Vault E is deliberately given a 3-minute
 * term so the "agent keeps signing after expiry" scenario can run inside a demo slot.
 */
contract SeedRobinhood is Script {
    using stdJson for string;

    uint256 internal constant ONE_USDG = 1e6;

    AgentRegistry internal registry;
    VaultFactory internal factory;
    BondManager internal bond;
    MockUSDG internal usdg;

    address internal agentSigner;
    address internal operator;
    address internal depositor;
    uint256 internal agentId;

    address[5] internal vaults;

    function run() external {
        string memory json = vm.readFile(_deploymentPath());
        registry = AgentRegistry(json.readAddress(".contracts.AgentRegistry"));
        factory = VaultFactory(json.readAddress(".contracts.VaultFactory"));
        bond = BondManager(json.readAddress(".contracts.BondManager"));
        usdg = MockUSDG(json.readAddress(".assets.USDG.address"));

        address stockAdapter = json.readAddress(".contracts.StockSwapAdapter");
        address tsla = json.readAddress(".assets.TSLA.address");
        address amzn = json.readAddress(".assets.AMZN.address");
        address amd = json.readAddress(".assets.AMD.address");

        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        uint256 operatorPk = vm.envUint("OPERATOR_PK");
        uint256 depositorPk = vm.envUint("DEPOSITOR_PK");
        agentSigner = vm.addr(vm.envUint("AGENT_SIGNER_PK"));
        operator = vm.addr(operatorPk);
        depositor = vm.addr(depositorPk);

        // Fund the demo wallets from the deployer's mint.
        vm.startBroadcast(deployerPk);
        usdg.mint(operator, 50_000 * ONE_USDG);
        usdg.mint(depositor, 50_000 * ONE_USDG);
        vm.stopBroadcast();

        vm.startBroadcast(operatorPk);
        agentId = registry.register(agentSigner, "Delta", "ipfs://delta", 0);

        address[] memory assets = new address[](3);
        (assets[0], assets[1], assets[2]) = (tsla, amzn, amd);
        address[] memory adapters = new address[](1);
        adapters[0] = stockAdapter;

        // Share symbols follow the vault, not the agent: a depositor holds a claim on a mandate, and
        // the agent behind it can be slashed out of relevance without the ticker becoming a lie.
        vaults[0] = _create(assets, adapters, 2 hours, "Delta Equities I", "aEQ1");
        vaults[2] = _create(assets, adapters, 2 hours, "Delta Equities II", "aEQ2");
        vaults[3] = _create(assets, adapters, 2 hours, "Delta Equities III", "aEQ3");
        // Vault IV carries a deliberately short term so the post-expiry scenario fits a demo slot.
        // The term is metadata the UI surfaces as a countdown, never part of the name.
        vaults[4] = _create(assets, adapters, 3 minutes, "Delta Equities IV", "aEQ4");

        usdg.approve(address(bond), 1_200 * ONE_USDG);
        bond.stake(vaults[0], 300 * ONE_USDG);
        bond.stake(vaults[2], 300 * ONE_USDG);
        bond.stake(vaults[3], 300 * ONE_USDG);
        bond.stake(vaults[4], 300 * ONE_USDG);
        vm.stopBroadcast();

        vm.startBroadcast(depositorPk);
        _fund(vaults[0], 1_000 * ONE_USDG);
        _fund(vaults[2], 1_000 * ONE_USDG);
        _fund(vaults[3], 1_000 * ONE_USDG);
        _fund(vaults[4], 1_000 * ONE_USDG);
        vm.stopBroadcast();

        console2.log("agentId", agentId);
        console2.log("vault A  Delta Equities I   (scenarios 0-2)", vaults[0]);
        console2.log("vault C  Delta Equities II  (scenario 4)  ", vaults[2]);
        console2.log("vault D  Delta Equities III (scenario 6)  ", vaults[3]);
        console2.log("vault E  Delta Equities IV  (scenario 5)  ", vaults[4]);
        _writeSeedFile();
    }

    function _create(
        address[] memory assets,
        address[] memory adapters,
        uint64 term,
        string memory name,
        string memory symbol
    ) internal returns (address vault) {
        Mandate memory m = Mandate({
            agentSigner: agentSigner,
            operator: operator,
            settlementAsset: address(usdg),
            kind: VaultKind.SPOT,
            allowedAssets: assets,
            allowedAdapters: adapters,
            maxAllocation: 1_000 * ONE_USDG,
            maxTradeAmount: 250 * ONE_USDG,
            maxAssetExposureBps: 4_000,
            maxSlippageBps: 100,
            maxLeverageBps: 10_000,
            maxDrawdownBps: 800,
            maxDailyLossBps: 300,
            start: uint64(block.timestamp),
            expiry: uint64(block.timestamp) + term,
            // 300 against a 1,000 allocation: the tier-1 floor is 250, so this leaves headroom
            // for a drawdown top-up on top of the per-violation penalties.
            bondRequired: 300 * ONE_USDG,
            perViolationPenalty: 50 * ONE_USDG,
            reporterBountyBps: 1_000,
            riskTier: 1,
            metadataURI: "ipfs://mandate/delta-equities"
        });
        (vault,) = factory.createVault(agentId, m, name, symbol);
    }

    function _fund(address vault, uint256 amount) internal {
        usdg.approve(vault, amount);
        VelanosVault(vault).deposit(amount, depositor);
    }

    function _writeSeedFile() internal {
        string memory json = string.concat(
            '{"chainId":', vm.toString(block.chainid),
            ',"agentId":', vm.toString(agentId),
            ',"vaults":{',
            '"A":"', vm.toString(vaults[0]), '",',
            '"C":"', vm.toString(vaults[2]), '",',
            '"D":"', vm.toString(vaults[3]), '",',
            '"E":"', vm.toString(vaults[4]), '"}}'
        );
        vm.writeFile(
            string.concat(vm.projectRoot(), "/../packages/config/deployments/seed-", vm.toString(block.chainid), ".json"),
            json
        );
    }

    function _deploymentPath() internal view returns (string memory) {
        return string.concat(
            vm.projectRoot(), "/../packages/config/deployments/", vm.toString(block.chainid), ".json"
        );
    }
}
