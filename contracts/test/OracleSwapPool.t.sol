// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Harness} from "./Harness.sol";

/**
 * @notice The venue is deterministic by design, and the demo's arithmetic depends on it.
 *
 * If a fill were path-dependent we could not state in advance what NAV becomes after a −20%
 * shock, and the drawdown top-up would be a guess rather than a number a judge can check.
 */
contract OracleSwapPoolTest is Harness {
    function test_quoteBuy_chargesSpreadPlusDepthImpact() public view {
        // $150 at $250/share = 0.6 shares before costs. Spread is 30 bps; impact is
        // 150 / 50,000 of the quote, another 30 bps. 60 bps in total.
        (uint256 out, uint256 fair) = tslaPool.quoteBuy(150 * ONE_USDG);

        assertEq(fair, 0.6e18);
        assertEq(out, (0.6e18 * (10_000 - 60)) / 10_000);
    }

    function test_quoteSell_isSymmetric() public view {
        (uint256 out, uint256 fair) = tslaPool.quoteSell(0.6e18);
        assertEq(fair, 150 * ONE_USDG);
        assertEq(out, (150 * ONE_USDG * (10_000 - 60)) / 10_000);
    }

    /// @dev Impact scales with size, so a larger order is genuinely worse — enough to make
    ///      the exposure and slippage rules meaningful rather than decorative.
    function test_quote_impactGrowsWithSize() public view {
        (uint256 small,) = tslaPool.quoteBuy(100 * ONE_USDG);
        (uint256 large,) = tslaPool.quoteBuy(1_000 * ONE_USDG);

        uint256 smallBpsLost = 10_000 - (small * 10_000) / ((100 * ONE_USDG * 1e18) / (250 * ONE_USDG));
        uint256 largeBpsLost = 10_000 - (large * 10_000) / ((1_000 * ONE_USDG * 1e18) / (250 * ONE_USDG));
        assertGt(largeBpsLost, smallBpsLost);
    }

    function test_quote_followsTheOracle() public {
        (uint256 before,) = tslaPool.quoteBuy(250 * ONE_USDG);
        _shock(address(tsla), -5_000); // TSLA halves
        (uint256 after_,) = tslaPool.quoteBuy(250 * ONE_USDG);

        assertApproxEqRel(after_, before * 2, 0.01e18, "half the price should buy twice the shares");
    }

    function test_quote_feeIsCappedSoAQuoteNeverGoesNegative() public view {
        // A trade far deeper than the pool's depth would otherwise imply a fee above 100%.
        (uint256 out,) = tslaPool.quoteBuy(10_000_000 * ONE_USDG);
        assertGt(out, 0);
    }

    function test_roundTrip_losesOnlyTheSpreadAndImpact() public {
        uint256 start = 150 * ONE_USDG;
        (uint256 shares,) = tslaPool.quoteBuy(start);
        (uint256 back,) = tslaPool.quoteSell(shares);

        assertLt(back, start);
        // Two crossings at ~60 bps each: about 1.2% round trip, which is why the demo buys in
        // 250-tUSDG slices rather than one block.
        assertGt(back, (start * 985) / 1_000, "a round trip should cost under 1.5%");
    }
}
