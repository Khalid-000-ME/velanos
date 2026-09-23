import type { Address } from 'viem';
import { IntentKind, type Mandate, type TradeIntent, VaultKind, VaultState, type VaultSnapshot } from '../src/types.js';

export const AGENT = '0x000000000000000000000000000000000000A6e7' as Address;
export const OPERATOR = '0x00000000000000000000000000000000000009e0' as Address;
export const USDG = '0x00000000000000000000000000000000000005d6' as Address;
export const TSLA = '0x00000000000000000000000000000000000075a1' as Address;
export const AMZN = '0x000000000000000000000000000000000000a727' as Address;
export const PLTR = '0x0000000000000000000000000000000000009177' as Address;
export const ADAPTER = '0x000000000000000000000000000000000000ADa9' as Address;
export const ROGUE_ADAPTER = '0x000000000000000000000000000000000000bAd0' as Address;
export const VAULT = '0x0000000000000000000000000000000000007a17' as Address;

export const ONE_USDG = 1_000_000n;

/** Mirrors `test/Fixtures.sol` so the two suites describe the same mandate. */
export function spotMandate(): Mandate {
  return {
    agentSigner: AGENT,
    operator: OPERATOR,
    settlementAsset: USDG,
    kind: VaultKind.SPOT,
    allowedAssets: [TSLA, AMZN],
    allowedAdapters: [ADAPTER],
    maxAllocation: 1_000n * ONE_USDG,
    maxTradeAmount: 250n * ONE_USDG,
    maxAssetExposureBps: 4_000,
    maxSlippageBps: 100,
    maxLeverageBps: 10_000,
    maxDrawdownBps: 800,
    maxDailyLossBps: 300,
    start: 1_000n,
    expiry: 1_000_000n,
    bondRequired: 300n * ONE_USDG,
    perViolationPenalty: 50n * ONE_USDG,
    reporterBountyBps: 1_000,
    riskTier: 1,
    metadataURI: 'ipfs://mandate',
  };
}

export function perpMandate(): Mandate {
  return { ...spotMandate(), kind: VaultKind.PERP, maxLeverageBps: 30_000, maxTradeAmount: 200n * ONE_USDG };
}

export function buyIntent(): TradeIntent {
  return {
    vault: VAULT,
    kind: IntentKind.SPOT_BUY,
    adapter: ADAPTER,
    assetIn: USDG,
    assetOut: TSLA,
    amountIn: 150n * ONE_USDG,
    minOut: 0n,
    leverageBps: 10_000,
    isLong: true,
    nonce: 1n,
    issuedAt: 2_000n,
    deadline: 2_060n,
    rationaleHash: `0x${'11'.repeat(32)}`,
  };
}

export function sellIntent(): TradeIntent {
  return { ...buyIntent(), kind: IntentKind.SPOT_SELL, assetIn: TSLA, assetOut: USDG };
}

export function perpOpenIntent(): TradeIntent {
  return { ...buyIntent(), kind: IntentKind.PERP_OPEN, leverageBps: 20_000, amountIn: 100n * ONE_USDG };
}

export function healthySnapshot(): VaultSnapshot {
  return {
    state: VaultState.ACTIVE,
    navSettlement: 1_000n * ONE_USDG,
    pricePerShareWad: 10n ** 18n,
    dayOpenPricePerShareWad: 10n ** 18n,
    assetValueBefore: 0n,
    settlementBalance: 1_000n * ONE_USDG,
    assetInBalance: 1_000n * ONE_USDG,
    quotedOut: 100n * 10n ** 18n,
    oracleOut: 100n * 10n ** 18n,
  };
}
