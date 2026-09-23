import { describe, expect, it } from 'vitest';
import { checkStateful, checkStatic, explain, floorPricePerShareWad, drawdownShortfall } from '../src/guard.js';
import { EXPLAIN_ROW_ORDER, RULES } from '../src/rules.js';
import { IntentKind, VaultState } from '../src/types.js';
import {
  AMZN,
  ONE_USDG,
  PLTR,
  ROGUE_ADAPTER,
  TSLA,
  buyIntent,
  healthySnapshot,
  perpMandate,
  perpOpenIntent,
  sellIntent,
  spotMandate,
} from './fixtures.js';

describe('checkStatic', () => {
  it('passes a clean buy', () => {
    expect(checkStatic(buyIntent(), spotMandate(), 0n)).toBe(0);
  });

  it('reports 108 for a perp intent on a spot vault', () => {
    expect(checkStatic(perpOpenIntent(), spotMandate(), 0n)).toBe(108);
  });

  it('reports 102 for an unknown adapter', () => {
    expect(checkStatic({ ...buyIntent(), adapter: ROGUE_ADAPTER }, spotMandate(), 0n)).toBe(102);
  });

  it('reports 101 for a forbidden stock', () => {
    expect(checkStatic({ ...buyIntent(), assetOut: PLTR }, spotMandate(), 0n)).toBe(101);
  });

  it('reports 101 when a buy spends something other than the settlement asset', () => {
    expect(checkStatic({ ...buyIntent(), assetIn: TSLA }, spotMandate(), 0n)).toBe(101);
  });

  it('reports 101 when a sell does not return to the settlement asset', () => {
    expect(checkStatic({ ...sellIntent(), assetOut: AMZN }, spotMandate(), 0n)).toBe(101);
  });

  it('reports 104 for any leverage on a spot vault', () => {
    expect(checkStatic({ ...buyIntent(), leverageBps: 20_000 }, spotMandate(), 0n)).toBe(104);
  });

  it('reports 104 above the perp leverage cap', () => {
    expect(checkStatic({ ...perpOpenIntent(), leverageBps: 100_000 }, perpMandate(), 0n)).toBe(104);
  });

  it('reports 103 for an oversized buy', () => {
    expect(checkStatic({ ...buyIntent(), amountIn: 2_500n * ONE_USDG }, spotMandate(), 0n)).toBe(103);
  });

  it('never size-caps a sell', () => {
    expect(checkStatic({ ...sellIntent(), amountIn: 10_000n * ONE_USDG }, spotMandate(), 0n)).toBe(0);
  });

  it('reports 107 for a validity window over 5 minutes', () => {
    const i = buyIntent();
    expect(checkStatic({ ...i, deadline: i.issuedAt + 301n }, spotMandate(), 0n)).toBe(107);
  });

  it('reports 105 for an intent signed after expiry', () => {
    expect(
      checkStatic({ ...buyIntent(), issuedAt: 1_000_000n, deadline: 1_000_060n }, spotMandate(), 0n),
    ).toBe(105);
  });

  it('reports 106 for an intent signed after a freeze', () => {
    const i = buyIntent();
    expect(checkStatic(i, spotMandate(), i.issuedAt)).toBe(106);
  });

  it('reports the first failure in spec order, not the worst one', () => {
    // 101 precedes 104, which is what scenario S3 relies on.
    const i = { ...perpOpenIntent(), assetOut: PLTR, leverageBps: 100_000 };
    expect(checkStatic(i, perpMandate(), 0n)).toBe(101);
  });
});

describe('checkStateful', () => {
  it('passes a clean buy', () => {
    expect(checkStateful(buyIntent(), spotMandate(), healthySnapshot(), 2_010n)).toBe(0);
  });

  it('reports 204 past the deadline', () => {
    const i = buyIntent();
    expect(checkStateful(i, spotMandate(), healthySnapshot(), i.deadline + 1n)).toBe(204);
  });

  it('reports 206 unless the vault is ACTIVE', () => {
    const s = { ...healthySnapshot(), state: VaultState.WARNED };
    expect(checkStateful(buyIntent(), spotMandate(), s, 2_010n)).toBe(206);
  });

  it('reports 205 when the balance is short', () => {
    const s = { ...healthySnapshot(), assetInBalance: 10n * ONE_USDG };
    expect(checkStateful(buyIntent(), spotMandate(), s, 2_010n)).toBe(205);
  });

  it('reports 202 when the quote is worse than the oracle tolerance', () => {
    const s = { ...healthySnapshot(), quotedOut: 98n * 10n ** 18n };
    expect(checkStateful(buyIntent(), spotMandate(), s, 2_010n)).toBe(202);
  });

  it('reports 201 when the trade would breach the per-asset cap', () => {
    const s = { ...healthySnapshot(), assetValueBefore: 250n * ONE_USDG };
    const i = { ...buyIntent(), amountIn: 240n * ONE_USDG };
    expect(checkStateful(i, spotMandate(), s, 2_010n)).toBe(201);
  });

  it('reports 203 when the daily loss budget is spent', () => {
    const s = { ...healthySnapshot(), pricePerShareWad: 960_000_000_000_000_000n };
    expect(checkStateful(buyIntent(), spotMandate(), s, 2_010n)).toBe(203);
  });

  it('still allows selling on a bad day', () => {
    const s = { ...healthySnapshot(), pricePerShareWad: 500_000_000_000_000_000n };
    expect(checkStateful(sellIntent(), spotMandate(), s, 2_010n)).toBe(0);
  });

  it('never returns a slashable rule', () => {
    const s = { ...healthySnapshot(), navSettlement: 1n, assetValueBefore: 10n ** 30n };
    const rule = checkStateful(buyIntent(), spotMandate(), s, 2_010n);
    expect(rule === 0 || RULES[rule].slashable).toBe(false);
  });
});

describe('explain', () => {
  it('returns every row in spec order', () => {
    const rows = explain(buyIntent(), spotMandate(), 0n, healthySnapshot(), 2_010n);
    expect(rows.map((r) => r.ruleId)).toEqual([...EXPLAIN_ROW_ORDER]);
  });

  it('passes every row for a clean intent', () => {
    const rows = explain(buyIntent(), spotMandate(), 0n, healthySnapshot(), 2_010n);
    expect(rows.every((r) => r.passed)).toBe(true);
  });

  it('reports all failures, not just the first', () => {
    const i = { ...buyIntent(), assetOut: PLTR, amountIn: 2_500n * ONE_USDG };
    const rows = explain(i, spotMandate(), 0n, healthySnapshot(), 2_010n);
    expect(rows.find((r) => r.ruleId === 101)?.passed).toBe(false);
    expect(rows.find((r) => r.ruleId === 103)?.passed).toBe(false);
  });

  it('shows post-trade exposure against the cap', () => {
    const i = { ...buyIntent(), amountIn: 240n * ONE_USDG };
    const s = { ...healthySnapshot(), assetValueBefore: 250n * ONE_USDG };
    const row = explain(i, spotMandate(), 0n, s, 2_010n).find((r) => r.ruleId === 201)!;
    expect(row.actual).toBe(4_900n);
    expect(row.limit).toBe(4_000n);
  });
});

describe('floor and shortfall', () => {
  it('derives the floor from the high-water mark', () => {
    expect(floorPricePerShareWad(10n ** 18n, 800)).toBe(920_000_000_000_000_000n);
  });

  it('is zero while NAV is above the floor', () => {
    expect(drawdownShortfall(10n ** 18n, 920_000_000_000_000_000n, 1_000n * ONE_USDG)).toBe(0n);
  });

  it('prices the gap back to the floor in settlement units', () => {
    // 0.871 vs a 0.92 floor over 1,000 shares: about 49 tUSDG.
        const paid = drawdownShortfall(871_000_000_000_000_000n, 920_000_000_000_000_000n, 1_000n * ONE_USDG);
    expect(paid).toBe(49_000_000n);
  });
});

describe('RULES metadata', () => {
  it('marks exactly the 1xx band as slashable', () => {
    for (const [id, meta] of Object.entries(RULES)) {
      const n = Number(id);
      expect(meta.slashable).toBe(n >= 101 && n <= 108);
    }
  });

  it('bands every rule consistently with its id', () => {
    for (const [id, meta] of Object.entries(RULES)) {
      const n = Number(id);
      const expected = n < 200 ? 'static' : n < 300 ? 'stateful' : 'validity';
      expect(meta.band).toBe(expected);
    }
  });
});

describe('IntentKind', () => {
  it('keeps the enum aligned with Solidity', () => {
    expect(IntentKind.SPOT_BUY).toBe(0);
    expect(IntentKind.SPOT_SELL).toBe(1);
    expect(IntentKind.PERP_OPEN).toBe(2);
    expect(IntentKind.PERP_CLOSE).toBe(3);
  });
});
