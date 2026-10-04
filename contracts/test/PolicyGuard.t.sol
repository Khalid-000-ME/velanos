// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PolicyGuard} from "../src/PolicyGuard.sol";
import {CheckResult, IntentKind, Rules, TradeIntent, VaultSnapshot, VaultState} from "../src/VelanosTypes.sol";
import {Fixtures} from "./Fixtures.sol";

/// @notice Every rule ID gets a passing case and a failing case, plus the order guarantees
///         that the UI and the court rely on.
contract PolicyGuardTest is Test, Fixtures {
    PolicyGuard internal guard;

    function setUp() public {
        guard = new PolicyGuard();
    }

    // ───────────────────────── static: clean baseline ─────────────────────────

    function test_static_cleanBuyPasses() public view {
        assertEq(guard.checkStatic(buyIntent(), spotMandate(), 0), 0);
    }

    function test_static_cleanSellPasses() public view {
        assertEq(guard.checkStatic(sellIntent(), spotMandate(), 0), 0);
    }

    function test_static_cleanPerpOpenPasses() public view {
        assertEq(guard.checkStatic(perpOpenIntent(), perpMandate(), 0), 0);
    }

    // ───────────────────────── 108 KIND_NOT_ALLOWED ───────────────────────────

    function test_static_108_perpIntentOnSpotVault() public view {
        TradeIntent memory i = perpOpenIntent();
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.KIND_NOT_ALLOWED);
    }

    function test_static_108_spotIntentOnPerpVault() public view {
        assertEq(guard.checkStatic(buyIntent(), perpMandate(), 0), Rules.KIND_NOT_ALLOWED);
    }

    // ───────────────────────── 102 ADAPTER_NOT_ALLOWED ────────────────────────

    function test_static_102_unknownAdapter() public view {
        TradeIntent memory i = buyIntent();
        i.adapter = ROGUE_ADAPTER;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.ADAPTER_NOT_ALLOWED);
    }

    // ───────────────────────── 101 ASSET_NOT_ALLOWED ──────────────────────────

    function test_static_101_buyForbiddenStock() public view {
        TradeIntent memory i = buyIntent();
        i.assetOut = PLTR;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.ASSET_NOT_ALLOWED);
    }

    function test_static_101_buyWithNonSettlementAsset() public view {
        TradeIntent memory i = buyIntent();
        i.assetIn = TSLA;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.ASSET_NOT_ALLOWED);
    }

    function test_static_101_sellIntoNonSettlementAsset() public view {
        TradeIntent memory i = sellIntent();
        i.assetOut = AMZN;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.ASSET_NOT_ALLOWED);
    }

    function test_static_101_perpOnUnlistedMarket() public view {
        TradeIntent memory i = perpOpenIntent();
        i.assetOut = PLTR;
        assertEq(guard.checkStatic(i, perpMandate(), 0), Rules.ASSET_NOT_ALLOWED);
    }

    // ───────────────────────── 104 LEVERAGE_EXCEEDED ──────────────────────────

    function test_static_104_spotMustBeOneX() public view {
        TradeIntent memory i = buyIntent();
        i.leverageBps = 20_000;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.LEVERAGE_EXCEEDED);
    }

    function test_static_104_perpAboveCap() public view {
        TradeIntent memory i = perpOpenIntent();
        i.leverageBps = 100_000;
        assertEq(guard.checkStatic(i, perpMandate(), 0), Rules.LEVERAGE_EXCEEDED);
    }

    function test_static_104_perpBelowOneXIsRejected() public view {
        TradeIntent memory i = perpOpenIntent();
        i.leverageBps = 5_000;
        assertEq(guard.checkStatic(i, perpMandate(), 0), Rules.LEVERAGE_EXCEEDED);
    }

    function test_static_104_perpAtExactCapPasses() public view {
        TradeIntent memory i = perpOpenIntent();
        i.leverageBps = 30_000;
        assertEq(guard.checkStatic(i, perpMandate(), 0), 0);
    }

    // ───────────────────────── 103 TRADE_SIZE_EXCEEDED ────────────────────────

    function test_static_103_oversizedBuy() public view {
        TradeIntent memory i = buyIntent();
        i.amountIn = 2_500 * ONE_USDG;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.TRADE_SIZE_EXCEEDED);
    }

    function test_static_103_atExactCapPasses() public view {
        TradeIntent memory i = buyIntent();
        i.amountIn = 250 * ONE_USDG;
        assertEq(guard.checkStatic(i, spotMandate(), 0), 0);
    }

    /// @dev De-risking is deliberately uncapped: a huge SELL must not be a violation.
    function test_static_103_sellIsNeverSizeCapped() public view {
        TradeIntent memory i = sellIntent();
        i.amountIn = 10_000 * ONE_USDG;
        assertEq(guard.checkStatic(i, spotMandate(), 0), 0);
    }

    function test_static_103_perpCloseIsNeverSizeCapped() public view {
        TradeIntent memory i = perpOpenIntent();
        i.kind = IntentKind.PERP_CLOSE;
        i.amountIn = 10_000 * ONE_USDG;
        assertEq(guard.checkStatic(i, perpMandate(), 0), 0);
    }

    // ───────────────────────── 107 VALIDITY_TOO_LONG ──────────────────────────

    function test_static_107_windowTooLong() public view {
        TradeIntent memory i = buyIntent();
        i.deadline = i.issuedAt + 301;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.VALIDITY_TOO_LONG);
    }

    function test_static_107_exactlyMaxWindowPasses() public view {
        TradeIntent memory i = buyIntent();
        i.deadline = i.issuedAt + 300;
        assertEq(guard.checkStatic(i, spotMandate(), 0), 0);
    }

    function test_static_107_deadlineBeforeIssuedAt() public view {
        TradeIntent memory i = buyIntent();
        i.deadline = i.issuedAt - 1;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.VALIDITY_TOO_LONG);
    }

    // ───────────────────────── 105 OUTSIDE_TERM ───────────────────────────────

    function test_static_105_signedBeforeStart() public view {
        TradeIntent memory i = buyIntent();
        i.issuedAt = 999;
        i.deadline = 1_050;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.OUTSIDE_TERM);
    }

    /// @dev Scenario S5: the agent keeps signing after the mandate's term ended.
    function test_static_105_signedAfterExpiry() public view {
        TradeIntent memory i = buyIntent();
        i.issuedAt = 1_000_000;
        i.deadline = 1_000_060;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.OUTSIDE_TERM);
    }

    function test_static_105_atStartPasses() public view {
        TradeIntent memory i = buyIntent();
        i.issuedAt = 1_000;
        i.deadline = 1_060;
        assertEq(guard.checkStatic(i, spotMandate(), 0), 0);
    }

    // ───────────────────────── 106 SIGNED_WHILE_FROZEN ────────────────────────

    function test_static_106_signedAfterFreeze() public view {
        TradeIntent memory i = buyIntent();
        assertEq(guard.checkStatic(i, spotMandate(), i.issuedAt), Rules.SIGNED_WHILE_FROZEN);
    }

    function test_static_106_signedBeforeFreezePasses() public view {
        TradeIntent memory i = buyIntent();
        assertEq(guard.checkStatic(i, spotMandate(), i.issuedAt + 1), 0);
    }

    // ───────────────────────── static order guarantees ────────────────────────

    /// @dev Scenario S3 depends on this: a perp intent on an unlisted market at 10x is
    ///      reported as 101, not 104, because 101 comes first in the spec order.
    function test_static_order_assetBeatsLeverage() public view {
        TradeIntent memory i = perpOpenIntent();
        i.assetOut = PLTR;
        i.leverageBps = 100_000;
        assertEq(guard.checkStatic(i, perpMandate(), 0), Rules.ASSET_NOT_ALLOWED);
    }

    function test_static_order_kindBeatsEverything() public view {
        TradeIntent memory i = perpOpenIntent();
        i.adapter = ROGUE_ADAPTER;
        i.assetOut = PLTR;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.KIND_NOT_ALLOWED);
    }

    function test_static_order_adapterBeatsAsset() public view {
        TradeIntent memory i = buyIntent();
        i.adapter = ROGUE_ADAPTER;
        i.assetOut = PLTR;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.ADAPTER_NOT_ALLOWED);
    }

    function test_static_order_leverageBeatsSize() public view {
        TradeIntent memory i = buyIntent();
        i.leverageBps = 20_000;
        i.amountIn = 9_000 * ONE_USDG;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.LEVERAGE_EXCEEDED);
    }

    /// @dev Scenario S2: the fat-finger buy passes 101 and 104 and fails only on 103.
    function test_static_order_fatFingerReportsSizeOnly() public view {
        TradeIntent memory i = buyIntent();
        i.amountIn = 2_500 * ONE_USDG;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.TRADE_SIZE_EXCEEDED);
    }

    function test_static_order_sizeBeatsValidity() public view {
        TradeIntent memory i = buyIntent();
        i.amountIn = 2_500 * ONE_USDG;
        i.deadline = i.issuedAt + 9_999;
        assertEq(guard.checkStatic(i, spotMandate(), 0), Rules.TRADE_SIZE_EXCEEDED);
    }

    function test_static_order_termBeatsFrozen() public view {
        TradeIntent memory i = buyIntent();
        i.issuedAt = 1_000_000;
        i.deadline = 1_000_060;
        assertEq(guard.checkStatic(i, spotMandate(), 1_000), Rules.OUTSIDE_TERM);
    }

    // ───────────────────────── stateful: clean baseline ───────────────────────

    function test_stateful_cleanBuyPasses() public view {
        assertEq(guard.checkStateful(buyIntent(), spotMandate(), healthySnapshot(), 2_010), 0);
    }

    // ───────────────────────── 204 DEADLINE_PASSED ────────────────────────────

    function test_stateful_204_pastDeadline() public view {
        TradeIntent memory i = buyIntent();
        assertEq(guard.checkStateful(i, spotMandate(), healthySnapshot(), i.deadline + 1), Rules.DEADLINE_PASSED);
    }

    function test_stateful_204_atDeadlinePasses() public view {
        TradeIntent memory i = buyIntent();
        assertEq(guard.checkStateful(i, spotMandate(), healthySnapshot(), i.deadline), 0);
    }

    // ───────────────────────── 206 VAULT_NOT_ACTIVE ───────────────────────────

    function test_stateful_206_warnedVaultBlocksTrades() public view {
        VaultSnapshot memory s = healthySnapshot();
        s.state = VaultState.WARNED;
        assertEq(guard.checkStateful(buyIntent(), spotMandate(), s, 2_010), Rules.VAULT_NOT_ACTIVE);
    }

    function test_stateful_206_frozenVaultBlocksTrades() public view {
        VaultSnapshot memory s = healthySnapshot();
        s.state = VaultState.FROZEN;
        assertEq(guard.checkStateful(buyIntent(), spotMandate(), s, 2_010), Rules.VAULT_NOT_ACTIVE);
    }

    function test_stateful_206_pendingBondBlocksTrades() public view {
        VaultSnapshot memory s = healthySnapshot();
        s.state = VaultState.PENDING_BOND;
        assertEq(guard.checkStateful(buyIntent(), spotMandate(), s, 2_010), Rules.VAULT_NOT_ACTIVE);
    }

    // ───────────────────────── 205 INSUFFICIENT_BALANCE ───────────────────────

    function test_stateful_205_notEnoughSettlement() public view {
        VaultSnapshot memory s = healthySnapshot();
        s.assetInBalance = 10 * ONE_USDG;
        assertEq(guard.checkStateful(buyIntent(), spotMandate(), s, 2_010), Rules.INSUFFICIENT_BALANCE);
    }

    function test_stateful_205_exactBalancePasses() public view {
        TradeIntent memory i = buyIntent();
        VaultSnapshot memory s = healthySnapshot();
        s.assetInBalance = i.amountIn;
        assertEq(guard.checkStateful(i, spotMandate(), s, 2_010), 0);
    }

    // ───────────────────────── 202 SLIPPAGE_EXCEEDED ──────────────────────────

    function test_stateful_202_quoteBelowOracleTolerance() public view {
        VaultSnapshot memory s = healthySnapshot();
        s.oracleOut = 100e18;
        s.quotedOut = 98e18; // 2% worse than oracle, cap is 1%
        assertEq(guard.checkStateful(buyIntent(), spotMandate(), s, 2_010), Rules.SLIPPAGE_EXCEEDED);
    }

    function test_stateful_202_quoteInsideTolerancePasses() public view {
        VaultSnapshot memory s = healthySnapshot();
        s.oracleOut = 100e18;
        s.quotedOut = 99.5e18;
        assertEq(guard.checkStateful(buyIntent(), spotMandate(), s, 2_010), 0);
    }

    function test_stateful_202_minOutBreach() public view {
        TradeIntent memory i = buyIntent();
        i.minOut = 101e18;
        assertEq(guard.checkStateful(i, spotMandate(), healthySnapshot(), 2_010), Rules.SLIPPAGE_EXCEEDED);
    }

    // ───────────────────────── 201 EXPOSURE_EXCEEDED ──────────────────────────

    /// @dev Scenario S4: vault already holds 250 of TSLA; another 240 would reach 49%.
    function test_stateful_201_revengeTradeOverCap() public view {
        TradeIntent memory i = buyIntent();
        i.amountIn = 240 * ONE_USDG;
        VaultSnapshot memory s = healthySnapshot();
        s.assetValueBefore = 250 * ONE_USDG;
        assertEq(guard.checkStateful(i, spotMandate(), s, 2_010), Rules.EXPOSURE_EXCEEDED);
    }

    function test_stateful_201_atExactCapPasses() public view {
        TradeIntent memory i = buyIntent();
        i.amountIn = 150 * ONE_USDG;
        VaultSnapshot memory s = healthySnapshot();
        s.assetValueBefore = 250 * ONE_USDG; // 400 of 1,000 NAV = exactly 40%
        assertEq(guard.checkStateful(i, spotMandate(), s, 2_010), 0);
    }

    /// @dev Selling down an over-exposed position must never be blocked by the cap.
    function test_stateful_201_sellIsNeverExposureCapped() public view {
        TradeIntent memory i = sellIntent();
        i.amountIn = 900 * ONE_USDG;
        VaultSnapshot memory s = healthySnapshot();
        s.assetValueBefore = 900 * ONE_USDG;
        assertEq(guard.checkStateful(i, spotMandate(), s, 2_010), 0);
    }

    // ───────────────────────── 203 DAILY_LOSS_EXCEEDED ────────────────────────

    function test_stateful_203_belowDailyFloor() public view {
        VaultSnapshot memory s = healthySnapshot();
        s.dayOpenPricePerShareWad = 1e18;
        s.pricePerShareWad = 0.96e18; // −4%, cap is 3%
        assertEq(guard.checkStateful(buyIntent(), spotMandate(), s, 2_010), Rules.DAILY_LOSS_EXCEEDED);
    }

    function test_stateful_203_atFloorPasses() public view {
        VaultSnapshot memory s = healthySnapshot();
        s.dayOpenPricePerShareWad = 1e18;
        s.pricePerShareWad = 0.97e18;
        assertEq(guard.checkStateful(buyIntent(), spotMandate(), s, 2_010), 0);
    }

    function test_stateful_203_sellAllowedOnABadDay() public view {
        VaultSnapshot memory s = healthySnapshot();
        s.dayOpenPricePerShareWad = 1e18;
        s.pricePerShareWad = 0.5e18;
        assertEq(guard.checkStateful(sellIntent(), spotMandate(), s, 2_010), 0);
    }

    // ───────────────────────── stateful order guarantees ──────────────────────

    function test_stateful_order_deadlineBeatsState() public view {
        TradeIntent memory i = buyIntent();
        VaultSnapshot memory s = healthySnapshot();
        s.state = VaultState.FROZEN;
        assertEq(guard.checkStateful(i, spotMandate(), s, i.deadline + 1), Rules.DEADLINE_PASSED);
    }

    function test_stateful_order_stateBeatsBalance() public view {
        VaultSnapshot memory s = healthySnapshot();
        s.state = VaultState.WARNED;
        s.assetInBalance = 0;
        assertEq(guard.checkStateful(buyIntent(), spotMandate(), s, 2_010), Rules.VAULT_NOT_ACTIVE);
    }

    function test_stateful_order_slippageBeatsExposure() public view {
        TradeIntent memory i = buyIntent();
        i.amountIn = 240 * ONE_USDG;
        VaultSnapshot memory s = healthySnapshot();
        s.assetValueBefore = 250 * ONE_USDG;
        s.quotedOut = 80e18;
        assertEq(guard.checkStateful(i, spotMandate(), s, 2_010), Rules.SLIPPAGE_EXCEEDED);
    }

    // ───────────────────────────── explain() ──────────────────────────────────

    function test_explain_cleanIntentPassesEveryRow() public view {
        CheckResult[] memory rows = guard.explain(buyIntent(), spotMandate(), 0, healthySnapshot(), 2_010);
        assertEq(rows.length, 14);
        for (uint256 k; k < rows.length; ++k) {
            assertTrue(rows[k].passed, "every row should pass for a clean intent");
        }
    }

    /// @dev `explain` keeps going after the first failure, which is what lets the inspector
    ///      show a full checklist rather than one red line.
    function test_explain_reportsAllFailuresNotJustTheFirst() public view {
        TradeIntent memory i = buyIntent();
        i.assetOut = PLTR;
        i.amountIn = 2_500 * ONE_USDG;
        CheckResult[] memory rows = guard.explain(i, spotMandate(), 0, healthySnapshot(), 2_010);

        assertFalse(_row(rows, Rules.ASSET_NOT_ALLOWED).passed);
        assertFalse(_row(rows, Rules.TRADE_SIZE_EXCEEDED).passed);
    }

    function test_explain_rowsAreInSpecOrder() public view {
        CheckResult[] memory rows = guard.explain(buyIntent(), spotMandate(), 0, healthySnapshot(), 2_010);
        uint16[14] memory expected = [
            Rules.KIND_NOT_ALLOWED,
            Rules.ADAPTER_NOT_ALLOWED,
            Rules.ASSET_NOT_ALLOWED,
            Rules.LEVERAGE_EXCEEDED,
            Rules.TRADE_SIZE_EXCEEDED,
            Rules.VALIDITY_TOO_LONG,
            Rules.OUTSIDE_TERM,
            Rules.SIGNED_WHILE_FROZEN,
            Rules.DEADLINE_PASSED,
            Rules.VAULT_NOT_ACTIVE,
            Rules.INSUFFICIENT_BALANCE,
            Rules.SLIPPAGE_EXCEEDED,
            Rules.EXPOSURE_EXCEEDED,
            Rules.DAILY_LOSS_EXCEEDED
        ];
        for (uint256 k; k < expected.length; ++k) {
            assertEq(rows[k].ruleId, expected[k]);
        }
    }

    function test_explain_exposureRowShowsPostTradeBps() public view {
        TradeIntent memory i = buyIntent();
        i.amountIn = 240 * ONE_USDG;
        VaultSnapshot memory s = healthySnapshot();
        s.assetValueBefore = 250 * ONE_USDG;

        CheckResult memory row = _row(guard.explain(i, spotMandate(), 0, s, 2_010), Rules.EXPOSURE_EXCEEDED);
        assertEq(row.actual, 4_900); // 490 of 1,000 NAV
        assertEq(row.limit, 4_000);
        assertFalse(row.passed);
    }

    // ───────────────────────────── classification ─────────────────────────────

    function test_ruleClassification_isStableAcrossBands() public pure {
        assertTrue(Rules.isSlashable(Rules.ASSET_NOT_ALLOWED));
        assertTrue(Rules.isSlashable(Rules.KIND_NOT_ALLOWED));
        assertFalse(Rules.isSlashable(Rules.EXPOSURE_EXCEEDED));
        assertFalse(Rules.isSlashable(Rules.BAD_SIGNATURE));
        assertTrue(Rules.isStateful(Rules.EXECUTION_FAILED));
        assertTrue(Rules.isValidity(Rules.NONCE_USED));
    }

    // ──────────────────────────────── fuzz ────────────────────────────────────

    /// @dev Whatever the numbers, a static failure is always one of the eight 1xx IDs.
    function testFuzz_static_returnsZeroOrAKnownStaticRule(
        uint256 amountIn,
        uint32 leverageBps,
        uint64 issuedAt,
        uint64 window
    ) public view {
        TradeIntent memory i = buyIntent();
        i.amountIn = amountIn;
        i.leverageBps = leverageBps;
        i.issuedAt = issuedAt;
        i.deadline = issuedAt > type(uint64).max - window ? type(uint64).max : issuedAt + window;

        uint16 rule = guard.checkStatic(i, spotMandate(), 0);
        assertTrue(rule == 0 || (rule >= 101 && rule <= 108), "static check leaked a non-static rule id");
    }

    /// @dev Stateful checks must never return a slashable id — that is the whole basis of
    ///      "we punish misconduct, not volatility".
    function testFuzz_stateful_neverReturnsASlashableRule(
        uint256 nav,
        uint256 assetValueBefore,
        uint256 quotedOut,
        uint256 pricePerShareWad
    ) public view {
        VaultSnapshot memory s = healthySnapshot();
        s.navSettlement = nav;
        s.assetValueBefore = assetValueBefore;
        s.quotedOut = quotedOut;
        s.pricePerShareWad = pricePerShareWad;

        uint16 rule = guard.checkStateful(buyIntent(), spotMandate(), s, 2_010);
        assertFalse(Rules.isSlashable(rule), "a stateful check must never produce a slashable rule");
    }

    function _row(CheckResult[] memory rows, uint16 ruleId) internal pure returns (CheckResult memory) {
        for (uint256 k; k < rows.length; ++k) {
            if (rows[k].ruleId == ruleId) return rows[k];
        }
        revert("rule row not found");
    }
}
