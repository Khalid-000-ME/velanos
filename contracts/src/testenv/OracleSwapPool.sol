// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {VelanosPriceOracle} from "../oracle/VelanosPriceOracle.sol";
import {VelanosConstants} from "../VelanosTypes.sol";

/**
 * @title OracleSwapPool
 * @notice A deterministic, oracle-consistent venue for one stock / settlement pair.
 *
 * Not an AMM. Fills are priced off the oracle with a fixed spread and a linear depth impact,
 * which makes every number in the demo exact: when we shock TSLA by −20% we can state in
 * advance what NAV becomes, what the floor is, and what the bond must pay to close the gap.
 * An AMM's path-dependent reserves would make that arithmetic a guess.
 *
 * Mainnet replacement is a Uniswap adapter; the vault is unaffected because it only ever sees
 * `IAdapter`.
 */
contract OracleSwapPool is Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;

    IERC20 public immutable settlement;
    IERC20 public immutable stock;
    VelanosPriceOracle public immutable oracle;

    uint8 public immutable settlementDecimals;
    uint8 public immutable stockDecimals;

    /// @notice Fixed venue spread, charged on both sides. 30 bps.
    uint16 public spreadBps = 30;

    /// @notice Notional, in USD, that a trade would have to be to cost 100% in impact.
    ///         Impact is `amountInUsd / depthUsd`, so a $50,000 depth charges 1 bp per $5.
    uint256 public depthUsd = 50_000e8;

    event SwapExecuted(address indexed caller, bool stockOut, uint256 amountIn, uint256 amountOut);
    event PoolParamsSet(uint16 spreadBps, uint256 depthUsd);

    error InsufficientInventory(uint256 requested, uint256 available);

    constructor(address settlement_, address stock_, address oracle_, address owner_) Ownable(owner_) {
        settlement = IERC20(settlement_);
        stock = IERC20(stock_);
        oracle = VelanosPriceOracle(oracle_);
        settlementDecimals = IERC20Metadata(settlement_).decimals();
        stockDecimals = IERC20Metadata(stock_).decimals();
    }

    function setParams(uint16 spreadBps_, uint256 depthUsd_) external onlyOwner {
        spreadBps = spreadBps_;
        depthUsd = depthUsd_;
        emit PoolParamsSet(spreadBps_, depthUsd_);
    }

    // ───────────────────────────────── quoting ──────────────────────────────────

    /// @notice Stock received for `amountIn` settlement units, after spread and impact.
    function quoteBuy(uint256 amountIn) public view returns (uint256 out, uint256 fair) {
        uint256 usd = _settlementToUsd(amountIn);
        fair = _usdToStock(usd);
        out = Math.mulDiv(fair, BPS - _feeBps(usd), BPS);
    }

    /// @notice Settlement received for `amountIn` stock units, after spread and impact.
    function quoteSell(uint256 amountIn) public view returns (uint256 out, uint256 fair) {
        uint256 usd = _stockToUsd(amountIn);
        fair = _usdToSettlement(usd);
        out = Math.mulDiv(fair, BPS - _feeBps(usd), BPS);
    }

    /// @dev Spread plus linear depth impact, capped so a quote can never go negative.
    function _feeBps(uint256 amountInUsd) internal view returns (uint256) {
        uint256 impact = depthUsd == 0 ? 0 : (amountInUsd * BPS) / depthUsd;
        uint256 total = uint256(spreadBps) + impact;
        return total > BPS - 1 ? BPS - 1 : total;
    }

    // ──────────────────────────────── swapping ──────────────────────────────────

    function swapSettlementForStock(uint256 amountIn, address to) external returns (uint256 out) {
        (out,) = quoteBuy(amountIn);
        uint256 available = stock.balanceOf(address(this));
        if (out > available) revert InsufficientInventory(out, available);

        settlement.safeTransferFrom(msg.sender, address(this), amountIn);
        stock.safeTransfer(to, out);
        emit SwapExecuted(msg.sender, true, amountIn, out);
    }

    function swapStockForSettlement(uint256 amountIn, address to) external returns (uint256 out) {
        (out,) = quoteSell(amountIn);
        uint256 available = settlement.balanceOf(address(this));
        if (out > available) revert InsufficientInventory(out, available);

        stock.safeTransferFrom(msg.sender, address(this), amountIn);
        settlement.safeTransfer(to, out);
        emit SwapExecuted(msg.sender, false, amountIn, out);
    }

    function seed(uint256 settlementAmount, uint256 stockAmount) external onlyOwner {
        if (settlementAmount > 0) settlement.safeTransferFrom(msg.sender, address(this), settlementAmount);
        if (stockAmount > 0) stock.safeTransferFrom(msg.sender, address(this), stockAmount);
    }

    // ─────────────────────────── unit conversions ───────────────────────────────

    function _settlementToUsd(uint256 amount) internal view returns (uint256) {
        return Math.mulDiv(amount, VelanosConstants.PRICE_SCALE, 10 ** settlementDecimals);
    }

    function _usdToSettlement(uint256 usd) internal view returns (uint256) {
        return Math.mulDiv(usd, 10 ** settlementDecimals, VelanosConstants.PRICE_SCALE);
    }

    function _stockToUsd(uint256 amount) internal view returns (uint256) {
        (uint256 p,) = oracle.price(address(stock));
        return Math.mulDiv(amount, p, 10 ** stockDecimals);
    }

    function _usdToStock(uint256 usd) internal view returns (uint256) {
        (uint256 p,) = oracle.price(address(stock));
        return Math.mulDiv(usd, 10 ** stockDecimals, p);
    }
}
