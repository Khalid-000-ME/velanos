// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {
    AegisConstants,
    CheckResult,
    IntentKind,
    Mandate,
    Rules,
    TradeIntent,
    VaultKind,
    VaultSnapshot,
    VaultState
} from "./AegisTypes.sol";

interface IPolicyGuard {
    function checkStatic(TradeIntent calldata i, Mandate calldata m, uint64 frozenAt)
        external
        pure
        returns (uint16 ruleId);

    function checkStateful(TradeIntent calldata i, Mandate calldata m, VaultSnapshot calldata s, uint256 nowTs)
        external
        pure
        returns (uint16 ruleId);

    function explain(
        TradeIntent calldata i,
        Mandate calldata m,
        uint64 frozenAt,
        VaultSnapshot calldata s,
        uint256 nowTs
    ) external pure returns (CheckResult[] memory);

    function maxIntentValidity() external pure returns (uint64);
}

/**
 * @title PolicyGuard
 * @notice The whole rulebook, as pure functions.
 *
 * Statelessness is the point. The vault, the off-chain SDK, the watcher and the UI
 * inspector all run the same checks over the same inputs, so "what the contract would
 * decide" is something anyone can compute before signing — and after.
 *
 * The check *order* is part of the specification, not an implementation detail: an intent
 * that breaks several rules is always reported under the first one in the list, which is
 * why the UI, the tests and `ViolationCourt` never disagree about which rule was broken.
 */
contract PolicyGuard is IPolicyGuard {
    /// @dev An intent may not claim a validity window longer than this (rule 107). Long
    ///      windows let an agent pre-sign now and fire later under different conditions.
    uint64 public constant MAX_INTENT_VALIDITY = 300;

    function maxIntentValidity() external pure returns (uint64) {
        return MAX_INTENT_VALIDITY;
    }

    // ─────────────────────────────── static rules ────────────────────────────────

    /**
     * @notice Rules the agent could have checked itself before signing.
     * @dev Order: 108 → 102 → 101 → 104 → 103 → 107 → 105 → 106. First failure wins.
     * @return ruleId 0 when the intent is clean.
     */
    function checkStatic(TradeIntent calldata i, Mandate calldata m, uint64 frozenAt)
        public
        pure
        returns (uint16 ruleId)
    {
        if (!_kindAllowed(i.kind, m.kind)) return Rules.KIND_NOT_ALLOWED;
        if (!_contains(m.allowedAdapters, i.adapter)) return Rules.ADAPTER_NOT_ALLOWED;
        if (!_assetsAllowed(i, m)) return Rules.ASSET_NOT_ALLOWED;
        if (!_leverageAllowed(i, m)) return Rules.LEVERAGE_EXCEEDED;
        if (_sizeCapped(i.kind) && i.amountIn > m.maxTradeAmount) return Rules.TRADE_SIZE_EXCEEDED;
        if (i.deadline < i.issuedAt || i.deadline - i.issuedAt > MAX_INTENT_VALIDITY) {
            return Rules.VALIDITY_TOO_LONG;
        }
        if (i.issuedAt < m.start || i.issuedAt >= m.expiry) return Rules.OUTSIDE_TERM;
        if (frozenAt != 0 && i.issuedAt >= frozenAt) return Rules.SIGNED_WHILE_FROZEN;
        return 0;
    }

    // ────────────────────────────── stateful rules ───────────────────────────────

    /**
     * @notice Rules that depend on live state, which an honest agent can trip by accident.
     * @dev Order: 204 → 206 → 205 → 202 → 201 → 203. First failure wins. Never slashable.
     */
    function checkStateful(TradeIntent calldata i, Mandate calldata m, VaultSnapshot calldata s, uint256 nowTs)
        public
        pure
        returns (uint16 ruleId)
    {
        if (nowTs > i.deadline) return Rules.DEADLINE_PASSED;
        if (s.state != VaultState.ACTIVE) return Rules.VAULT_NOT_ACTIVE;
        if (s.assetInBalance < i.amountIn) return Rules.INSUFFICIENT_BALANCE;
        if (_slippageBreached(i, m, s)) return Rules.SLIPPAGE_EXCEEDED;
        if (_exposureBreached(i, m, s)) return Rules.EXPOSURE_EXCEEDED;
        if (_dailyLossBreached(i, m, s)) return Rules.DAILY_LOSS_EXCEEDED;
        return 0;
    }

    // ──────────────────────────────── explain ────────────────────────────────────

    /**
     * @notice Every rule evaluated, in spec order, with the actual value and the limit.
     *         Drives the pre-flight inspector screen, so a judge can see not just that an
     *         intent failed but exactly which number crossed which line.
     * @dev Unlike the two check functions this does not stop at the first failure.
     */
    function explain(
        TradeIntent calldata i,
        Mandate calldata m,
        uint64 frozenAt,
        VaultSnapshot calldata s,
        uint256 nowTs
    ) external pure returns (CheckResult[] memory out) {
        out = new CheckResult[](14);
        uint256 n;

        out[n++] = CheckResult(Rules.KIND_NOT_ALLOWED, _kindAllowed(i.kind, m.kind), uint256(uint8(i.kind)), uint256(uint8(m.kind)));
        out[n++] = CheckResult(Rules.ADAPTER_NOT_ALLOWED, _contains(m.allowedAdapters, i.adapter), 0, m.allowedAdapters.length);
        out[n++] = CheckResult(Rules.ASSET_NOT_ALLOWED, _assetsAllowed(i, m), 0, m.allowedAssets.length);
        out[n++] = CheckResult(Rules.LEVERAGE_EXCEEDED, _leverageAllowed(i, m), i.leverageBps, m.maxLeverageBps);
        out[n++] = CheckResult(
            Rules.TRADE_SIZE_EXCEEDED,
            !_sizeCapped(i.kind) || i.amountIn <= m.maxTradeAmount,
            i.amountIn,
            m.maxTradeAmount
        );
        uint256 window = i.deadline >= i.issuedAt ? uint256(i.deadline - i.issuedAt) : type(uint256).max;
        out[n++] = CheckResult(Rules.VALIDITY_TOO_LONG, window <= MAX_INTENT_VALIDITY, window, MAX_INTENT_VALIDITY);
        out[n++] = CheckResult(Rules.OUTSIDE_TERM, i.issuedAt >= m.start && i.issuedAt < m.expiry, i.issuedAt, m.expiry);
        out[n++] = CheckResult(Rules.SIGNED_WHILE_FROZEN, frozenAt == 0 || i.issuedAt < frozenAt, i.issuedAt, frozenAt);

        out[n++] = CheckResult(Rules.DEADLINE_PASSED, nowTs <= i.deadline, nowTs, i.deadline);
        out[n++] = CheckResult(Rules.VAULT_NOT_ACTIVE, s.state == VaultState.ACTIVE, uint256(uint8(s.state)), uint256(uint8(VaultState.ACTIVE)));
        out[n++] = CheckResult(Rules.INSUFFICIENT_BALANCE, s.assetInBalance >= i.amountIn, s.assetInBalance, i.amountIn);
        out[n++] = CheckResult(Rules.SLIPPAGE_EXCEEDED, !_slippageBreached(i, m, s), s.quotedOut, _slippageFloor(m, s));
        out[n++] = CheckResult(
            Rules.EXPOSURE_EXCEEDED, !_exposureBreached(i, m, s), _exposureAfterBps(i, s), m.maxAssetExposureBps
        );
        out[n++] = CheckResult(
            Rules.DAILY_LOSS_EXCEEDED, !_dailyLossBreached(i, m, s), s.pricePerShareWad, _dailyLossFloorWad(m, s)
        );
    }

    // ──────────────────────────────── internals ──────────────────────────────────

    function _kindAllowed(IntentKind k, VaultKind vk) internal pure returns (bool) {
        bool isPerpIntent = k == IntentKind.PERP_OPEN || k == IntentKind.PERP_CLOSE;
        return isPerpIntent == (vk == VaultKind.PERP);
    }

    /**
     * @dev Both legs are checked, not just the traded asset: a BUY must spend the
     *      settlement asset and a SELL must return to it, so there is no route out of the
     *      mandate's asset set via an exotic "settlement" token.
     */
    function _assetsAllowed(TradeIntent calldata i, Mandate calldata m) internal pure returns (bool) {
        if (i.kind == IntentKind.SPOT_BUY) {
            return i.assetIn == m.settlementAsset && _contains(m.allowedAssets, i.assetOut);
        }
        if (i.kind == IntentKind.SPOT_SELL) {
            return i.assetOut == m.settlementAsset && _contains(m.allowedAssets, i.assetIn);
        }
        // PERP_OPEN / PERP_CLOSE: assetIn is collateral, assetOut is the GMX market.
        return i.assetIn == m.settlementAsset && _contains(m.allowedAssets, i.assetOut);
    }

    function _leverageAllowed(TradeIntent calldata i, Mandate calldata m) internal pure returns (bool) {
        if (m.kind == VaultKind.SPOT) return i.leverageBps == AegisConstants.BPS;
        return i.leverageBps >= AegisConstants.BPS && i.leverageBps <= m.maxLeverageBps;
    }

    /// @dev Only risk-increasing legs are size-capped. Selling or closing always reduces
    ///      exposure, so capping it would trap an agent that wants to de-risk.
    function _sizeCapped(IntentKind k) internal pure returns (bool) {
        return k == IntentKind.SPOT_BUY || k == IntentKind.PERP_OPEN;
    }

    function _increasesExposure(IntentKind k) internal pure returns (bool) {
        return k == IntentKind.SPOT_BUY || k == IntentKind.PERP_OPEN;
    }

    /// @dev `mulDiv` throughout: these are pure view helpers that the UI calls with
    ///      arbitrary user-supplied numbers, so an overflow revert would turn the
    ///      inspector into a blank screen instead of showing why an intent fails.
    function _slippageFloor(Mandate calldata m, VaultSnapshot calldata s) internal pure returns (uint256) {
        return Math.mulDiv(s.oracleOut, AegisConstants.BPS - m.maxSlippageBps, AegisConstants.BPS);
    }

    function _slippageBreached(TradeIntent calldata i, Mandate calldata m, VaultSnapshot calldata s)
        internal
        pure
        returns (bool)
    {
        if (s.oracleOut == 0 && i.minOut == 0) return false;
        if (i.minOut != 0 && s.quotedOut < i.minOut) return true;
        if (s.oracleOut == 0) return false;
        return s.quotedOut < _slippageFloor(m, s);
    }

    function _exposureAfterBps(TradeIntent calldata i, VaultSnapshot calldata s) internal pure returns (uint256) {
        if (s.navSettlement == 0) return 0;
        unchecked {
            uint256 after_ = s.assetValueBefore + i.amountIn;
            // A sum that wrapped is unreachable with real balances; treat it as "over cap".
            if (after_ < s.assetValueBefore) return type(uint256).max;
            return Math.mulDiv(after_, AegisConstants.BPS, s.navSettlement);
        }
    }

    function _exposureBreached(TradeIntent calldata i, Mandate calldata m, VaultSnapshot calldata s)
        internal
        pure
        returns (bool)
    {
        if (!_increasesExposure(i.kind)) return false;
        if (s.navSettlement == 0) return false;
        return _exposureAfterBps(i, s) > m.maxAssetExposureBps;
    }

    function _dailyLossFloorWad(Mandate calldata m, VaultSnapshot calldata s) internal pure returns (uint256) {
        return Math.mulDiv(s.dayOpenPricePerShareWad, AegisConstants.BPS - m.maxDailyLossBps, AegisConstants.BPS);
    }

    /// @dev A bad day stops new risk but never blocks de-risking.
    function _dailyLossBreached(TradeIntent calldata i, Mandate calldata m, VaultSnapshot calldata s)
        internal
        pure
        returns (bool)
    {
        if (!_increasesExposure(i.kind)) return false;
        if (s.dayOpenPricePerShareWad == 0) return false;
        return s.pricePerShareWad < _dailyLossFloorWad(m, s);
    }

    function _contains(address[] calldata set, address needle) internal pure returns (bool) {
        for (uint256 k; k < set.length; ++k) {
            if (set[k] == needle) return true;
        }
        return false;
    }
}
