// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IntentKind, TradeIntent} from "../VelanosTypes.sol";
import {IAdapter} from "./IAdapter.sol";
import {OracleSwapPool} from "../testenv/OracleSwapPool.sol";

interface IAdapterFactory {
    function isVault(address) external view returns (bool);
}

/**
 * @title StockSwapAdapter
 * @notice Routes spot equity trades for every vault on Robinhood Chain to the oracle-priced
 *         pool for that stock.
 *
 * Shared by all spot vaults, and holds nothing: tokens arrive from the calling vault and leave
 * to the calling vault within the same call. Only factory-registered vaults may call it, so a
 * stray approval somewhere else cannot be routed through here.
 */
contract StockSwapAdapter is IAdapter, Ownable {
    using SafeERC20 for IERC20;

    address public immutable settlement;
    address public immutable factory;

    /// @notice stock token → its oracle-priced pool.
    mapping(address => address) public poolFor;

    event PoolSet(address indexed stock, address indexed pool);

    error OnlyVault(address caller);
    error NoPoolForAsset(address asset);
    error UnsupportedIntentKind();

    constructor(address settlement_, address factory_, address owner_) Ownable(owner_) {
        settlement = settlement_;
        factory = factory_;
    }

    function setPool(address stock, address pool) external onlyOwner {
        poolFor[stock] = pool;
        emit PoolSet(stock, pool);
    }

    function quote(TradeIntent calldata i) external view returns (uint256 quotedOut, uint256 oracleOut) {
        if (i.kind == IntentKind.SPOT_BUY) {
            OracleSwapPool pool = OracleSwapPool(_pool(i.assetOut));
            return pool.quoteBuy(i.amountIn);
        }
        if (i.kind == IntentKind.SPOT_SELL) {
            OracleSwapPool pool = OracleSwapPool(_pool(i.assetIn));
            return pool.quoteSell(i.amountIn);
        }
        revert UnsupportedIntentKind();
    }

    function execute(TradeIntent calldata i) external returns (uint256 amountOut) {
        if (!IAdapterFactory(factory).isVault(msg.sender)) revert OnlyVault(msg.sender);

        if (i.kind == IntentKind.SPOT_BUY) {
            address pool = _pool(i.assetOut);
            IERC20(settlement).safeTransferFrom(msg.sender, address(this), i.amountIn);
            IERC20(settlement).forceApprove(pool, i.amountIn);
            amountOut = OracleSwapPool(pool).swapSettlementForStock(i.amountIn, msg.sender);
            IERC20(settlement).forceApprove(pool, 0);
            return amountOut;
        }

        if (i.kind == IntentKind.SPOT_SELL) {
            address pool = _pool(i.assetIn);
            IERC20(i.assetIn).safeTransferFrom(msg.sender, address(this), i.amountIn);
            IERC20(i.assetIn).forceApprove(pool, i.amountIn);
            amountOut = OracleSwapPool(pool).swapStockForSettlement(i.amountIn, msg.sender);
            IERC20(i.assetIn).forceApprove(pool, 0);
            return amountOut;
        }

        revert UnsupportedIntentKind();
    }

    /// @dev Spot vaults hold tokens directly, so there is no adapter-side position to value.
    function positionValue(address) external pure returns (uint256) {
        return 0;
    }

    /// @dev The vault unwinds spot holdings itself, asset by asset, through `execute`.
    function closeAll(address) external pure returns (uint256) {
        return 0;
    }

    function _pool(address stock) internal view returns (address pool) {
        pool = poolFor[stock];
        if (pool == address(0)) revert NoPoolForAsset(stock);
    }
}
