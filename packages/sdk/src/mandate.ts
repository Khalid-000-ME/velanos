import { formatUnits } from 'viem';
import { IntentKind, type Mandate, VaultKind } from './types';

export interface MandateEnglishOptions {
  settlementSymbol: string;
  settlementDecimals: number;
  /** address → ticker, so the sentence reads "TSLA, AMZN" rather than "0x75a1…". */
  assetSymbols?: Record<string, string>;
  venueName?: string;
}

const RISK_TIERS = ['conservative', 'balanced', 'aggressive'] as const;

/**
 * Renders a mandate as the sentences shown on the fund screen.
 *
 * A depositor should not have to read a struct to know what they are agreeing to, and a mandate
 * nobody can read is a mandate nobody can hold an agent to. Every line here corresponds to a rule
 * the contract actually enforces — there is no sentence in this output that is not checked
 * on-chain.
 *
 * Deliberately avoids insurance vocabulary. The promise is a loss floor backed by the agent's bond,
 * not cover, and the wording has to keep saying so.
 */
export function mandateToEnglish(mandate: Mandate, opts: MandateEnglishOptions): string[] {
  const amount = (v: bigint) =>
    `${formatUnits(v, opts.settlementDecimals)} ${opts.settlementSymbol}`;
  const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
  const sym = (a: string) => opts.assetSymbols?.[a.toLowerCase()] ?? shorten(a);

  const assets = mandate.allowedAssets.map(sym).join(', ');
  const isPerp = mandate.kind === VaultKind.PERP;

  const lines = [
    isPerp
      ? `Trades perpetual futures on ${assets}, and nothing else.`
      : `Trades ${assets}, and nothing else.`,
    `Settles in ${opts.settlementSymbol}. Takes at most ${amount(mandate.maxAllocation)} of deposits.`,
    `No single ${isPerp ? 'position open' : 'buy'} may exceed ${amount(mandate.maxTradeAmount)}.`,
    `No one ${isPerp ? 'market' : 'holding'} may exceed ${pct(mandate.maxAssetExposureBps)} of the vault.`,
    isPerp
      ? `Leverage is capped at ${(mandate.maxLeverageBps / 10_000).toFixed(1)}x.`
      : 'No leverage and no borrowing.',
    `Fills must be within ${pct(mandate.maxSlippageBps)} of the oracle price.`,
    `New positions pause if the vault is down more than ${pct(mandate.maxDailyLossBps)} on the day.`,
    `If NAV per share falls more than ${pct(mandate.maxDrawdownBps)} below its high-water mark, trading halts and the agent's bond tops depositors back up to that floor — up to the size of the bond.`,
    `The agent has posted ${amount(mandate.bondRequired)} of its own capital. Each rule breach moves ${amount(mandate.perViolationPenalty)} of it to depositors.`,
    `Whoever reports a breach keeps ${pct(mandate.reporterBountyBps)} of that penalty.`,
    `Two breaches freeze the vault and unwind it to ${opts.settlementSymbol}.`,
    `Risk tier: ${RISK_TIERS[mandate.riskTier] ?? 'unrated'}. Term ends ${formatTimestamp(mandate.expiry)}.`,
  ];

  if (opts.venueName) lines.splice(2, 0, `Routes only through ${opts.venueName}.`);
  return lines;
}

/** One-line summary for a card or a list row. */
export function mandateHeadline(mandate: Mandate, opts: MandateEnglishOptions): string {
  const amount = (v: bigint) => `${formatUnits(v, opts.settlementDecimals)} ${opts.settlementSymbol}`;
  return `Max loss ${(mandate.maxDrawdownBps / 100).toFixed(0)}% · backed by ${amount(mandate.bondRequired)}`;
}

/** What the covered / not-covered lists on the fund screen render. */
export const COVERED = [
  'Trades outside the mandate',
  'Oversized or over-leveraged orders',
  'Acting after freeze or expiry',
  'Losses beyond the drawdown floor (up to bond size)',
  'Failure to settle at expiry',
] as const;

export const NOT_COVERED = ['Losses within the drawdown limit', 'Strategy underperformance'] as const;

export function intentSummary(
  kind: IntentKind,
  assetSymbol: string,
  amountIn: bigint,
  settlementDecimals: number,
  settlementSymbol: string,
): string {
  const amount = `${formatUnits(amountIn, settlementDecimals)} ${settlementSymbol}`;
  switch (kind) {
    case IntentKind.SPOT_BUY:
      return `BUY ${assetSymbol} ${amount}`;
    case IntentKind.SPOT_SELL:
      return `SELL ${assetSymbol}`;
    case IntentKind.PERP_OPEN:
      return `OPEN ${assetSymbol} ${amount}`;
    case IntentKind.PERP_CLOSE:
      return `CLOSE ${assetSymbol}`;
  }
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatTimestamp(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}
