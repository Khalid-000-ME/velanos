// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {
    AegisConstants,
    CompensationKind,
    ExecStatus,
    FreezeReason,
    IntentKind,
    Mandate,
    Rules,
    TradeIntent,
    VaultKind,
    VaultSnapshot,
    VaultState
} from "./AegisTypes.sol";
import {IPolicyGuard} from "./PolicyGuard.sol";
import {AegisVaultLib} from "./AegisVaultLib.sol";
import {IAdapter} from "./adapters/IAdapter.sol";
import {AegisPriceOracle} from "./oracle/AegisPriceOracle.sol";

interface IViolationCourt {
    function slashFromVault(TradeIntent calldata i, bytes calldata sig, uint16 ruleId, address submitter) external;
}

interface IAgentRegistryLike {
    function recordSettlement(uint256 agentId, bool clean) external;
}

/**
 * @title AegisVault
 * @notice One agent, one immutable mandate, one pot of depositor capital.
 *
 * Three ideas hold the design together:
 *
 * 1. **Prevent.** No trade happens until `execute` has checked the agent's signed intent
 *    against the mandate. The vault never makes an arbitrary call; it approves an exact
 *    amount to an allowlisted adapter and nothing else.
 *
 * 2. **Prove.** `execute` does not revert when a rule is broken. Reverting would erase the
 *    evidence and leave only a failed transaction. Instead the rejection — and the agent's
 *    signature on the intent that caused it — is written on-chain, where anyone can verify
 *    that this key authorised this trade in breach of this mandate.
 *
 * 3. **Pay.** A static breach slashes the agent's bond to depositors in the same
 *    transaction, before the agent can do anything about it.
 */
contract AegisVault is ERC4626, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────── constants ──────────────────────────────────

    uint8 internal constant NONCE_UNUSED = 0;
    uint8 internal constant NONCE_EXECUTED = 1;
    uint8 internal constant NONCE_SLASHED = 2;
    uint8 internal constant NONCE_REJECTED = 3;

    uint8 public constant STATIC_VIOLATIONS_TO_FREEZE = 2;
    uint8 public constant STRIKES_TO_WARN = 3;
    uint64 public constant STRIKE_WINDOW = 24 hours;
    uint16 public constant UNWIND_MAX_SLIPPAGE_BPS = 300;
    uint64 public constant MAX_PRICE_AGE = 1 days;
    uint8 public constant MAX_HELD_ASSETS = 8;

    // ─────────────────────────────── immutables ─────────────────────────────────

    address public immutable court;
    address public immutable bondManager;
    address public immutable guard;
    address public immutable oracle;
    address public immutable factory;
    address public immutable registry;
    address public immutable guardian;
    uint256 public immutable agentId;
    uint64 public immutable warnCooldown;
    uint64 public immutable settleGrace;

    // ──────────────────────────────── storage ───────────────────────────────────

    Mandate internal _mandate;
    bytes32 public immutable mandateHash;

    VaultState public state;
    FreezeReason public freezeReason;
    uint64 public frozenAt;
    uint64 public settledAt;

    mapping(uint256 => uint8) public nonceStatus;

    uint256 public hwmPricePerShareWad;
    uint256 public dayOpenPricePerShareWad;
    uint64 public dayOpenTs;

    uint64[3] public recentStrikes;
    uint64 public warnedUntil;
    uint8 public staticViolationCount;
    bool public drawdownCompensated;
    bool public drawdownTripped;

    address[] public heldAssets;

    // ───────────────────────────────── events ───────────────────────────────────

    event IntentExecuted(
        uint256 indexed nonce,
        IntentKind kind,
        address assetIn,
        address assetOut,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 rationaleHash
    );
    event IntentRejected(uint256 indexed nonce, uint16 indexed ruleId, bool slashed);
    event IntentIgnored(uint256 indexed nonce, uint16 ruleId);
    event StateChanged(VaultState from, VaultState to, FreezeReason reason);
    event StrikeRecorded(uint256 indexed nonce, uint8 strikesInWindow);
    event NavSnapshot(uint256 nav, uint256 pricePerShareWad, uint256 hwmWad, uint256 floorWad);
    event CompensationReceived(uint256 amount, CompensationKind kind);
    event Unwound(address asset, uint256 amountIn, uint256 settlementOut);

    // ───────────────────────────────── errors ───────────────────────────────────

    error OnlyCourt(address caller);
    error OnlyBondManager(address caller);
    error OnlyCourtOrGuardian(address caller);
    error WrongState(VaultState state);
    error DepositsClosed();
    error PositionsStillOpen();

    struct Config {
        Mandate mandate;
        address court;
        address bondManager;
        address guard;
        address oracle;
        address factory;
        address registry;
        address guardian;
        uint256 agentId;
        uint64 warnCooldown;
        uint64 settleGrace;
        string name;
        string symbol;
    }

    constructor(Config memory c)
        ERC4626(IERC20(c.mandate.settlementAsset))
        ERC20(c.name, c.symbol)
        EIP712("AegisProp", "1")
    {
        _mandate = c.mandate;
        mandateHash = keccak256(abi.encode(c.mandate));
        court = c.court;
        bondManager = c.bondManager;
        guard = c.guard;
        oracle = c.oracle;
        factory = c.factory;
        registry = c.registry;
        guardian = c.guardian;
        agentId = c.agentId;
        warnCooldown = c.warnCooldown;
        settleGrace = c.settleGrace;

        state = VaultState.PENDING_BOND;
        hwmPricePerShareWad = AegisConstants.WAD;
        dayOpenPricePerShareWad = AegisConstants.WAD;
        dayOpenTs = uint64(block.timestamp);
    }

    // ─────────────────────────────── EIP-712 ────────────────────────────────────

    /**
     * @notice The digest the agent signs.
     * @dev Exposed so the court and the SDK derive the identical hash. The EIP-712 domain
     *      binds `chainId` and this vault's address, so a signature cannot be replayed into
     *      another vault or onto another chain even with the same mandate and nonce.
     */
    function hashIntent(TradeIntent calldata i) public view returns (bytes32) {
        return _hashTypedDataV4(AegisVaultLib.intentStructHash(i));
    }

    function recoverSigner(TradeIntent calldata i, bytes calldata sig) public view returns (address) {
        return ECDSA.recover(hashIntent(i), sig);
    }

    // ───────────────────────────────── execute ──────────────────────────────────

    /**
     * @notice Checks a signed intent and, if it passes, trades.
     *
     * Callable by anyone: the signature is the authorisation, not the sender. That is what
     * lets a relay submit on the agent's behalf and a watcher submit evidence the agent
     * would rather bury.
     *
     * @dev Deliberately returns a status instead of reverting on a rule failure, so that
     *      every rejection is an indexed on-chain event rather than a disappeared
     *      transaction. The only reverts are for things that are not the agent's decision.
     */
    function execute(TradeIntent calldata i, bytes calldata sig)
        external
        nonReentrant
        returns (ExecStatus status, uint16 ruleId)
    {
        // ── step 1: validity. Not attributable to the agent, so nothing is recorded.
        if (i.vault != address(this)) {
            emit IntentIgnored(i.nonce, Rules.WRONG_VAULT_OR_CHAIN);
            return (ExecStatus.REJECTED_STATEFUL, Rules.WRONG_VAULT_OR_CHAIN);
        }
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(hashIntent(i), sig);
        if (err != ECDSA.RecoverError.NoError || signer != _mandate.agentSigner) {
            emit IntentIgnored(i.nonce, Rules.BAD_SIGNATURE);
            return (ExecStatus.REJECTED_STATEFUL, Rules.BAD_SIGNATURE);
        }
        if (nonceStatus[i.nonce] != NONCE_UNUSED) {
            emit IntentIgnored(i.nonce, Rules.NONCE_USED);
            return (ExecStatus.REJECTED_STATEFUL, Rules.NONCE_USED);
        }

        _poke();

        // ── step 2: static rules. Misconduct: slash, then record.
        ruleId = IPolicyGuard(guard).checkStatic(i, _mandate, frozenAt);
        if (ruleId != 0) {
            IViolationCourt(court).slashFromVault(i, sig, ruleId, msg.sender);
            emit IntentRejected(i.nonce, ruleId, true);
            return (ExecStatus.REJECTED_STATIC_SLASHED, ruleId);
        }

        // ── step 3: stateful rules. Not misconduct: block and record a strike.
        ruleId = IPolicyGuard(guard).checkStateful(i, _mandate, snapshot(i), block.timestamp);
        if (ruleId != 0) {
            nonceStatus[i.nonce] = NONCE_REJECTED;
            _recordStrike(i.nonce);
            emit IntentRejected(i.nonce, ruleId, false);
            return (ExecStatus.REJECTED_STATEFUL, ruleId);
        }

        // ── step 4: trade.
        return _executeTrade(i);
    }

    function _executeTrade(TradeIntent calldata i) internal returns (ExecStatus, uint16) {
        IERC20 tokenIn = IERC20(i.assetIn);
        tokenIn.forceApprove(i.adapter, i.amountIn);

        try IAdapter(i.adapter).execute(i) returns (uint256 amountOut) {
            tokenIn.forceApprove(i.adapter, 0);
            nonceStatus[i.nonce] = NONCE_EXECUTED;
            _trackHeldAssets(i);
            emit IntentExecuted(i.nonce, i.kind, i.assetIn, i.assetOut, i.amountIn, amountOut, i.rationaleHash);
            _poke();
            return (ExecStatus.EXECUTED, 0);
        } catch {
            // An adapter or venue failure is not the agent's misconduct, so it is a
            // stateful rejection (207) and never touches the bond.
            tokenIn.forceApprove(i.adapter, 0);
            nonceStatus[i.nonce] = NONCE_REJECTED;
            emit IntentRejected(i.nonce, Rules.EXECUTION_FAILED, false);
            return (ExecStatus.REJECTED_STATEFUL, Rules.EXECUTION_FAILED);
        }
    }

    // ──────────────────────────── strikes and warning ───────────────────────────

    /**
     * @dev Three stateful rejections inside a rolling 24-hour window put the vault in WARNED:
     *      a cooling-off period, not a punishment. An agent repeatedly bouncing off limits is
     *      malfunctioning even if no single attempt was misconduct.
     */
    function _recordStrike(uint256 nonce) internal {
        uint64 nowTs = uint64(block.timestamp);
        recentStrikes[0] = recentStrikes[1];
        recentStrikes[1] = recentStrikes[2];
        recentStrikes[2] = nowTs;

        uint8 inWindow = AegisVaultLib.strikesInWindow(recentStrikes, nowTs, STRIKE_WINDOW);
        emit StrikeRecorded(nonce, inWindow);

        if (inWindow >= STRIKES_TO_WARN && state == VaultState.ACTIVE) {
            warnedUntil = nowTs + warnCooldown;
            _setState(VaultState.WARNED, FreezeReason.NONE);
        }
    }

    function strikesInWindow() public view returns (uint8) {
        return AegisVaultLib.strikesInWindow(recentStrikes, uint64(block.timestamp), STRIKE_WINDOW);
    }

    // ───────────────────────────── lifecycle / poke ─────────────────────────────

    /// @notice Advances time-based state. Anyone may call; the demo and the watcher both do.
    function poke() external {
        _poke();
    }

    function _poke() internal {
        // WARNED is self-healing: once the cooldown lapses the agent may trade again.
        if (state == VaultState.WARNED && block.timestamp >= warnedUntil) {
            _setState(VaultState.ACTIVE, FreezeReason.NONE);
        }
        if (state == VaultState.ACTIVE && block.timestamp >= _mandate.expiry) {
            _setState(VaultState.EXPIRED, FreezeReason.NONE);
        }

        uint256 nav = navSettlement();
        uint256 pps = _pricePerShareWad(nav);

        if (block.timestamp >= dayOpenTs + 1 days || dayOpenPricePerShareWad == 0) {
            dayOpenTs = uint64(block.timestamp);
            dayOpenPricePerShareWad = pps;
        }
        if (pps > hwmPricePerShareWad) hwmPricePerShareWad = pps;

        emit NavSnapshot(nav, pps, hwmPricePerShareWad, floorPricePerShareWad());
    }

    /// @notice Called by the bond manager the moment the required bond is posted.
    function activate() external {
        if (msg.sender != bondManager) revert OnlyBondManager(msg.sender);
        if (state != VaultState.PENDING_BOND) revert WrongState(state);
        _setState(VaultState.ACTIVE, FreezeReason.NONE);
        dayOpenTs = uint64(block.timestamp);
        dayOpenPricePerShareWad = AegisConstants.WAD;
    }

    function freeze(FreezeReason r) external {
        if (msg.sender != court && msg.sender != guardian) revert OnlyCourtOrGuardian(msg.sender);
        _freeze(r);
    }

    function _freeze(FreezeReason r) internal {
        if (state == VaultState.FROZEN || state == VaultState.UNWINDING || state == VaultState.SETTLED) return;
        frozenAt = uint64(block.timestamp);
        freezeReason = r;
        if (r == FreezeReason.DRAWDOWN) drawdownTripped = true;
        _setState(VaultState.FROZEN, r);
    }

    /// @notice Court-only hook used by both slash paths. Marks the nonce as evidence that has
    ///         already been paid for, and freezes the vault on the second breach.
    function applyStaticViolation(uint256 nonce) external {
        if (msg.sender != court) revert OnlyCourt(msg.sender);
        nonceStatus[nonce] = NONCE_SLASHED;
        staticViolationCount += 1;
        if (staticViolationCount >= STATIC_VIOLATIONS_TO_FREEZE) {
            _freeze(FreezeReason.STATIC_VIOLATIONS);
        }
    }

    function markDrawdownCompensated() external {
        if (msg.sender != court) revert OnlyCourt(msg.sender);
        drawdownCompensated = true;
    }

    function _setState(VaultState to, FreezeReason r) internal {
        VaultState from = state;
        if (from == to) return;
        state = to;
        emit StateChanged(from, to, r);
    }

    // ──────────────────────────────── unwinding ─────────────────────────────────

    /**
     * @notice Sells everything back to the settlement asset. Callable by anyone.
     *
     * @dev Permissionless on purpose. A frozen vault must be able to return to cash even if
     *      the operator has walked away, and depositors must not need our cooperation to be
     *      made whole. The 3% unwind slippage allowance is wider than the trading limit
     *      because getting out matters more than getting a good price.
     */
    function unwind() external nonReentrant {
        if (state != VaultState.FROZEN && state != VaultState.EXPIRED) revert WrongState(state);
        _setState(VaultState.UNWINDING, freezeReason);

        if (_mandate.kind == VaultKind.PERP) {
            address adapter = _mandate.allowedAdapters[_mandate.allowedAdapters.length - 1];
            uint256 out = IAdapter(adapter).closeAll(address(this));
            emit Unwound(address(0), 0, out);
        } else {
            AegisVaultLib.unwindSpot(heldAssets, _mandate.allowedAdapters[0], asset());
        }
        _poke();
    }

    /**
     * @notice Final state: depositors may withdraw their full share, the operator may start
     *         the bond cooldown, and the agent's record is updated.
     */
    function settle() external nonReentrant {
        if (state != VaultState.UNWINDING && state != VaultState.EXPIRED) revert WrongState(state);
        if (_openPositionValue() > 0 || _heldAssetValue() > 0) revert PositionsStillOpen();

        settledAt = uint64(block.timestamp);
        _setState(VaultState.SETTLED, freezeReason);

        bool clean = staticViolationCount == 0 && !drawdownTripped;
        IAgentRegistryLike(registry).recordSettlement(agentId, clean);
        _poke();
    }

    // ────────────────────────────── compensation ────────────────────────────────

    /// @notice Accounting hook; the bond manager has already transferred the tokens in.
    function receiveCompensation(uint256 amount, CompensationKind kind) external {
        if (msg.sender != bondManager) revert OnlyBondManager(msg.sender);
        emit CompensationReceived(amount, kind);
        _poke();
    }

    // ───────────────────────────────── NAV ──────────────────────────────────────

    /// @notice Total value of the vault in settlement units. The ERC-4626 `totalAssets`.
    function navSettlement() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + _heldAssetValue() + _openPositionValue();
    }

    function totalAssets() public view override returns (uint256) {
        return navSettlement();
    }

    function _heldAssetValue() internal view returns (uint256) {
        if (_mandate.kind == VaultKind.PERP) return 0;
        return AegisVaultLib.heldAssetValue(oracle, address(this), heldAssets, decimals());
    }

    function _openPositionValue() internal view returns (uint256) {
        if (_mandate.kind != VaultKind.PERP) return 0;
        address adapter = _mandate.allowedAdapters[_mandate.allowedAdapters.length - 1];
        return IAdapter(adapter).positionValue(address(this));
    }

    function pricePerShareWad() public view returns (uint256) {
        return _pricePerShareWad(navSettlement());
    }

    function _pricePerShareWad(uint256 nav) internal view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return AegisConstants.WAD;
        return Math.mulDiv(nav, AegisConstants.WAD, supply);
    }

    /**
     * @notice The promise depositors are shown before they fund: NAV per share will not be
     *         allowed to sit below this without the bond being called on.
     * @dev Measured from the high-water mark, not from the deposit price, so an agent cannot
     *      bank a gain, reset expectations and then lose it.
     */
    function floorPricePerShareWad() public view returns (uint256) {
        return AegisVaultLib.floorWad(hwmPricePerShareWad, _mandate.maxDrawdownBps);
    }

    /// @notice What it would cost, right now, to lift every share back to the floor.
    function drawdownShortfall() public view returns (uint256) {
        return AegisVaultLib.shortfall(pricePerShareWad(), floorPricePerShareWad(), totalSupply());
    }

    // ──────────────────────────────── snapshot ──────────────────────────────────

    /// @notice Everything the stateful rules need, gathered in one place so the contract, the
    ///         SDK and the inspector all judge an intent against identical inputs.
    /// @notice Everything the stateful rules need, gathered in one place so the contract, the
    ///         SDK and the inspector all judge an intent against identical inputs.
    function snapshot(TradeIntent calldata i) public view returns (VaultSnapshot memory) {
        uint256 nav = navSettlement();
        return AegisVaultLib.buildSnapshot(
            i,
            AegisVaultLib.SnapshotParams({
                vault: address(this),
                oracle: oracle,
                settlementAsset: asset(),
                state: state,
                nav: nav,
                ppsWad: _pricePerShareWad(nav),
                dayOpenWad: dayOpenPricePerShareWad,
                settlementDecimals: decimals(),
                openPositionValue: _openPositionValue(),
                isPerp: _mandate.kind == VaultKind.PERP
            })
        );
    }

    // ─────────────────────── ERC-4626 deposit / withdraw caps ───────────────────

    function maxDeposit(address) public view override returns (uint256) {
        if (state != VaultState.ACTIVE && state != VaultState.WARNED) return 0;
        uint256 nav = navSettlement();
        if (nav >= _mandate.maxAllocation) return 0;
        return _mandate.maxAllocation - nav;
    }

    function maxMint(address who) public view override returns (uint256) {
        uint256 assets = maxDeposit(who);
        return assets == 0 ? 0 : previewDeposit(assets);
    }

    /**
     * @dev While trading, a withdrawal can only come out of idle cash — selling a position to
     *      fund one depositor's exit would hand them the proceeds and leave everyone else the
     *      slippage. Once SETTLED everything is cash and the cap disappears.
     */
    function maxWithdraw(address owner_) public view override returns (uint256) {
        uint256 entitled = super.maxWithdraw(owner_);
        if (state == VaultState.SETTLED) return entitled;
        if (state != VaultState.ACTIVE && state != VaultState.WARNED) return 0;
        return Math.min(entitled, IERC20(asset()).balanceOf(address(this)));
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 assets = maxWithdraw(owner_);
        return assets == 0 ? 0 : previewWithdraw(assets);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        if (state != VaultState.ACTIVE && state != VaultState.WARNED) revert DepositsClosed();
        super._deposit(caller, receiver, assets, shares);
        _poke();
    }

    // ───────────────────────────── held-asset tracking ──────────────────────────

    function _trackHeldAssets(TradeIntent calldata i) internal {
        if (_mandate.kind == VaultKind.PERP) return;
        if (i.kind == IntentKind.SPOT_BUY) _addHeld(i.assetOut);
    }

    function _addHeld(address token) internal {
        uint256 n = heldAssets.length;
        for (uint256 k; k < n; ++k) {
            if (heldAssets[k] == token) return;
        }
        if (n < MAX_HELD_ASSETS) heldAssets.push(token);
    }

    function heldAssetsList() external view returns (address[] memory) {
        return heldAssets;
    }

    // ────────────────────────────────── views ───────────────────────────────────

    function mandate() external view returns (Mandate memory) {
        return _mandate;
    }

    /// @notice True once the term has lapsed and the grace period for settling has run out.
    function isLateToSettle() external view returns (bool) {
        if (state == VaultState.SETTLED) return false;
        return block.timestamp > _mandate.expiry + settleGrace;
    }

}
