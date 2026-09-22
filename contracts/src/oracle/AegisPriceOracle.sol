// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AegisPriceOracle
 * @notice USD prices with 8 decimals for every asset a vault can hold.
 *
 * This is a **test oracle**: a role-gated setter, disclosed as such in the UI and the
 * threat model. It exists so the drawdown demo is exact and reproducible — a judge can
 * watch NAV cross a floor on a number we chose, not one the market happened to produce.
 * On a real deployment this contract is replaced by Chainlink feeds; nothing else in the
 * protocol changes, because everything reads prices through this interface.
 */
contract AegisPriceOracle is AccessControl {
    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER_ROLE");

    struct Price {
        uint256 usd8;
        uint64 updatedAt;
    }

    mapping(address => Price) private _prices;

    /// @notice Settlement assets are pinned to $1.00 and cannot be shocked.
    mapping(address => bool) public isSettlementAsset;

    uint256 public constant ONE_USD = 1e8;

    event PriceSet(address indexed asset, uint256 priceUsd8, uint64 updatedAt);
    event MarketShock(address indexed asset, int16 bps, uint256 fromUsd8, uint256 toUsd8);
    event SettlementAssetPinned(address indexed asset);

    error UnknownAsset(address asset);
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

    function setPrice(address asset, uint256 priceUsd8) external onlyRole(PRICE_UPDATER_ROLE) {
        if (isSettlementAsset[asset]) revert CannotShockSettlementAsset(asset);
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
        Price memory p = _prices[asset];
        if (p.updatedAt == 0) revert UnknownAsset(asset);
        return (p.usd8, p.updatedAt);
    }

    function hasPrice(address asset) external view returns (bool) {
        return _prices[asset].updatedAt != 0;
    }
}
