// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {
    AegisConstants,
    CompensationKind,
    FreezeReason,
    Mandate,
    Rules,
    TradeIntent,
    VaultState
} from "./AegisTypes.sol";
import {IPolicyGuard} from "./PolicyGuard.sol";

interface ICourtVault {
    function mandate() external view returns (Mandate memory);
    function state() external view returns (VaultState);
    function frozenAt() external view returns (uint64);
    function nonceStatus(uint256 nonce) external view returns (uint8);
    function recoverSigner(TradeIntent calldata i, bytes calldata sig) external view returns (address);
    function applyStaticViolation(uint256 nonce) external;
    function markDrawdownCompensated() external;
    function freeze(FreezeReason r) external;
    function pricePerShareWad() external view returns (uint256);
    function floorPricePerShareWad() external view returns (uint256);
    function drawdownShortfall() external view returns (uint256);
    function drawdownCompensated() external view returns (bool);
    function isLateToSettle() external view returns (bool);
}

interface ICourtBondManager {
    function slash(address vault, uint256 amount, address reporter, uint16 bountyBps, CompensationKind kind)
        external
        returns (uint256 paid);
}

interface ICourtFactory {
    function isVault(address) external view returns (bool);
}

/**
 * @title ViolationCourt
 * @notice Turns evidence into payment.
 *
 * There is no judge, no committee and no appeal: every entry point here re-derives its verdict
 * from the agent's own signature and the immutable mandate, so the outcome is a function of
 * public data. That is also why every function is permissionless — if anyone can compute that
 * a slash is owed, anyone should be able to collect it.
 */
contract ViolationCourt {
    address public immutable guard;
    address public immutable factory;
    address public bondManager;

    bool private _bondManagerSet;

    event ViolationReported(
        address indexed vault,
        uint256 indexed nonce,
        uint16 indexed ruleId,
        address reporter,
        uint256 penaltyPaid,
        uint256 bountyPaid
    );
    event DrawdownTripped(address indexed vault, uint256 pricePerShareWad, uint256 floorWad);
    event DrawdownCompensated(address indexed vault, uint256 shortfall, uint256 paid);
    event LateSettlement(address indexed vault, uint256 penaltyPaid);

    error OnlyVault(address caller);
    error OnlyFactory(address caller);
    error BondManagerAlreadySet();
    error UnknownVault(address vault);
    error NotAViolation();
    error NonceAlreadyResolved(uint256 nonce);
    error WrongSigner(address recovered, address expected);
    error AboveFloor(uint256 pricePerShareWad, uint256 floorWad);
    error AlreadyCompensated();
    error PositionsStillOpen();
    error NotLateYet();

    constructor(address guard_, address factory_) {
        guard = guard_;
        factory = factory_;
    }

    function setBondManager(address bondManager_) external {
        if (msg.sender != factory) revert OnlyFactory(msg.sender);
        if (_bondManagerSet) revert BondManagerAlreadySet();
        bondManager = bondManager_;
        _bondManagerSet = true;
    }

    // ───────────────────── path 1: the vault caught it inline ───────────────────

    /**
     * @notice Called by a vault from inside `execute` when a static rule failed.
     * @param submitter whoever sent the transaction. Recorded in the event, never paid.
     *
     * @dev **No bounty is ever paid on this path**, and that is a deliberate asymmetry.
     *
     *      A bounty is compensation for *discovering* misconduct. Reaching this function requires
     *      no discovery: the submitter pushed an intent into `execute` and the vault caught it
     *      unaided. A genuine watcher never needs to do that — it reports through
     *      `reportSignedViolation`, which executes nothing and risks nothing.
     *
     *      Paying here would also leave a farm open that no allowlist can close. Checking the
     *      submitter against `agentSigner` and `operator` is not enough, because an operator can
     *      submit its own violating intent from a third address it controls and recycle the bounty
     *      straight back. Routing every bounty through the reporting path removes the incentive
     *      instead of trying to enumerate the attacker's keys.
     *
     *      Consequence: an agent whose bad intent reaches the vault pays the full penalty, and
     *      every cent of it goes to depositors.
     */
    function slashFromVault(TradeIntent calldata i, bytes calldata sig, uint16 ruleId, address submitter) external {
        if (!ICourtFactory(factory).isVault(msg.sender)) revert OnlyVault(msg.sender);
        ICourtVault vault = ICourtVault(msg.sender);
        Mandate memory m = vault.mandate();

        vault.applyStaticViolation(i.nonce);
        uint256 paid = ICourtBondManager(bondManager).slash(
            msg.sender, m.perViolationPenalty, address(0), 0, CompensationKind.PENALTY
        );

        emit ViolationReported(msg.sender, i.nonce, ruleId, submitter, paid, 0);
        // `sig` is not re-verified here: the vault recovered it before calling, and only
        // factory-registered vaults can reach this function.
        sig;
    }

    // ──────────────── path 2: a watcher found an intent we never saw ────────────

    /**
     * @notice Report a signed intent that breaks a static rule, whether or not it was ever
     *         submitted for execution.
     *
     * This is the mechanism that makes prevention and liability independent. An intent the
     * relay refused to forward never touched the vault and never risked a cent — but the
     * agent still signed it, and that signature is admissible here.
     *
     * @dev Griefing is structurally impossible: the caller cannot fabricate the agent's
     *      signature, cannot reuse a nonce that has already been resolved, and cannot argue a
     *      rule the guard does not agree was broken.
     *
     *      This is the only path that pays a bounty. The agent and the operator are excluded, which
     *      closes the obvious case; an operator reporting from an unrelated address it controls can
     *      still recover the bounty share, so the penalty it suffers is the full amount less that
     *      share rather than the full amount. The leak is bounded by `reporterBountyBps` and
     *      self-reporting is still strictly worse for the agent than not violating the mandate. It
     *      is recorded as a known limitation rather than papered over.
     */
    function reportSignedViolation(TradeIntent calldata i, bytes calldata sig) external returns (uint16 ruleId) {
        address vaultAddr = i.vault;
        if (!ICourtFactory(factory).isVault(vaultAddr)) revert UnknownVault(vaultAddr);
        ICourtVault vault = ICourtVault(vaultAddr);
        Mandate memory m = vault.mandate();

        address signer = vault.recoverSigner(i, sig);
        if (signer != m.agentSigner) revert WrongSigner(signer, m.agentSigner);
        if (vault.nonceStatus(i.nonce) != 0) revert NonceAlreadyResolved(i.nonce);

        ruleId = IPolicyGuard(guard).checkStatic(i, m, vault.frozenAt());
        if (ruleId == 0) revert NotAViolation();

        address reporter = (msg.sender == m.agentSigner || msg.sender == m.operator) ? address(0) : msg.sender;

        vault.applyStaticViolation(i.nonce);
        uint256 paid = ICourtBondManager(bondManager).slash(
            vaultAddr, m.perViolationPenalty, reporter, m.reporterBountyBps, CompensationKind.PENALTY
        );
        uint256 bounty = reporter == address(0) ? 0 : Math.mulDiv(paid, m.reporterBountyBps, AegisConstants.BPS);

        emit ViolationReported(vaultAddr, i.nonce, ruleId, msg.sender, paid, bounty);
    }

    // ───────────────────────── path 3: the drawdown breaker ─────────────────────

    /**
     * @notice Freezes a vault whose NAV per share has fallen through its mandated floor.
     * @dev This is the honest-agent path. No rule was broken and nobody is accused of
     *      anything; the vault simply lost more than depositors signed up for, so trading
     *      stops and the bond is put to work.
     */
    function tripDrawdown(address vaultAddr) external {
        if (!ICourtFactory(factory).isVault(vaultAddr)) revert UnknownVault(vaultAddr);
        ICourtVault vault = ICourtVault(vaultAddr);

        uint256 pps = vault.pricePerShareWad();
        uint256 floorWad = vault.floorPricePerShareWad();
        if (pps >= floorWad) revert AboveFloor(pps, floorWad);

        vault.freeze(FreezeReason.DRAWDOWN);
        emit DrawdownTripped(vaultAddr, pps, floorWad);
    }

    /**
     * @notice Pays the gap between where the vault landed and its floor, out of the bond.
     *
     * @dev Deliberately runs *after* the unwind, against realised cash. Compensating a paper
     *      shortfall would either overpay (if the unwind recovers) or underpay (if it does
     *      not), and either way the floor would be a slogan instead of a number. Capped at
     *      the bond's balance, and only once per vault.
     */
    function compensateDrawdown(address vaultAddr) external returns (uint256 paid) {
        if (!ICourtFactory(factory).isVault(vaultAddr)) revert UnknownVault(vaultAddr);
        ICourtVault vault = ICourtVault(vaultAddr);

        if (vault.drawdownCompensated()) revert AlreadyCompensated();
        VaultState s = vault.state();
        if (s != VaultState.UNWINDING && s != VaultState.SETTLED) revert PositionsStillOpen();

        uint256 shortfall = vault.drawdownShortfall();
        if (shortfall == 0) revert AboveFloor(vault.pricePerShareWad(), vault.floorPricePerShareWad());

        vault.markDrawdownCompensated();
        paid = ICourtBondManager(bondManager).slash(
            vaultAddr, shortfall, address(0), 0, CompensationKind.DRAWDOWN_TOPUP
        );
        emit DrawdownCompensated(vaultAddr, shortfall, paid);
    }

    // ────────────────────── path 4: the agent stopped answering ─────────────────

    /**
     * @notice Freezes and penalises a vault that is past its term and still holding positions.
     * @dev Without this, an agent could simply stop responding at expiry and leave depositors
     *      exposed to the market indefinitely. Walking away is itself a breach.
     */
    function forceSettle(address vaultAddr) external returns (uint256 paid) {
        if (!ICourtFactory(factory).isVault(vaultAddr)) revert UnknownVault(vaultAddr);
        ICourtVault vault = ICourtVault(vaultAddr);
        if (!vault.isLateToSettle()) revert NotLateYet();

        Mandate memory m = vault.mandate();
        vault.freeze(FreezeReason.LATE_SETTLEMENT);
        paid = ICourtBondManager(bondManager).slash(
            vaultAddr, m.perViolationPenalty, address(0), 0, CompensationKind.LATE_PENALTY
        );
        emit LateSettlement(vaultAddr, paid);
    }
}
