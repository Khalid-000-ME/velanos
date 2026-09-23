import { type Address, parseUnits } from 'viem';
import { RULES, rationaleHash, type Mandate, type TradeIntent } from '@aegis/agent-sdk';
import type { Proposal } from './proposal';

export interface AssetBook {
  /** ticker → on-chain address and decimals, read from the deployment file. */
  [symbol: string]: { address: Address; decimals: number; symbol: string };
}

export interface BuildArgs {
  vault: Address;
  mandate: Mandate;
  proposal: Proposal;
  assets: AssetBook;
  settlementDecimals: number;
  adapter: Address;
  nonce: bigint;
  /** Overridden by the post-expiry profile. */
  issuedAt?: bigint;
  validitySeconds?: number;
}

export class UnmappableProposal extends Error {}

/**
 * Turns a model proposal into the exact bytes that get signed.
 *
 * Everything quantitative happens here, in code, with on-chain decimals — the model never sees a
 * raw amount and never produces one. A float that reaches a signature is a float that reaches a
 * slash calculation, so `sizeUsd` is converted with `parseUnits` against the token's real decimals
 * rather than scaled by a constant.
 *
 * This function deliberately does **not** clamp anything to the mandate. Its job is to express the
 * proposal faithfully; deciding whether the result is permitted is the guard's job, and quietly
 * fixing an over-cap size here would hide the misbehaviour the pre-flight is supposed to catch.
 */
export function buildIntent(args: BuildArgs): TradeIntent {
  const { proposal, mandate, assets, settlementDecimals } = args;

  if (proposal.action === 'HOLD') throw new UnmappableProposal('proposal was HOLD');

  const entry = assets[proposal.asset.toUpperCase()];
  if (!entry) {
    // Still signable in principle, but we cannot name an address for it. A hallucinated ticker with
    // no deployment entry is a dead end rather than a violation we can demonstrate.
    throw new UnmappableProposal(
      `no address for ${proposal.asset} in the deployment; known: ${Object.keys(assets).join(', ')}`,
    );
  }

  const issuedAt = args.issuedAt ?? BigInt(Math.floor(Date.now() / 1000));
  const validity = BigInt(Math.min(args.validitySeconds ?? 120, 300));
  const settlement = mandate.settlementAsset;

  const base = {
    vault: args.vault,
    adapter: args.adapter,
    minOut: 0n,
    isLong: proposal.isLong ?? true,
    nonce: args.nonce,
    issuedAt,
    deadline: issuedAt + validity,
    rationaleHash: rationaleHash(proposal.rationale),
  };

  switch (proposal.action) {
    case 'BUY':
      return {
        ...base,
        kind: 0,
        assetIn: settlement,
        assetOut: entry.address,
        amountIn: parseUnits(proposal.sizeUsd.toString(), settlementDecimals),
        leverageBps: 10_000,
      };

    case 'SELL':
      return {
        ...base,
        kind: 1,
        assetIn: entry.address,
        assetOut: settlement,
        // A sell is denominated in the stock's own decimals, not the settlement asset's. Reusing
        // the settlement decimals here would under-sell by a factor of 10^12 on an 18-decimal token.
        amountIn: parseUnits(proposal.sizeUsd.toString(), entry.decimals),
        leverageBps: 10_000,
      };

    case 'PERP_OPEN':
      return {
        ...base,
        kind: 2,
        assetIn: settlement,
        assetOut: entry.address,
        amountIn: parseUnits(proposal.sizeUsd.toString(), settlementDecimals),
        leverageBps: Math.round(proposal.leverage * 10_000),
      };

    case 'PERP_CLOSE':
      return {
        ...base,
        kind: 3,
        assetIn: settlement,
        assetOut: entry.address,
        amountIn: parseUnits(proposal.sizeUsd.toString(), settlementDecimals),
        leverageBps: Math.max(10_000, Math.round(proposal.leverage * 10_000)),
      };
  }
}

export function describeRule(ruleId: number): string {
  const meta = RULES[ruleId as keyof typeof RULES];
  return meta ? `${ruleId} ${meta.title}${meta.slashable ? ' (slashable)' : ''}` : String(ruleId);
}
