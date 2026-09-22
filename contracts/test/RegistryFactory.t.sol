// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Harness} from "./Harness.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {FreezeReason, Mandate, VaultKind} from "../src/AegisTypes.sol";

contract RegistryFactoryTest is Harness {
    // ──────────────────────────────── registry ────────────────────────────────

    function test_register_storesTheAgentAndIndexesTheSigner() public view {
        AgentRegistry.Agent memory a = registry.agent(agentId);
        assertEq(a.operator, operator);
        assertEq(a.signer, agentSigner);
        assertEq(a.name, "Delta");
        assertEq(registry.agentIdBySigner(agentSigner), agentId);
    }

    /// @dev One signer, one agent — otherwise a track record could be forked and laundered.
    function test_register_rejectsADuplicateSigner() public {
        vm.prank(makeAddr("other-operator"));
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.SignerAlreadyRegistered.selector, agentSigner));
        registry.register(agentSigner, "Copy", "", 0);
    }

    function test_requiredBondBps_startsAtTheTierBaseRate() public view {
        assertEq(registry.requiredBondBps(agentId, 0), 1_500);
        assertEq(registry.requiredBondBps(agentId, 1), 2_500);
        assertEq(registry.requiredBondBps(agentId, 2), 4_000);
    }

    /// @dev The incentive that makes an agent accept liability at all: a clean record makes
    ///      outside capital cheaper to access.
    function test_requiredBondBps_fallsWithEachCleanSeason() public {
        _settleCleanly();
        assertEq(registry.requiredBondBps(agentId, 1), 2_250, "one clean season: 25% down to 22.5%");
        _settleCleanly();
        assertEq(registry.requiredBondBps(agentId, 1), 2_000);
    }

    /// @dev Discounts stop at half the base. A perfect record still posts real first-loss
    ///      capital, because the bond is the product, not a loyalty fee.
    function test_requiredBondBps_neverFallsBelowHalfTheBase() public {
        for (uint256 k; k < 20; ++k) {
            _settleCleanly();
        }
        assertEq(registry.requiredBondBps(agentId, 1), 1_250);
    }

    function test_recordSettlement_onlyCallableByAVault() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotAVault.selector, operator));
        registry.recordSettlement(agentId, true);
    }

    // ───────────────────────────────── factory ────────────────────────────────

    function test_createVault_registersTheVaultEverywhere() public view {
        assertTrue(factory.isVault(address(vault)));
        assertTrue(bond.isRegisteredVault(address(vault)));
        assertEq(factory.vaultCount(), 1);
    }

    function test_createVault_onlyTheOperatorMayCreate() public {
        vm.prank(depositor);
        vm.expectRevert(VaultFactory.NotOperator.selector);
        factory.createVault(agentId, spotMandate(1_000 * ONE_USDG), "Hijack", "aH");
    }

    function test_createVault_rejectsAMandateWithTheWrongSigner() public {
        Mandate memory m = spotMandate(1_000 * ONE_USDG);
        m.agentSigner = rogueSigner;

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.SignerMismatch.selector, rogueSigner, agentSigner));
        factory.createVault(agentId, m, "Wrong", "aW");
    }

    /**
     * @dev Checked here rather than trusted from the operator. Without it, an operator could
     *      advertise a 1,000 allocation behind a 1-token bond and the loss floor shown to
     *      depositors would be fiction.
     */
    function test_createVault_enforcesTheBondFloorForTheTier() public {
        Mandate memory m = spotMandate(1_000 * ONE_USDG);
        m.bondRequired = 249 * ONE_USDG; // tier 1 needs 25% of 1,000

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.BondTooSmall.selector, 249 * ONE_USDG, 250 * ONE_USDG)
        );
        factory.createVault(agentId, m, "Thin", "aT");
    }

    function test_createVault_acceptsExactlyTheRequiredBond() public {
        Mandate memory m = spotMandate(1_000 * ONE_USDG);
        m.bondRequired = 250 * ONE_USDG;

        vm.prank(operator);
        (address addr,) = factory.createVault(agentId, m, "Exact", "aE");
        assertTrue(factory.isVault(addr));
    }

    function test_createVault_rejectsAnAdapterThatIsNotGloballyAllowed() public {
        address rogue = makeAddr("rogue-adapter");
        Mandate memory m = spotMandate(1_000 * ONE_USDG);
        m.allowedAdapters[0] = rogue;

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.AdapterNotGloballyAllowed.selector, rogue));
        factory.createVault(agentId, m, "Rogue", "aR");
    }

    function test_createVault_rejectsAnInvertedTerm() public {
        Mandate memory m = spotMandate(1_000 * ONE_USDG);
        m.expiry = m.start;

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.BadTerm.selector, m.start, m.expiry));
        factory.createVault(agentId, m, "Bad", "aB");
    }

    function test_createVault_rejectsEmptyAssetAndAdapterSets() public {
        Mandate memory m = spotMandate(1_000 * ONE_USDG);
        m.allowedAssets = new address[](0);

        vm.prank(operator);
        vm.expectRevert(VaultFactory.EmptyArray.selector);
        factory.createVault(agentId, m, "Empty", "aE");
    }

    function test_createVault_capsTheAllowlistLength() public {
        Mandate memory m = spotMandate(1_000 * ONE_USDG);
        m.allowedAssets = new address[](9);
        for (uint256 k; k < 9; ++k) {
            m.allowedAssets[k] = address(tsla);
        }

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.TooManyEntries.selector, 9));
        factory.createVault(agentId, m, "Wide", "aW");
    }

    function test_createVault_mandateHashIsStableAndImmutable() public view {
        assertEq(vault.mandateHash(), keccak256(abi.encode(vault.mandate())));
    }

    /// @dev Everything downstream trusts `isVault`, so a look-alike vault with a mandate of its
    ///      own choosing must not be able to reach the court or the bond manager.
    function test_isVault_isFalseForAnImpostor() public {
        assertFalse(factory.isVault(makeAddr("impostor")));
    }

    function test_wire_canOnlyHappenOnce() public {
        vm.prank(deployer);
        vm.expectRevert(VaultFactory.AlreadyWired.selector);
        factory.wire(address(registry), address(court), address(bond), guardian);
    }

    function _settleCleanly() internal {
        uint256 before = registry.agent(agentId).cleanSeasons;
        AegisVaultLocal v = AegisVaultLocal(address(_createSpotVault("Season", "aS", 1_000 * ONE_USDG)));
        vm.startPrank(operator);
        usdg.approve(address(bond), 300 * ONE_USDG);
        bond.stake(address(v), 300 * ONE_USDG);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 hours + 1);
        v.poke();
        v.unwind();
        v.settle();
        assertEq(registry.agent(agentId).cleanSeasons, before + 1);
    }
}

interface AegisVaultLocal {
    function poke() external;
    function unwind() external;
    function settle() external;
}
