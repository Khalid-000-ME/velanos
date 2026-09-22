// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AegisConstants, IntentKind, TradeIntent} from "../AegisTypes.sol";
import {IAdapter} from "./IAdapter.sol";
import {AegisPriceOracle} from "../oracle/AegisPriceOracle.sol";

interface IPerpAdapterFactory {
    function isVault(address) external view returns (bool);
}

/**
 * @title MockPerpAdapter
 * @notice Internal perpetual positions marked to the Aegis oracle, used when `PERP_MODE=mock`.
 *
 * GMX on Arbitrum Sepolia depends on a keeper that can lag by minutes, which is fine in
 * production and fatal in a three-minute demo. This adapter keeps the same `IAdapter` surface
 * and the same NAV semantics so a perps vault behaves identically either way — the UI status bar
 * is the only thing that changes. The static-rule scenarios never depended on fills in the first
 * place, because a rule violation is caught before any order exists.
 */
contract MockPerpAdapter is IAdapter {
    using SafeERC20 for IERC20;

    struct Position {
        address market;
        bool isLong;
        uint256 collateral; // settlement units
        uint256 sizeUsd8; // notional, 8-decimal USD
        uint256 entryPriceUsd8;
        bool open;
    }

    address public immutable settlement;
    address public immutable factory;
    address public immutable oracle;
    uint8 public immutable settlementDecimals;

    mapping(address => Position) public positionOf;

    event PositionOpened(address indexed vault, address market, bool isLong, uint256 collateral, uint256 sizeUsd8);
    event PositionClosed(address indexed vault, uint256 collateralReturned, int256 pnlSettlement);

    error OnlyVault(address caller);
    error PositionAlreadyOpen(address vault);
    error NoOpenPosition(address vault);
    error UnsupportedIntentKind();

    constructor(address settlement_, address factory_, address oracle_) {
        settlement = settlement_;
        factory = factory_;
        oracle = oracle_;
        settlementDecimals = IERC20Metadata(settlement_).decimals();
    }

    /// @dev Mock fills are exactly at oracle price, so slippage never trips in mock mode and a
    ///      perps demo failure always means a rule failure rather than a venue artefact.
    function quote(TradeIntent calldata i) external pure returns (uint256 quotedOut, uint256 oracleOut) {
        uint256 notional = Math.mulDiv(i.amountIn, i.leverageBps, AegisConstants.BPS);
        return (notional, notional);
    }

    function execute(TradeIntent calldata i) external returns (uint256 amountOut) {
        if (!IPerpAdapterFactory(factory).isVault(msg.sender)) revert OnlyVault(msg.sender);

        if (i.kind == IntentKind.PERP_OPEN) {
            if (positionOf[msg.sender].open) revert PositionAlreadyOpen(msg.sender);
            IERC20(settlement).safeTransferFrom(msg.sender, address(this), i.amountIn);

            (uint256 markPrice,) = AegisPriceOracle(oracle).price(i.assetOut);
            uint256 notionalSettlement = Math.mulDiv(i.amountIn, i.leverageBps, AegisConstants.BPS);

            positionOf[msg.sender] = Position({
                market: i.assetOut,
                isLong: i.isLong,
                collateral: i.amountIn,
                sizeUsd8: _settlementToUsd(notionalSettlement),
                entryPriceUsd8: markPrice,
                open: true
            });
            emit PositionOpened(msg.sender, i.assetOut, i.isLong, i.amountIn, _settlementToUsd(notionalSettlement));
            return notionalSettlement;
        }

        if (i.kind == IntentKind.PERP_CLOSE) {
            return _close(msg.sender);
        }

        revert UnsupportedIntentKind();
    }

    /// @notice Collateral plus unrealised PnL, floored at zero — a liquidated position is worth
    ///         nothing, not a negative number the vault would have to owe.
    function positionValue(address vault) external view returns (uint256) {
        Position memory p = positionOf[vault];
        if (!p.open) return 0;
        return _valueOf(p);
    }

    function closeAll(address vault) external returns (uint256 settlementOut) {
        if (!IPerpAdapterFactory(factory).isVault(msg.sender)) revert OnlyVault(msg.sender);
        if (!positionOf[vault].open) return 0;
        return _close(vault);
    }

    function _close(address vault) internal returns (uint256 settlementOut) {
        Position memory p = positionOf[vault];
        if (!p.open) revert NoOpenPosition(vault);

        settlementOut = _valueOf(p);
        uint256 balance = IERC20(settlement).balanceOf(address(this));
        if (settlementOut > balance) settlementOut = balance;

        delete positionOf[vault];
        IERC20(settlement).safeTransfer(vault, settlementOut);
        emit PositionClosed(vault, settlementOut, int256(settlementOut) - int256(p.collateral));
    }

    function _valueOf(Position memory p) internal view returns (uint256) {
        (uint256 markPrice,) = AegisPriceOracle(oracle).price(p.market);
        uint256 sizeSettlement = _usdToSettlement(p.sizeUsd8);

        if (markPrice == p.entryPriceUsd8) return p.collateral;

        if (p.isLong == (markPrice > p.entryPriceUsd8)) {
            uint256 gain = Math.mulDiv(sizeSettlement, _absDiff(markPrice, p.entryPriceUsd8), p.entryPriceUsd8);
            return p.collateral + gain;
        }
        uint256 loss = Math.mulDiv(sizeSettlement, _absDiff(markPrice, p.entryPriceUsd8), p.entryPriceUsd8);
        return loss >= p.collateral ? 0 : p.collateral - loss;
    }

    function _absDiff(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : b - a;
    }

    function _settlementToUsd(uint256 amount) internal view returns (uint256) {
        return Math.mulDiv(amount, AegisConstants.PRICE_SCALE, 10 ** settlementDecimals);
    }

    function _usdToSettlement(uint256 usd) internal view returns (uint256) {
        return Math.mulDiv(usd, 10 ** settlementDecimals, AegisConstants.PRICE_SCALE);
    }
}
