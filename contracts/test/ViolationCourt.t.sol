// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Harness} from "./Harness.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {ViolationCourt} from "../src/ViolationCourt.sol";
import {FreezeReason, Rules, TradeIntent, VaultState} from "../src/AegisTypes.sol";

contract ViolationCourtTest is Harness {
    // ───────────────── reporting an intent that never reached a vault ──────────

    /**
     * @dev Scenario S1. This is the mechanism the whole pitch turns on: the relay refused to
     *      forward this intent, so no depositor funds were ever at risk — and the agent is still
     *      liable, because it signed it.
     */
    function test_report_slashesAnIntentThatWasNeverSubmitted() public {
        TradeIntent memory i = buyIntent(vault, address(pltr), 900 * ONE_USDG, 1);
        bytes memory sig = signAsAgent(vault, i);

        vm.prank(watcher);
        uint16 rule = court.reportSignedViolation(i, sig);

        assertEq(rule, Rules.ASSET_NOT_ALLOWED);
        assertEq(bondAvailable(vault), 250 * ONE_USDG);
        assertEq(usdg.balanceOf(watcher), 5 * ONE_USDG);
        assertEq(vault.nonceStatus(1), 2);
        assertEq(vault.staticViolationCount(), 1);
    }

    /// @dev Griefing check: a compliant intent cannot be turned into a payout.
    function test_report_revertsOnACompliantIntent() public {
        TradeIntent memory i = buyIntent(vault, address(tsla), 150 * ONE_USDG, 1);
        bytes memory sig = signAsAgent(vault, i);

        vm.prank(watcher);
        vm.expectRevert(ViolationCourt.NotAViolation.selector);
        court.reportSignedViolation(i, sig);
    }

    function test_report_revertsOnAForgedSignature() public {
        TradeIntent memory i = buyIntent(vault, address(pltr), 900 * ONE_USDG, 1);
        bytes memory sig = sign(vault, i, roguePk);

        vm.prank(watcher);
        vm.expectRevert();
        court.reportSignedViolation(i, sig);
    }

    /// @dev One slash per nonce, so the same evidence cannot be cashed twice.
    function test_report_cannotBeReportedTwice() public {
        TradeIntent memory i = buyIntent(vault, address(pltr), 900 * ONE_USDG, 1);
        bytes memory sig = signAsAgent(vault, i);

        vm.prank(watcher);
        court.reportSignedViolation(i, sig);

        vm.prank(watcher);
        vm.expectRevert(abi.encodeWithSelector(ViolationCourt.NonceAlreadyResolved.selector, 1));
        court.reportSignedViolation(i, sig);
    }

    function test_report_cannotReportAnAlreadyExecutedNonce() public {
        TradeIntent memory good = buyIntent(vault, address(tsla), 150 * ONE_USDG, 1);
        executeAsWatcher(vault, good);

        TradeIntent memory bad = buyIntent(vault, address(pltr), 900 * ONE_USDG, 1);
        bytes memory sig = signAsAgent(vault, bad);
        vm.prank(watcher);
        vm.expectRevert(abi.encodeWithSelector(ViolationCourt.NonceAlreadyResolved.selector, 1));
        court.reportSignedViolation(bad, sig);
    }

    function test_report_rejectsAnUnknownVault() public {
        TradeIntent memory i = buyIntent(vault, address(pltr), 900 * ONE_USDG, 1);
        i.vault = makeAddr("imposter");
        bytes memory sig = signAsAgent(vault, i);

        vm.prank(watcher);
        vm.expectRevert();
        court.reportSignedViolation(i, sig);
    }

    function test_report_noBountyWhenTheAgentReportsItself() public {
        TradeIntent memory i = buyIntent(vault, address(pltr), 900 * ONE_USDG, 1);
        bytes memory sig = signAsAgent(vault, i);

        uint256 vaultCashBefore = usdg.balanceOf(address(vault));
        vm.prank(agentSigner);
        court.reportSignedViolation(i, sig);

        assertEq(usdg.balanceOf(agentSigner), 0);
        assertEq(usdg.balanceOf(address(vault)), vaultCashBefore + 50 * ONE_USDG);
    }

    // ───────────────────────────── drawdown breaker ────────────────────────────

    function test_tripDrawdown_revertsWhileAboveTheFloor() public {
        vm.expectRevert();
        court.tripDrawdown(address(vault));
    }

    /**
     * @notice Scenario S6 end to end: an honest agent, a bad market, and a floor that holds.
     *
     * @dev This is the test that proves the headline promise is arithmetic rather than
     *      marketing. Nothing here is a rule violation — the agent stayed inside every limit.
     *      The market moved, NAV fell through the floor, and the bond closed the gap.
     */
    function test_drawdown_bondRestoresDepositorsToTheFloor() public {
        // Within-mandate positions: 250 + 140 of TSLA, 250 + 140 of AMZN. All inside the 40% cap.
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 250 * ONE_USDG, 1));
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 140 * ONE_USDG, 2));
        executeAsWatcher(vault, buyIntent(vault, address(amzn), 250 * ONE_USDG, 3));
        executeAsWatcher(vault, buyIntent(vault, address(amzn), 140 * ONE_USDG, 4));

        assertEq(vault.staticViolationCount(), 0, "the agent did nothing wrong");
        uint256 floorWad = vault.floorPricePerShareWad();

        _shock(address(tsla), -2_000); // TSLA −20%
        _shock(address(amzn), -1_250); // AMZN −12.5%
        vault.poke();

        assertLt(vault.pricePerShareWad(), floorWad, "NAV should now be through the floor");

        // Anyone can run the breaker; here it is the watcher, as in production.
        vm.prank(watcher);
        court.tripDrawdown(address(vault));
        assertEq(uint8(vault.state()), uint8(VaultState.FROZEN));
        assertEq(uint8(vault.freezeReason()), uint8(FreezeReason.DRAWDOWN));

        vault.unwind();

        uint256 bondBefore = bondAvailable(vault);
        uint256 shortfall = vault.drawdownShortfall();
        assertGt(shortfall, 0);

        vm.prank(watcher);
        uint256 paid = court.compensateDrawdown(address(vault));

        assertEq(paid, shortfall, "the bond covered the whole gap");
        assertEq(bondAvailable(vault), bondBefore - paid);
        assertGe(vault.pricePerShareWad() + 1, vault.floorPricePerShareWad(), "back at the floor");

        vault.settle();
        assertEq(registry.agent(agentId).slashCount, 1, "a drawdown is not a clean season");
    }

    function test_drawdown_cannotBeCompensatedTwice() public {
        _driveVaultThroughFloor();
        vm.prank(watcher);
        court.tripDrawdown(address(vault));
        vault.unwind();

        vm.prank(watcher);
        court.compensateDrawdown(address(vault));

        vm.prank(watcher);
        vm.expectRevert(ViolationCourt.AlreadyCompensated.selector);
        court.compensateDrawdown(address(vault));
    }

    /// @dev Compensating a paper shortfall would either overpay or underpay once the unwind
    ///      actually prints, so the court insists on realised cash first.
    function test_drawdown_cannotBeCompensatedBeforeTheUnwind() public {
        _driveVaultThroughFloor();
        vm.prank(watcher);
        court.tripDrawdown(address(vault));

        vm.prank(watcher);
        vm.expectRevert(ViolationCourt.PositionsStillOpen.selector);
        court.compensateDrawdown(address(vault));
    }

    /// @dev When the bond cannot cover the gap, depositors get everything it holds and the
    ///      remainder stays visible rather than being quietly absorbed.
    function test_drawdown_payoutIsCappedByTheBond() public {
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 250 * ONE_USDG, 1));
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 140 * ONE_USDG, 2));
        executeAsWatcher(vault, buyIntent(vault, address(amzn), 250 * ONE_USDG, 3));
        executeAsWatcher(vault, buyIntent(vault, address(amzn), 140 * ONE_USDG, 4));

        _shock(address(tsla), -9_000);
        _shock(address(amzn), -9_000);
        vault.poke();

        vm.prank(watcher);
        court.tripDrawdown(address(vault));
        vault.unwind();

        uint256 shortfall = vault.drawdownShortfall();
        vm.prank(watcher);
        uint256 paid = court.compensateDrawdown(address(vault));

        assertLt(paid, shortfall, "the gap was bigger than the bond");
        assertEq(paid, 300 * ONE_USDG, "and the bond paid every cent it had");
        assertEq(bondAvailable(vault), 0);
    }

    // ───────────────────────────── late settlement ─────────────────────────────

    function test_forceSettle_revertsBeforeTheGracePeriodLapses() public {
        vm.warp(block.timestamp + 2 hours + 1);
        vm.expectRevert(ViolationCourt.NotLateYet.selector);
        court.forceSettle(address(vault));
    }

    /// @dev Walking away at expiry is itself a breach: depositors would otherwise stay exposed
    ///      to the market for as long as the agent stayed silent.
    function test_forceSettle_penalisesAnAgentThatStoppedAnswering() public {
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 250 * ONE_USDG, 1));
        vm.warp(block.timestamp + 2 hours + SETTLE_GRACE + 1);

        uint256 vaultCashBefore = usdg.balanceOf(address(vault));
        vm.prank(watcher);
        uint256 paid = court.forceSettle(address(vault));

        assertEq(paid, 50 * ONE_USDG);
        assertEq(uint8(vault.freezeReason()), uint8(FreezeReason.LATE_SETTLEMENT));
        assertEq(usdg.balanceOf(address(vault)), vaultCashBefore + 50 * ONE_USDG);
        assertEq(bondAvailable(vault), 250 * ONE_USDG);
    }

    function _driveVaultThroughFloor() internal {
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 250 * ONE_USDG, 1));
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 140 * ONE_USDG, 2));
        executeAsWatcher(vault, buyIntent(vault, address(amzn), 250 * ONE_USDG, 3));
        executeAsWatcher(vault, buyIntent(vault, address(amzn), 140 * ONE_USDG, 4));
        _shock(address(tsla), -2_000);
        _shock(address(amzn), -1_250);
        vault.poke();
    }
}
