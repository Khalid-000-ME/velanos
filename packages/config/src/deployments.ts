import { z } from 'zod';
import { ARBITRUM_SEPOLIA_ID, ROBINHOOD_TESTNET_ID, type SupportedChainId } from './chains';

import rh46630 from '../deployments/46630.json' with { type: 'json' };
import arb421614 from '../deployments/421614.json' with { type: 'json' };

const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 20-byte hex address')
  .transform((v) => v as `0x${string}`);

export const AssetEntrySchema = z.object({
  address: AddressSchema,
  decimals: z.number().int().min(0).max(36),
  symbol: z.string().min(1),
  /** Oracle-swap pool for this stock (spot only). */
  pool: AddressSchema.optional(),
  /** Display name, e.g. "Test Tesla". */
  name: z.string().optional(),
  /** GMX market address for perp "assets". */
  market: AddressSchema.optional(),
});
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const DeploymentModesSchema = z.object({
  usdg: z.enum(['mock', 'official']),
  stocks: z.enum(['mock', 'official']).nullable(),
  perp: z.enum(['gmx', 'mock']).nullable(),
});
export type DeploymentModes = z.infer<typeof DeploymentModesSchema>;

export const DeploymentSchema = z.object({
  chainId: z.number().int(),
  mode: DeploymentModesSchema,
  contracts: z.record(z.string(), AddressSchema),
  assets: z.record(z.string(), AssetEntrySchema),
  deployedAtBlock: z.number().int().nonnegative(),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

const RAW: Record<SupportedChainId, unknown> = {
  [ROBINHOOD_TESTNET_ID]: rh46630,
  [ARBITRUM_SEPOLIA_ID]: arb421614,
};

/** True when `Deploy.s.sol` has actually written addresses for this chain. */
export function isDeployed(chainId: SupportedChainId): boolean {
  const parsed = DeploymentSchema.safeParse(RAW[chainId]);
  return parsed.success && Object.keys(parsed.data.contracts).length > 0;
}

/**
 * The single source of truth for addresses (PRD §0.3). Nothing in this repo may
 * contain an address literal; everything reads from here.
 */
export function deployment(chainId: SupportedChainId): Deployment {
  const parsed = DeploymentSchema.safeParse(RAW[chainId]);
  if (!parsed.success) {
    throw new Error(
      `deployments/${chainId}.json is not a valid deployment file: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export function contractAddress(chainId: SupportedChainId, name: string): `0x${string}` {
  const found = deployment(chainId).contracts[name];
  if (!found) {
    throw new Error(
      `${name} is not in deployments/${chainId}.json — run the deploy script for this chain first.`,
    );
  }
  return found;
}

export function asset(chainId: SupportedChainId, symbol: string): AssetEntry {
  const found = deployment(chainId).assets[symbol];
  if (!found) throw new Error(`Asset ${symbol} is not in deployments/${chainId}.json`);
  return found;
}

export function assetByAddress(
  chainId: SupportedChainId,
  address: string,
): (AssetEntry & { key: string }) | undefined {
  const target = address.toLowerCase();
  for (const [key, entry] of Object.entries(deployment(chainId).assets)) {
    if (entry.address.toLowerCase() === target) return { ...entry, key };
  }
  return undefined;
}

/** Settlement asset for a chain: tUSDG/USDG on Robinhood, USDC.SG on Arbitrum. */
export function settlementAsset(chainId: SupportedChainId): AssetEntry {
  const d = deployment(chainId);
  return d.assets.USDG ?? d.assets['USDC.SG'] ?? asset(chainId, 'USDG');
}
