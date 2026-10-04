// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Harness} from "./Harness.sol";
import {VelanosVault} from "../src/VelanosVault.sol";
import {ExecStatus, FreezeReason, Rules, TradeIntent, VaultState} from "../src/VelanosTypes.sol";

contract VelanosVaultTest is Harness {
    // ───────────────────────────── happy path ─────────────────────────────────

    function test_execute_goodBuyMovesFunds() public {
        TradeIntent memory i = buyIntent(vault, address(tsla), 150 * ONE_USDG, 1);
        bytes memory sig = signAsAgent(vault, i);

        vm.prank(watcher);
        (ExecStatus status, uint16 rule) = vault.execute(i, sig);

        assertEq(uint8(status), uint8(ExecStatus.EXECUTED));
        assertEq(rule, 0);
        assertGt(tsla.balanceOf(address(vault)), 0);
        assertEq(vault.nonceStatus(1), 1);
    }

    /// @dev The fill is deliberately slightly below fair value: 30 bps spread plus depth impact.
    ///      NAV must reflect that immediately rather than marking the position at cost.
    function test_execute_navReflectsVenueCost() public {
        uint256 navBefore = vault.navSettlement();
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 150 * ONE_USDG, 1));

        uint256 navAfter = vault.navSettlement();
        assertLt(navAfter, navBefore, "spread and impact must show up in NAV");
        assertGt(navAfter, (navBefore * 99) / 100, "but it should only be a few bps");
    }

    function test_execute_sellReturnsToSettlement() public {
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 150 * ONE_USDG, 1));
        uint256 held = tsla.balanceOf(address(vault));

        uint256 cashBefore = usdg.balanceOf(address(vault));
        executeAsWatcher(vault, sellIntent(vault, address(tsla), held, 2));

        assertEq(tsla.balanceOf(address(vault)), 0);
        assertGt(usdg.balanceOf(address(vault)), cashBefore);
    }

    function test_execute_deposited1000GivesPricePerShareOfOne() public view {
        assertEq(vault.pricePerShareWad(), 1e18);
        assertEq(vault.totalAssets(), 1_000 * ONE_USDG);
    }

    // ──────────────────────── static violation: slash ─────────────────────────

    /// @dev Scenario S2. The point of the test is that `execute` does **not** revert: the
    ///      rejection and the slash are both on-chain facts afterwards.
    function test_execute_staticViolationSlashesWithoutReverting() public {
        uint256 bondBefore = bondAvailable(vault);

        TradeIntent memory i = buyIntent(vault, address(tsla), 2_500 * ONE_USDG, 1);
        bytes memory sig = signAsAgent(vault, i);

        vm.prank(watcher);
        (ExecStatus status, uint16 rule) = vault.execute(i, sig);

        assertEq(uint8(status), uint8(ExecStatus.REJECTED_STATIC_SLASHED));
        assertEq(rule, Rules.TRADE_SIZE_EXCEEDED);
        assertEq(bondAvailable(vault), bondBefore - 50 * ONE_USDG);
        assertEq(vault.nonceStatus(1), 2, "nonce should be marked slashed");
        assertEq(vault.staticViolationCount(), 1);
        assertEq(tsla.balanceOf(address(vault)), 0, "no trade should have happened");
    }

    function test_execute_forbiddenAssetIsSlashed() public {
        TradeIntent memory i = buyIntent(vault, address(pltr), 100 * ONE_USDG, 1);
        bytes memory sig = signAsAgent(vault, i);

        vm.prank(watcher);
        (, uint16 rule) = vault.execute(i, sig);
        assertEq(rule, Rules.ASSET_NOT_ALLOWED);
    }

    /// @dev Scenario S2 again: the second static breach freezes the vault without an admin key.
    function test_execute_secondStaticViolationFreezesVault() public {
        executeAsWatcher(vault, buyIntent(vault, address(pltr), 100 * ONE_USDG, 1));
        assertEq(uint8(vault.state()), uint8(VaultState.ACTIVE));

        executeAsWatcher(vault, buyIntent(vault, address(tsla), 2_500 * ONE_USDG, 2));

        assertEq(uint8(vault.state()), uint8(VaultState.FROZEN));
        assertEq(uint8(vault.freezeReason()), uint8(FreezeReason.STATIC_VIOLATIONS));
        assertEq(vault.staticViolationCount(), 2);
    }

    function test_execute_signingAfterFreezeIsItselfASlash() public {
        executeAsWatcher(vault, buyIntent(vault, address(pltr), 100 * ONE_USDG, 1));
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 2_500 * ONE_USDG, 2));
        assertEq(uint8(vault.state()), uint8(VaultState.FROZEN));

        vm.warp(block.timestamp + 1);
        TradeIntent memory i = buyIntent(vault, address(tsla), 100 * ONE_USDG, 3);
        bytes memory sig = signAsAgent(vault, i);

        vm.prank(watcher);
        (, uint16 rule) = vault.execute(i, sig);
        assertEq(rule, Rules.SIGNED_WHILE_FROZEN);
    }

    // ───────────────────── stateful rejection: no slash ───────────────────────

    /// @dev Scenario S4's core claim: "we punish misconduct, not volatility."
    function test_execute_statefulRejectionLeavesBondUntouched() public {
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 250 * ONE_USDG, 1));
        uint256 bondBefore = bondAvailable(vault);

        TradeIntent memory i = buyIntent(vault, address(tsla), 240 * ONE_USDG, 2);
        bytes memory sig = signAsAgent(vault, i);

        vm.prank(watcher);
        (ExecStatus status, uint16 rule) = vault.execute(i, sig);

        assertEq(uint8(status), uint8(ExecStatus.REJECTED_STATEFUL));
        assertEq(rule, Rules.EXPOSURE_EXCEEDED);
        assertEq(bondAvailable(vault), bondBefore, "a stateful rejection must never cost the bond");
        assertEq(vault.nonceStatus(2), 3);
        assertEq(vault.staticViolationCount(), 0);
    }

    function test_execute_threeStrikesWarnsAndCooldownRestores() public {
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 250 * ONE_USDG, 1));

        for (uint256 n = 2; n <= 4; ++n) {
            executeAsWatcher(vault, buyIntent(vault, address(tsla), 240 * ONE_USDG, n));
        }

        assertEq(uint8(vault.state()), uint8(VaultState.WARNED));
        assertEq(vault.strikesInWindow(), 3);
        assertEq(bondAvailable(vault), 300 * ONE_USDG);

        vm.warp(block.timestamp + WARN_COOLDOWN + 1);
        vault.poke();
        assertEq(uint8(vault.state()), uint8(VaultState.ACTIVE), "WARNED should be self-healing");
    }

    // ──────────────────── validity failures: nothing recorded ─────────────────

    function test_execute_wrongSignerIsIgnored() public {
        TradeIntent memory i = buyIntent(vault, address(tsla), 150 * ONE_USDG, 1);
        bytes memory sig = sign(vault, i, roguePk);

        vm.prank(watcher);
        (, uint16 rule) = vault.execute(i, sig);

        assertEq(rule, Rules.BAD_SIGNATURE);
        assertEq(vault.nonceStatus(1), 0, "an unattributable intent must not consume the nonce");
        assertEq(bondAvailable(vault), 300 * ONE_USDG);
    }

    function test_execute_reusedNonceIsIgnored() public {
        TradeIntent memory i = buyIntent(vault, address(tsla), 150 * ONE_USDG, 1);
        bytes memory sig = signAsAgent(vault, i);
        vm.prank(watcher);
        vault.execute(i, sig);

        vm.prank(watcher);
        (, uint16 rule) = vault.execute(i, sig);
        assertEq(rule, Rules.NONCE_USED);
    }

    /// @dev A signature lifted from another vault must be inert here, which is what the
    ///      EIP-712 domain binding buys us.
    function test_execute_signatureFromAnotherVaultIsIgnored() public {
        VelanosVault other = _createSpotVault("Delta Equities II", "aDELTA2", 1_000 * ONE_USDG);
        _bondAndFund(other, 300 * ONE_USDG, 1_000 * ONE_USDG);

        TradeIntent memory i = buyIntent(other, address(tsla), 150 * ONE_USDG, 1);
        bytes memory sig = signAsAgent(other, i);

        vm.prank(watcher);
        (, uint16 rule) = vault.execute(i, sig);
        assertEq(rule, Rules.WRONG_VAULT_OR_CHAIN);
    }

    function test_hashIntent_differsAcrossVaults() public {
        VelanosVault other = _createSpotVault("Delta Equities II", "aDELTA2", 1_000 * ONE_USDG);
        TradeIntent memory i = buyIntent(vault, address(tsla), 150 * ONE_USDG, 1);
        assertTrue(vault.hashIntent(i) != other.hashIntent(i));
    }

    // ──────────────────────── deposits and withdrawals ────────────────────────

    function test_deposit_blockedBeforeBondIsPosted() public {
        vm.prank(operator);
        (address addr,) = factory.createVault(agentId, spotMandate(1_000 * ONE_USDG), "Unbonded", "aUB");
        VelanosVault unbonded = VelanosVault(addr);

        assertEq(uint8(unbonded.state()), uint8(VaultState.PENDING_BOND));
        assertEq(unbonded.maxDeposit(depositor), 0);

        vm.startPrank(depositor);
        usdg.approve(addr, 100 * ONE_USDG);
        vm.expectRevert();
        unbonded.deposit(100 * ONE_USDG, depositor);
        vm.stopPrank();
    }

    function test_deposit_respectsMaxAllocation() public {
        assertEq(vault.maxDeposit(depositor), 0, "already at the 1,000 cap");
    }

    /// @dev Funding an exit out of a position would hand the leaver the proceeds and everyone
    ///      else the slippage, so withdrawals are capped by idle cash while trading.
    function test_withdraw_cappedByIdleCashWhileTrading() public {
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 250 * ONE_USDG, 1));

        uint256 idle = usdg.balanceOf(address(vault));
        assertEq(vault.maxWithdraw(depositor), idle);
        assertLt(idle, vault.totalAssets());
    }

    function test_withdraw_blockedWhileFrozen() public {
        vm.prank(guardian);
        vault.freeze(FreezeReason.GUARDIAN);
        assertEq(vault.maxWithdraw(depositor), 0);
    }

    function test_withdraw_fullyOpenOnceSettled() public {
        vm.prank(guardian);
        vault.freeze(FreezeReason.GUARDIAN);
        vault.unwind();
        vault.settle();

        assertEq(uint8(vault.state()), uint8(VaultState.SETTLED));
        uint256 claim = vault.maxWithdraw(depositor);
        assertGt(claim, 0);

        vm.prank(depositor);
        vault.withdraw(claim, depositor, depositor);
        assertGt(usdg.balanceOf(depositor), 0);
    }

    // ──────────────────────────── unwind and settle ───────────────────────────

    function test_unwind_sellsEveryHoldingBackToSettlement() public {
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 250 * ONE_USDG, 1));
        executeAsWatcher(vault, buyIntent(vault, address(amzn), 250 * ONE_USDG, 2));
        assertGt(tsla.balanceOf(address(vault)), 0);
        assertGt(amzn.balanceOf(address(vault)), 0);

        vm.prank(guardian);
        vault.freeze(FreezeReason.GUARDIAN);
        vault.unwind();

        assertEq(tsla.balanceOf(address(vault)), 0);
        assertEq(amzn.balanceOf(address(vault)), 0);
        assertEq(uint8(vault.state()), uint8(VaultState.UNWINDING));
    }

    /// @dev Anyone may unwind and settle. Depositors must not need our cooperation, or the
    ///      operator's, to get back to cash.
    function test_unwind_isPermissionless() public {
        vm.prank(guardian);
        vault.freeze(FreezeReason.GUARDIAN);

        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vault.unwind();
        assertEq(uint8(vault.state()), uint8(VaultState.UNWINDING));
    }

    function test_settle_recordsACleanSeasonWhenNothingWentWrong() public {
        vm.warp(block.timestamp + 2 hours + 1);
        vault.poke();
        assertEq(uint8(vault.state()), uint8(VaultState.EXPIRED));

        vault.unwind();
        vault.settle();

        assertEq(registry.agent(agentId).cleanSeasons, 1);
        assertEq(registry.agent(agentId).slashCount, 0);
    }

    function test_settle_countsASlashInsteadOfACleanSeason() public {
        executeAsWatcher(vault, buyIntent(vault, address(pltr), 100 * ONE_USDG, 1));
        vm.prank(guardian);
        vault.freeze(FreezeReason.GUARDIAN);
        vault.unwind();
        vault.settle();

        assertEq(registry.agent(agentId).cleanSeasons, 0);
        assertEq(registry.agent(agentId).slashCount, 1);
    }

    function test_settle_revertsWhilePositionsAreOpen() public {
        executeAsWatcher(vault, buyIntent(vault, address(tsla), 250 * ONE_USDG, 1));
        vm.warp(block.timestamp + 2 hours + 1);
        vault.poke();

        vm.expectRevert(VelanosVault.PositionsStillOpen.selector);
        vault.settle();
    }

    // ───────────────────────────── expiry and HWM ─────────────────────────────

    function test_poke_expiresAtTermEnd() public {
        vm.warp(block.timestamp + 2 hours);
        vault.poke();
        assertEq(uint8(vault.state()), uint8(VaultState.EXPIRED));
    }

    /// @dev The floor tracks the high-water mark, so an agent cannot bank a gain, reset
    ///      expectations downward and then give it back.
    function test_floor_ratchetsUpWithTheHighWaterMark() public {
        assertEq(vault.floorPricePerShareWad(), 0.92e18);

        executeAsWatcher(vault, buyIntent(vault, address(tsla), 250 * ONE_USDG, 1));
        _shock(address(tsla), 2_000); // TSLA +20%
        vault.poke();

        assertGt(vault.hwmPricePerShareWad(), 1e18);
        assertGt(vault.floorPricePerShareWad(), 0.92e18);
    }

    function test_freeze_onlyCourtOrGuardian() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert();
        vault.freeze(FreezeReason.GUARDIAN);
    }
}
