// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {
    IntentKind,
    Mandate,
    TradeIntent,
    VaultKind,
    VaultSnapshot,
    VaultState
} from "../src/AegisTypes.sol";

/**
 * @notice Mandate and intent builders shared by the test suite.
 *
 * The numbers mirror the demo mandate (1,000 tUSDG allocation, 250 max trade, 40% per-asset
 * exposure, 8% drawdown floor) so a test failure reads directly against the demo script.
 */
contract Fixtures {
    address internal constant AGENT = address(0xA6E7);
    address internal constant OPERATOR = address(0x09E0);
    address internal constant USDG = address(0x05D6);
    address internal constant TSLA = address(0x75A1);
    address internal constant AMZN = address(0xA727);
    address internal constant PLTR = address(0x9177);
    address internal constant ADAPTER = address(0xADA9);
    address internal constant ROGUE_ADAPTER = address(0xBAD0);
    address internal constant VAULT = address(0x7A17);

    uint256 internal constant ONE_USDG = 1e6;

    function spotMandate() internal pure returns (Mandate memory m) {
        address[] memory assets = new address[](2);
        assets[0] = TSLA;
        assets[1] = AMZN;
        address[] memory adapters = new address[](1);
        adapters[0] = ADAPTER;

        m = Mandate({
            agentSigner: AGENT,
            operator: OPERATOR,
            settlementAsset: USDG,
            kind: VaultKind.SPOT,
            allowedAssets: assets,
            allowedAdapters: adapters,
            maxAllocation: 1_000 * ONE_USDG,
            maxTradeAmount: 250 * ONE_USDG,
            maxAssetExposureBps: 4_000,
            maxSlippageBps: 100,
            maxLeverageBps: 10_000,
            maxDrawdownBps: 800,
            maxDailyLossBps: 300,
            start: 1_000,
            expiry: 1_000_000,
            bondRequired: 300 * ONE_USDG,
            perViolationPenalty: 50 * ONE_USDG,
            reporterBountyBps: 1_000,
            riskTier: 1,
            metadataURI: "ipfs://mandate"
        });
    }

    function perpMandate() internal pure returns (Mandate memory m) {
        m = spotMandate();
        m.kind = VaultKind.PERP;
        m.maxLeverageBps = 30_000;
        m.maxTradeAmount = 200 * ONE_USDG;
    }

    /// @dev A clean SPOT_BUY: 150 tUSDG of TSLA, 1x, inside the term, 60s validity.
    function buyIntent() internal pure returns (TradeIntent memory i) {
        i = TradeIntent({
            vault: VAULT,
            kind: IntentKind.SPOT_BUY,
            adapter: ADAPTER,
            assetIn: USDG,
            assetOut: TSLA,
            amountIn: 150 * ONE_USDG,
            minOut: 0,
            leverageBps: 10_000,
            isLong: true,
            nonce: 1,
            issuedAt: 2_000,
            deadline: 2_060,
            rationaleHash: keccak256("momentum is positive")
        });
    }

    function sellIntent() internal pure returns (TradeIntent memory i) {
        i = buyIntent();
        i.kind = IntentKind.SPOT_SELL;
        i.assetIn = TSLA;
        i.assetOut = USDG;
    }

    function perpOpenIntent() internal pure returns (TradeIntent memory i) {
        i = buyIntent();
        i.kind = IntentKind.PERP_OPEN;
        i.leverageBps = 20_000;
        i.amountIn = 100 * ONE_USDG;
    }

    /// @dev A healthy vault: 1,000 NAV, share price 1.0, no exposure yet, generous balances.
    function healthySnapshot() internal pure returns (VaultSnapshot memory s) {
        s = VaultSnapshot({
            state: VaultState.ACTIVE,
            navSettlement: 1_000 * ONE_USDG,
            pricePerShareWad: 1e18,
            dayOpenPricePerShareWad: 1e18,
            assetValueBefore: 0,
            settlementBalance: 1_000 * ONE_USDG,
            assetInBalance: 1_000 * ONE_USDG,
            quotedOut: 100e18,
            oracleOut: 100e18
        });
    }
}
