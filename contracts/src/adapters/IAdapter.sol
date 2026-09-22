// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TradeIntent} from "../AegisTypes.sol";

/**
 * @notice The only way funds leave a vault.
 *
 * Vaults never make an arbitrary `call`. They approve an exact amount to an adapter that
 * is named in the mandate's allowlist and invoke this typed interface, so the set of things
 * an agent can do with depositor money is fixed when the vault is created.
 */
interface IAdapter {
    /**
     * @param i the intent about to be executed
     * @return quotedOut what the venue would actually return right now
     * @return oracleOut what the oracle says a fair fill is worth
     * @dev The pair is what makes rule 202 meaningful: the guard compares the venue's
     *      quote against the oracle's fair value rather than trusting either alone.
     */
    function quote(TradeIntent calldata i) external view returns (uint256 quotedOut, uint256 oracleOut);

    /// @notice Pulls exactly `i.amountIn` of `i.assetIn` from the calling vault.
    function execute(TradeIntent calldata i) external returns (uint256 amountOut);

    /// @notice Value of open positions for `vault`, in settlement units. Spot adapters return 0.
    function positionValue(address vault) external view returns (uint256);

    /// @notice Closes everything the adapter holds for `vault`. Used by `unwind`.
    function closeAll(address vault) external returns (uint256 settlementOut);
}
