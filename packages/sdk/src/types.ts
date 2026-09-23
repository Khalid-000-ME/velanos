import { z } from 'zod';
import type { Address, Hex } from 'viem';

export const VaultKind = { SPOT: 0, PERP: 1 } as const;
export type VaultKind = (typeof VaultKind)[keyof typeof VaultKind];

export const VaultState = {
  PENDING_BOND: 0,
  ACTIVE: 1,
  WARNED: 2,
  FROZEN: 3,
  UNWINDING: 4,
  EXPIRED: 5,
  SETTLED: 6,
} as const;
export type VaultState = (typeof VaultState)[keyof typeof VaultState];

export const VAULT_STATE_NAMES = [
  'PENDING_BOND',
  'ACTIVE',
  'WARNED',
  'FROZEN',
  'UNWINDING',
  'EXPIRED',
  'SETTLED',
] as const;
export type VaultStateName = (typeof VAULT_STATE_NAMES)[number];

export const IntentKind = { SPOT_BUY: 0, SPOT_SELL: 1, PERP_OPEN: 2, PERP_CLOSE: 3 } as const;
export type IntentKind = (typeof IntentKind)[keyof typeof IntentKind];

export const INTENT_KIND_NAMES = ['SPOT_BUY', 'SPOT_SELL', 'PERP_OPEN', 'PERP_CLOSE'] as const;
export type IntentKindName = (typeof INTENT_KIND_NAMES)[number];

export const FreezeReason = {
  NONE: 0,
  STATIC_VIOLATIONS: 1,
  DRAWDOWN: 2,
  LATE_SETTLEMENT: 3,
  GUARDIAN: 4,
} as const;
export type FreezeReason = (typeof FreezeReason)[keyof typeof FreezeReason];

export const FREEZE_REASON_NAMES = [
  'NONE',
  'STATIC_VIOLATIONS',
  'DRAWDOWN',
  'LATE_SETTLEMENT',
  'GUARDIAN',
] as const;

export const ExecStatus = {
  EXECUTED: 0,
  REJECTED_STATEFUL: 1,
  REJECTED_STATIC_SLASHED: 2,
} as const;
export type ExecStatus = (typeof ExecStatus)[keyof typeof ExecStatus];

/**
 * The immutable contract between depositors and one agent.
 *
 * Amounts are raw `bigint` in the settlement token's decimals. Never a float: a mandate that
 * rounds is a mandate that can be argued with, and every one of these numbers ends up inside a
 * signature or a slash calculation.
 */
export interface Mandate {
  agentSigner: Address;
  operator: Address;
  settlementAsset: Address;
  kind: VaultKind;
  allowedAssets: readonly Address[];
  allowedAdapters: readonly Address[];
  maxAllocation: bigint;
  maxTradeAmount: bigint;
  maxAssetExposureBps: number;
  maxSlippageBps: number;
  maxLeverageBps: number;
  maxDrawdownBps: number;
  maxDailyLossBps: number;
  start: bigint;
  expiry: bigint;
  bondRequired: bigint;
  perViolationPenalty: bigint;
  reporterBountyBps: number;
  riskTier: number;
  metadataURI: string;
}

/** One proposed trade, signed by the agent under EIP-712. */
export interface TradeIntent {
  vault: Address;
  kind: IntentKind;
  adapter: Address;
  assetIn: Address;
  assetOut: Address;
  amountIn: bigint;
  minOut: bigint;
  leverageBps: number;
  isLong: boolean;
  nonce: bigint;
  issuedAt: bigint;
  deadline: bigint;
  rationaleHash: Hex;
}

/** Live state the stateful rules are judged against. Mirrors the Solidity struct field for field. */
export interface VaultSnapshot {
  state: VaultState;
  navSettlement: bigint;
  pricePerShareWad: bigint;
  dayOpenPricePerShareWad: bigint;
  assetValueBefore: bigint;
  settlementBalance: bigint;
  assetInBalance: bigint;
  quotedOut: bigint;
  oracleOut: bigint;
}

export interface CheckResult {
  ruleId: RuleId | 0;
  passed: boolean;
  actual: bigint;
  limit: bigint;
}

export type RuleId =
  | 101 | 102 | 103 | 104 | 105 | 106 | 107 | 108
  | 201 | 202 | 203 | 204 | 205 | 206 | 207
  | 301 | 302 | 303;

const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((v) => v as Address);

/**
 * Validation for anything arriving from outside: a relay request, an MCP tool call, an LLM
 * proposal. A malformed intent must be rejected before it reaches a signing key, not after.
 */
export const TradeIntentSchema = z.object({
  vault: AddressSchema,
  kind: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  adapter: AddressSchema,
  assetIn: AddressSchema,
  assetOut: AddressSchema,
  amountIn: z.coerce.bigint().nonnegative(),
  minOut: z.coerce.bigint().nonnegative(),
  leverageBps: z.coerce.number().int().min(0).max(4_294_967_295),
  isLong: z.boolean(),
  nonce: z.coerce.bigint().nonnegative(),
  issuedAt: z.coerce.bigint().nonnegative(),
  deadline: z.coerce.bigint().nonnegative(),
  rationaleHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((v) => v as Hex),
});

export const SignedIntentSchema = z.object({
  intent: TradeIntentSchema,
  sig: z
    .string()
    .regex(/^0x[0-9a-fA-F]{130}$/)
    .transform((v) => v as Hex),
});
export type SignedIntent = z.infer<typeof SignedIntentSchema>;
