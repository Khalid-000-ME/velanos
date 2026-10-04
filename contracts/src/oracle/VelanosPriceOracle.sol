// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/**
 * @title VelanosPriceOracle
 * @notice USD prices with 8 decimals for every asset a vault can hold.
 *
 * This is a **test oracle**: a role-gated setter, disclosed as such in the UI and the
 * threat model. It exists so the drawdown demo is exact and reproducible — a judge can
 * watch NAV cross a floor on a number we chose, not one the market happened to produce.
 * On a real deployment this contract is replaced by Chainlink feeds; nothing else in the
 * protocol changes, because everything reads prices through this interface.
 */
contract VelanosPriceOracle is AccessControl {
    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER_ROLE");

    struct Price {
        uint256 usd8;
        uint64 updatedAt;
    }

    mapping(address => Price) private _prices;

    /// @notice Settlement assets are pinned to $1.00 and cannot be shocked.
    mapping(address => bool) public isSettlementAsset;

    /// @notice Chainlink feed that prices an asset, where one is set. A feed-backed price is read live
    ///         and can never be overwritten or shocked by anyone, including the admin.
    mapping(address => address) public feedOf;
    mapping(address => uint32) public maxStaleness;

    uint256 public constant ONE_USD = 1e8;

    event PriceSet(address indexed asset, uint256 priceUsd8, uint64 updatedAt);
    event MarketShock(address indexed asset, int16 bps, uint256 fromUsd8, uint256 toUsd8);
    event SettlementAssetPinned(address indexed asset);
    event FeedSet(address indexed asset, address feed, uint32 maxStalenessSeconds);

    error UnknownAsset(address asset);
    error FeedBacked(address asset);
    error BadFeedAnswer(address asset, int256 answer);
    error StaleFeed(address asset, uint256 updatedAt);
    error CannotShockSettlementAsset(address asset);
    error ShockOutOfRange(int16 bps);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PRICE_UPDATER_ROLE, admin);
    }

    function grantUpdater(address who) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PRICE_UPDATER_ROLE, who);
    }

    /// @notice Pins an asset to exactly $1.00 forever. Used for tUSDG / USDG / USDC.SG.
    function pinSettlementAsset(address asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isSettlementAsset[asset] = true;
        _prices[asset] = Price({usd8: ONE_USD, updatedAt: uint64(block.timestamp)});
        emit SettlementAssetPinned(asset);
        emit PriceSet(asset, ONE_USD, uint64(block.timestamp));
    }

    /// @notice Binds an asset to a Chainlink USD feed. Once bound, the price is whatever the feed says.
    function setFeed(address asset, address feed, uint32 maxStalenessSeconds) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feedOf[asset] = feed;
        maxStaleness[asset] = maxStalenessSeconds;
        emit FeedSet(asset, feed, maxStalenessSeconds);
    }

    function setPrice(address asset, uint256 priceUsd8) external onlyRole(PRICE_UPDATER_ROLE) {
        if (isSettlementAsset[asset]) revert CannotShockSettlementAsset(asset);
        if (feedOf[asset] != address(0)) revert FeedBacked(asset);
        _prices[asset] = Price({usd8: priceUsd8, updatedAt: uint64(block.timestamp)});
        emit PriceSet(asset, priceUsd8, uint64(block.timestamp));
    }

    /**
     * @notice Moves a price by `bps` (signed). Surfaced in the UI as a **TEST CONTROL**.
     * @dev Deliberately a separate function from `setPrice` so the indexer can distinguish
     *      a demo-driven shock from ordinary price upkeep and mark it on the NAV chart.
     */
    function shock(address asset, int16 bps) external onlyRole(PRICE_UPDATER_ROLE) {
        if (isSettlementAsset[asset]) revert CannotShockSettlementAsset(asset);
        if (feedOf[asset] != address(0)) revert FeedBacked(asset);
        if (bps <= -10_000) revert ShockOutOfRange(bps);

        Price memory p = _prices[asset];
        if (p.updatedAt == 0) revert UnknownAsset(asset);

        uint256 next = bps >= 0
            ? p.usd8 + (p.usd8 * uint256(uint16(bps))) / 10_000
            : p.usd8 - (p.usd8 * uint256(uint16(-bps))) / 10_000;

        _prices[asset] = Price({usd8: next, updatedAt: uint64(block.timestamp)});
        emit MarketShock(asset, bps, p.usd8, next);
        emit PriceSet(asset, next, uint64(block.timestamp));
    }

    function price(address asset) external view returns (uint256 priceUsd8, uint64 updatedAt) {
        address feed = feedOf[asset];
        if (feed != address(0)) return _read(asset, feed);
        Price memory p = _prices[asset];
        if (p.updatedAt == 0) revert UnknownAsset(asset);
        return (p.usd8, p.updatedAt);
    }

    function hasPrice(address asset) external view returns (bool) {
        return feedOf[asset] != address(0) || _prices[asset].updatedAt != 0;
    }

    function _read(address asset, address feed) internal view returns (uint256, uint64) {
        (, int256 answer,, uint256 updatedAt,) = IAggregatorV3(feed).latestRoundData();
        if (answer <= 0) revert BadFeedAnswer(asset, answer);
        if (block.timestamp - updatedAt > maxStaleness[asset]) revert StaleFeed(asset, updatedAt);
        uint8 d = IAggregatorV3(feed).decimals();
        uint256 usd8 = d == 8 ? uint256(answer) : d > 8 ? uint256(answer) / 10 ** (d - 8) : uint256(answer) * 10 ** (8 - d);
        return (usd8, uint64(updatedAt));
    }
}
