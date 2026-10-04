// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {VelanosConstants, CompensationKind, Mandate, VaultState} from "./VelanosTypes.sol";

interface IBondedVault {
    function mandate() external view returns (Mandate memory);
    function state() external view returns (VaultState);
    function settledAt() external view returns (uint64);
    function activate() external;
    function receiveCompensation(uint256 amount, CompensationKind kind) external;
}

/**
 * @title BondManager
 * @notice Custody for the agent's own capital: staked before trading, slashed on misconduct,
 *         released only after a clean settlement and a cooldown.
 *
 * This contract is the reason the product is not just a policy engine. A rule that blocks a
 * trade costs the agent nothing; a rule that moves the agent's own money to the people it
 * put at risk does. The bond is posted in the same asset depositors use, so a payout needs
 * no pricing, no oracle and no committee.
 */
contract BondManager is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Bond {
        uint256 available;
        uint256 slashedTotal;
        uint256 stakedTotal;
    }

    address public immutable court;
    address public immutable factory;
    uint64 public immutable bondCooldown;

    mapping(address => Bond) private _bonds;
    mapping(address => bool) public isRegisteredVault;

    event VaultRegistered(address indexed vault);
    event BondStaked(address indexed vault, address indexed operator, uint256 amount, uint256 available);
    event BondSlashed(
        address indexed vault,
        uint256 amount,
        uint256 toVault,
        uint256 toReporter,
        CompensationKind kind,
        address reporter
    );
    event BondReleased(address indexed vault, address indexed operator, uint256 amount);

    error OnlyCourt(address caller);
    error OnlyFactory(address caller);
    error OnlyOperator(address caller);
    error UnknownVault(address vault);
    error VaultNotSettled(VaultState state);
    error CooldownActive(uint64 releasableAt);
    error NothingToRelease();

    constructor(address court_, address factory_, uint64 bondCooldown_) {
        court = court_;
        factory = factory_;
        bondCooldown = bondCooldown_;
    }

    modifier onlyCourt() {
        if (msg.sender != court) revert OnlyCourt(msg.sender);
        _;
    }

    function registerVault(address vault) external {
        if (msg.sender != factory) revert OnlyFactory(msg.sender);
        isRegisteredVault[vault] = true;
        emit VaultRegistered(vault);
    }

    // ───────────────────────────────── staking ──────────────────────────────────

    /**
     * @notice Operator posts bond for its vault. Crossing `bondRequired` activates the vault.
     * @dev Activation lives here rather than in the vault so there is exactly one place that
     *      can decide the bond is sufficient — the place holding the tokens.
     */
    function stake(address vault, uint256 amount) external nonReentrant {
        if (!isRegisteredVault[vault]) revert UnknownVault(vault);
        Mandate memory m = IBondedVault(vault).mandate();
        if (msg.sender != m.operator) revert OnlyOperator(msg.sender);

        IERC20(m.settlementAsset).safeTransferFrom(msg.sender, address(this), amount);
        Bond storage b = _bonds[vault];
        b.available += amount;
        b.stakedTotal += amount;
        emit BondStaked(vault, msg.sender, amount, b.available);

        if (b.available >= m.bondRequired && IBondedVault(vault).state() == VaultState.PENDING_BOND) {
            IBondedVault(vault).activate();
        }
    }

    // ───────────────────────────────── slashing ─────────────────────────────────

    /**
     * @notice Moves bond to the vault's depositors, with an optional reporter bounty.
     * @param amount the penalty the court decided on
     * @param reporter paid `bountyBps` of what was actually collected; zero address pays none
     * @return paid what the bond could actually cover
     *
     * @dev Capped at `available` rather than reverting. A bond that cannot cover the full
     *      penalty must still pay what it has — a revert here would leave depositors with
     *      nothing and hand the agent an escape hatch. The shortfall is visible on-chain in
     *      the gap between the event's `amount` and `paid`, and the UI shows the unbacked
     *      remainder before anyone deposits.
     */
    function slash(address vault, uint256 amount, address reporter, uint16 bountyBps, CompensationKind kind)
        external
        onlyCourt
        nonReentrant
        returns (uint256 paid)
    {
        if (!isRegisteredVault[vault]) revert UnknownVault(vault);
        Bond storage b = _bonds[vault];

        paid = Math.min(amount, b.available);
        if (paid == 0) {
            emit BondSlashed(vault, amount, 0, 0, kind, reporter);
            return 0;
        }

        b.available -= paid;
        b.slashedTotal += paid;

        uint256 toReporter =
            reporter == address(0) ? 0 : Math.mulDiv(paid, bountyBps, VelanosConstants.BPS);
        uint256 toVault = paid - toReporter;

        Mandate memory m = IBondedVault(vault).mandate();
        IERC20 asset = IERC20(m.settlementAsset);

        if (toReporter > 0) asset.safeTransfer(reporter, toReporter);
        if (toVault > 0) {
            asset.safeTransfer(vault, toVault);
            IBondedVault(vault).receiveCompensation(toVault, kind);
        }

        emit BondSlashed(vault, amount, toVault, toReporter, kind, reporter);
    }

    // ───────────────────────────────── release ──────────────────────────────────

    /**
     * @notice Returns the remaining bond to the operator after its vault has settled.
     * @dev The cooldown exists so a late claim — a drawdown top-up or a violation reported
     *      just before settlement — cannot be outrun by an operator withdrawing first.
     */
    function release(address vault) external nonReentrant {
        if (!isRegisteredVault[vault]) revert UnknownVault(vault);
        Mandate memory m = IBondedVault(vault).mandate();
        if (msg.sender != m.operator) revert OnlyOperator(msg.sender);

        VaultState s = IBondedVault(vault).state();
        if (s != VaultState.SETTLED) revert VaultNotSettled(s);

        uint64 releasableAt_ = IBondedVault(vault).settledAt() + bondCooldown;
        if (block.timestamp < releasableAt_) revert CooldownActive(releasableAt_);

        Bond storage b = _bonds[vault];
        uint256 amount = b.available;
        if (amount == 0) revert NothingToRelease();
        b.available = 0;

        IERC20(m.settlementAsset).safeTransfer(m.operator, amount);
        emit BondReleased(vault, m.operator, amount);
    }

    // ────────────────────────────────── views ───────────────────────────────────

    function bondOf(address vault)
        external
        view
        returns (uint256 available, uint256 slashedTotal, uint64 releasableAt)
    {
        Bond memory b = _bonds[vault];
        available = b.available;
        slashedTotal = b.slashedTotal;
        uint64 settledAt_ = IBondedVault(vault).settledAt();
        releasableAt = settledAt_ == 0 ? 0 : settledAt_ + bondCooldown;
    }

    function stakedTotal(address vault) external view returns (uint256) {
        return _bonds[vault].stakedTotal;
    }

    /// @notice Share of the vault's worst case the bond can actually cover, in bps.
    ///         Surfaced on the fund screen so a depositor sees the unbacked remainder.
    function coverageBps(address vault, uint256 maxShortfall) external view returns (uint256) {
        if (maxShortfall == 0) return VelanosConstants.BPS;
        return Math.min(Math.mulDiv(_bonds[vault].available, VelanosConstants.BPS, maxShortfall), VelanosConstants.BPS);
    }
}
