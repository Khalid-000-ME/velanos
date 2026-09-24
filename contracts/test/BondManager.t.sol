// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Harness} from "./Harness.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {BondManager} from "../src/BondManager.sol";
import {CompensationKind, FreezeReason, TradeIntent, VaultState} from "../src/AegisTypes.sol";

contract BondManagerTest is Harness {
    function test_stake_activatesVaultAtThreshold() public {
        vm.prank(operator);
        (address addr,) = factory.createVault(agentId, spotMandate(1_000 * ONE_USDG), "Fresh", "aF");
        AegisVault v = AegisVault(addr);
        assertEq(uint8(v.state()), uint8(VaultState.PENDING_BOND));

        vm.startPrank(operator);
        usdg.approve(address(bond), 300 * ONE_USDG);
        bond.stake(addr, 299 * ONE_USDG);
        assertEq(uint8(v.state()), uint8(VaultState.PENDING_BOND), "one short is still short");

        bond.stake(addr, 1 * ONE_USDG);
        vm.stopPrank();
        assertEq(uint8(v.state()), uint8(VaultState.ACTIVE));
    }

    function test_stake_onlyOperator() public {
        vm.startPrank(depositor);
        usdg.approve(address(bond), 300 * ONE_USDG);
        vm.expectRevert(abi.encodeWithSelector(BondManager.OnlyOperator.selector, depositor));
        bond.stake(address(vault), 300 * ONE_USDG);
        vm.stopPrank();
    }

    function test_slash_onlyCourt() public {
        vm.prank(watcher);
        vm.expectRevert(abi.encodeWithSelector(BondManager.OnlyCourt.selector, watcher));
        bond.slash(address(vault), 1, watcher, 1_000, CompensationKind.PENALTY);
    }

    /// @dev The fairness story rests on this split: depositors get the penalty, and whoever
    ///      surfaced it gets a cut. Only the reporting path pays, so that is the path under test.
    function test_slash_splitsPenaltyBetweenDepositorsAndReporter() public {
        uint256 vaultCashBefore = usdg.balanceOf(address(vault));

        TradeIntent memory i = buyIntent(vault, address(pltr), 100 * ONE_USDG, 1);
        bytes memory sig = signAsAgent(vault, i);
        vm.prank(watcher);
        court.reportSignedViolation(i, sig);

        assertEq(bondAvailable(vault), 250 * ONE_USDG);
        assertEq(usdg.balanceOf(watcher), 5 * ONE_USDG, "10% of 50");
        assertEq(usdg.balanceOf(address(vault)), vaultCashBefore + 45 * ONE_USDG);
    }

    /**
     * @dev A bounty is payment for *discovering* misconduct, and reaching `execute` requires no
     *      discovery — the vault caught it unaided. Paying here would also leave a farm open that no
     *      allowlist can close, because an operator can submit from a third address it controls.
     */
    function test_slash_payesNoBountyWhenTheVaultCatchesItInline() public {
        uint256 vaultCashBefore = usdg.balanceOf(address(vault));
        uint256 watcherBefore = usdg.balanceOf(watcher);

        executeAsWatcher(vault, buyIntent(vault, address(pltr), 100 * ONE_USDG, 1));

        assertEq(bondAvailable(vault), 250 * ONE_USDG);
        assertEq(usdg.balanceOf(watcher), watcherBefore, "the execute path never pays a bounty");
        assertEq(
            usdg.balanceOf(address(vault)),
            vaultCashBefore + 50 * ONE_USDG,
            "every cent of the penalty goes to depositors"
        );
    }

    /// @dev The specific farm this closes: the agent's own transaction key is not the signer and not
    ///      the operator, so an address check alone would have paid it.
    function test_slash_agentCannotFarmTheBountyFromAThirdKey() public {
        address agentGasKey = makeAddr("agent-gas-key");
        uint256 vaultCashBefore = usdg.balanceOf(address(vault));

        bytes memory sig = signAsAgent(vault, buyIntent(vault, address(pltr), 100 * ONE_USDG, 1));
        vm.prank(agentGasKey);
        vault.execute(buyIntent(vault, address(pltr), 100 * ONE_USDG, 1), sig);

        assertEq(usdg.balanceOf(agentGasKey), 0, "a fresh key must not recover the bounty");
        assertEq(usdg.balanceOf(address(vault)), vaultCashBefore + 50 * ONE_USDG);
    }

    function test_slash_noBountyWhenTheOperatorSubmits() public {
        uint256 vaultCashBefore = usdg.balanceOf(address(vault));
        uint256 opBefore = usdg.balanceOf(operator);

        bytes memory sig = signAsAgent(vault, buyIntent(vault, address(pltr), 100 * ONE_USDG, 1));
        vm.prank(operator);
        vault.execute(buyIntent(vault, address(pltr), 100 * ONE_USDG, 1), sig);

        assertEq(usdg.balanceOf(operator), opBefore);
        assertEq(usdg.balanceOf(address(vault)), vaultCashBefore + 50 * ONE_USDG);
    }

    /// @dev A bond that cannot cover the penalty must still pay what it has. Reverting would
    ///      leave depositors with nothing and hand the agent an escape hatch.
    function test_slash_paysWhatItCanWhenTheBondRunsShort() public {
        // Six violations at 50 each against a 300 bond: the last one has nothing left to take.
        for (uint256 n = 1; n <= 6; ++n) {
            vm.warp(block.timestamp + 1);
            bytes memory sig = signAsAgent(vault, buyIntent(vault, address(pltr), 100 * ONE_USDG, n));
            vm.prank(watcher);
            vault.execute(buyIntent(vault, address(pltr), 100 * ONE_USDG, n), sig);
        }
        assertEq(bondAvailable(vault), 0);

        vm.warp(block.timestamp + 1);
        bytes memory sig7 = signAsAgent(vault, buyIntent(vault, address(pltr), 100 * ONE_USDG, 7));
        vm.prank(watcher);
        vault.execute(buyIntent(vault, address(pltr), 100 * ONE_USDG, 7), sig7);

        assertEq(bondAvailable(vault), 0, "an exhausted bond stays at zero rather than reverting");
    }

    function test_release_onlyAfterSettlementAndCooldown() public {
        vm.prank(guardian);
        vault.freeze(FreezeReason.GUARDIAN);
        vault.unwind();
        vault.settle();

        vm.prank(operator);
        vm.expectRevert();
        bond.release(address(vault));

        vm.warp(block.timestamp + BOND_COOLDOWN + 1);
        uint256 before = usdg.balanceOf(operator);
        vm.prank(operator);
        bond.release(address(vault));

        assertEq(usdg.balanceOf(operator), before + 300 * ONE_USDG);
        assertEq(bondAvailable(vault), 0);
    }

    function test_release_blockedWhileStillTrading() public {
        vm.warp(block.timestamp + BOND_COOLDOWN + 1);
        vm.prank(operator);
        vm.expectRevert();
        bond.release(address(vault));
    }

    function test_release_onlyOperator() public {
        vm.prank(guardian);
        vault.freeze(FreezeReason.GUARDIAN);
        vault.unwind();
        vault.settle();
        vm.warp(block.timestamp + BOND_COOLDOWN + 1);

        vm.prank(watcher);
        vm.expectRevert(abi.encodeWithSelector(BondManager.OnlyOperator.selector, watcher));
        bond.release(address(vault));
    }

    function test_bondOf_tracksSlashedTotalSeparatelyFromAvailable() public {
        executeAsWatcher(vault, buyIntent(vault, address(pltr), 100 * ONE_USDG, 1));
        (uint256 available, uint256 slashedTotal,) = bond.bondOf(address(vault));
        assertEq(available, 250 * ONE_USDG);
        assertEq(slashedTotal, 50 * ONE_USDG);
        assertEq(bond.stakedTotal(address(vault)), 300 * ONE_USDG);
    }

    /// @notice The number the fund screen shows before anyone deposits.
    function test_coverageBps_reportsTheUnbackedRemainder() public view {
        assertEq(bond.coverageBps(address(vault), 300 * ONE_USDG), 10_000, "fully backed");
        assertEq(bond.coverageBps(address(vault), 600 * ONE_USDG), 5_000, "half backed");
    }
}
