import { z } from 'zod';

/**
 * Integration modes (PRD §4.2, §13). Every mode is surfaced in the UI status bar so a
 * judge can always tell what is real and what is a test stand-in.
 */
export const ModesSchema = z.object({
  usdg: z.enum(['mock', 'official']).default('mock'),
  stocks: z.enum(['mock', 'official']).default('mock'),
  perp: z.enum(['gmx', 'mock', 'none']).default('none'),
  llm: z.enum(['live', 'replay']).default('replay'),
});
export type Modes = z.infer<typeof ModesSchema>;

export function modesFromEnv(env: Record<string, string | undefined> = process.env): Modes {
  return ModesSchema.parse({
    usdg: env.USDG_MODE,
    stocks: env.STOCK_TOKEN_MODE,
    perp: env.PERP_MODE,
    llm: env.LLM_MODE,
  });
}

/** Human-readable status-bar labels, e.g. "USDG: Paxos". */
export function modeLabels(m: Modes): Record<string, string> {
  return {
    stocks: m.stocks === 'official' ? 'Assets: real WETH · USDC' : 'Assets: test tokens',
    usdg: m.usdg === 'official' ? 'USDG: Paxos' : 'USDG: test token',
    perp: m.perp === 'gmx' ? 'Perps: GMX v2' : m.perp === 'none' ? 'Prices: Chainlink' : 'Perps: mock (GMX unavailable)',
    llm: m.llm === 'live' ? 'LLM: live' : 'LLM: replay',
  };
}

export const PROTOCOL_TIMING = {
  /** Max (deadline - issuedAt) an intent may claim, seconds. Rule 107. */
  maxIntentValidity: 300,
  staticViolationsToFreeze: 2,
  strikesToWarn: 3,
  strikeWindowSeconds: 24 * 60 * 60,
  unwindMaxSlippageBps: 300,
  maxPriceAgeSeconds: 24 * 60 * 60,
} as const;

export function timingFromEnv(env: Record<string, string | undefined> = process.env) {
  const num = (v: string | undefined, d: number) => (v ? Number(v) : d);
  return {
    ...PROTOCOL_TIMING,
    warnCooldownSeconds: num(env.WARN_COOLDOWN_SECONDS, 120),
    settleGraceSeconds: num(env.SETTLE_GRACE_SECONDS, 300),
    bondCooldownSeconds: num(env.BOND_COOLDOWN_SECONDS, 300),
  };
}
