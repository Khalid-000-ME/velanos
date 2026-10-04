// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Vault flavour. SPOT trades tokenised equities; PERP trades GMX v2 markets.
enum VaultKind {
    SPOT,
    PERP
}

/// @notice Vault lifecycle. Only ACTIVE and WARNED accept deposits; only SETTLED allows
///         unconditional withdrawals.
enum VaultState {
    PENDING_BOND,
    ACTIVE,
    WARNED,
    FROZEN,
    UNWINDING,
    EXPIRED,
    SETTLED
}

enum IntentKind {
    SPOT_BUY,
    SPOT_SELL,
    PERP_OPEN,
    PERP_CLOSE
}

enum FreezeReason {
    NONE,
    STATIC_VIOLATIONS,
    DRAWDOWN,
    LATE_SETTLEMENT,
    GUARDIAN
}

/// @notice Outcome of `VelanosVault.execute`. Never reverts on a rule failure, so every
///         rejection is observable on-chain.
enum ExecStatus {
    EXECUTED,
    REJECTED_STATEFUL,
    REJECTED_STATIC_SLASHED
}

/// @notice Kind of compensation flowing from the bond into a vault.
enum CompensationKind {
    PENALTY,
    DRAWDOWN_TOPUP,
    LATE_PENALTY
}

/**
 * @notice Rule identifiers.
 *
 * - `1xx` static: depend only on the intent, the mandate and `frozenAt`. The agent could
 *   have evaluated them itself before signing, so signing one is misconduct and the
 *   signature is the evidence. **Slashable.**
 * - `2xx` stateful: depend on live vault/market state the agent cannot fully predict.
 *   Blocked, recorded as a strike, **never slashable**.
 * - `3xx` validity: the intent is not attributable to the agent at all (bad signature,
 *   replayed nonce, wrong vault). Ignored, nothing recorded.
 */
library Rules {
    // ── static (slashable) ────────────────────────────────────────────────────
    uint16 internal constant ASSET_NOT_ALLOWED = 101;
    uint16 internal constant ADAPTER_NOT_ALLOWED = 102;
    uint16 internal constant TRADE_SIZE_EXCEEDED = 103;
    uint16 internal constant LEVERAGE_EXCEEDED = 104;
    uint16 internal constant OUTSIDE_TERM = 105;
    uint16 internal constant SIGNED_WHILE_FROZEN = 106;
    uint16 internal constant VALIDITY_TOO_LONG = 107;
    uint16 internal constant KIND_NOT_ALLOWED = 108;

    // ── stateful (never slashable) ────────────────────────────────────────────
    uint16 internal constant EXPOSURE_EXCEEDED = 201;
    uint16 internal constant SLIPPAGE_EXCEEDED = 202;
    uint16 internal constant DAILY_LOSS_EXCEEDED = 203;
    uint16 internal constant DEADLINE_PASSED = 204;
    uint16 internal constant INSUFFICIENT_BALANCE = 205;
    uint16 internal constant VAULT_NOT_ACTIVE = 206;
    uint16 internal constant EXECUTION_FAILED = 207;

    // ── validity (intent ignored) ─────────────────────────────────────────────
    uint16 internal constant BAD_SIGNATURE = 301;
    uint16 internal constant NONCE_USED = 302;
    uint16 internal constant WRONG_VAULT_OR_CHAIN = 303;

    /// @dev True for rule IDs that slash the agent's bond.
    function isSlashable(uint16 ruleId) internal pure returns (bool) {
        return ruleId >= 101 && ruleId <= 199;
    }

    function isStateful(uint16 ruleId) internal pure returns (bool) {
        return ruleId >= 201 && ruleId <= 299;
    }

    function isValidity(uint16 ruleId) internal pure returns (bool) {
        return ruleId >= 301 && ruleId <= 399;
    }
}

/**
 * @notice The immutable contract between depositors and one agent. Written once at vault
 *         creation; changing terms requires a new vault.
 *
 * All token amounts are raw units of `settlementAsset`. All `*Bps` fields are basis
 * points of 10_000.
 */
struct Mandate {
    address agentSigner;
    address operator;
    address settlementAsset;
    VaultKind kind;
    address[] allowedAssets;
    address[] allowedAdapters;
    uint256 maxAllocation;
    uint256 maxTradeAmount;
    uint16 maxAssetExposureBps;
    uint16 maxSlippageBps;
    uint32 maxLeverageBps;
    uint16 maxDrawdownBps;
    uint16 maxDailyLossBps;
    uint64 start;
    uint64 expiry;
    uint256 bondRequired;
    uint256 perViolationPenalty;
    uint16 reporterBountyBps;
    uint8 riskTier;
    string metadataURI;
}

/**
 * @notice One proposed trade, signed by the agent under EIP-712.
 *
 * `rationaleHash` commits to the agent's own explanation, stored off-chain. The commitment
 * is what lets an incident replay quote the agent's words and prove they are the words
 * that accompanied this exact signature.
 */
struct TradeIntent {
    address vault;
    IntentKind kind;
    address adapter;
    address assetIn;
    address assetOut;
    uint256 amountIn;
    uint256 minOut;
    uint32 leverageBps;
    bool isLong;
    uint256 nonce;
    uint64 issuedAt;
    uint64 deadline;
    bytes32 rationaleHash;
}

/**
 * @notice Everything the stateful rules need, read once by the vault and passed to the
 *         stateless guard. Keeping it a struct means the UI inspector, the SDK and the
 *         contract all evaluate rules against byte-identical inputs.
 */
struct VaultSnapshot {
    VaultState state;
    uint256 navSettlement;
    uint256 pricePerShareWad;
    uint256 dayOpenPricePerShareWad;
    uint256 assetValueBefore;
    uint256 settlementBalance;
    uint256 assetInBalance;
    uint256 quotedOut;
    uint256 oracleOut;
}

/// @notice One row of the pre-flight checklist rendered in the UI inspector.
struct CheckResult {
    uint16 ruleId;
    bool passed;
    uint256 actual;
    uint256 limit;
}

library VelanosConstants {
    uint16 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;
    /// @dev Oracle prices are USD with 8 decimals.
    uint256 internal constant PRICE_SCALE = 1e8;
}
