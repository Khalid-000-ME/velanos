import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Address } from 'viem';

/**
 * Reads the address book the deploy scripts write.
 *
 * Read from disk at call time rather than imported, so a redeploy during a session is picked up
 * without restarting the server — which matters when `POST /demo/reset` reseeds mid-demo.
 */
export interface ChainDeployment {
  chainId: number;
  mode: { usdg: string; stocks: string | null; perp: string | null };
  contracts: Record<string, Address>;
  assets: Record<
    string,
    { address: Address; decimals: number; symbol: string; name?: string; pool?: Address }
  >;
  deployedAtBlock: number;
}

const DEPLOYMENTS_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'config',
  'deployments',
);

export function readDeployment(chainId: number): ChainDeployment | undefined {
  try {
    const raw = readFileSync(join(DEPLOYMENTS_DIR, `${chainId}.json`), 'utf8');
    const parsed = JSON.parse(raw) as ChainDeployment;
    return Object.keys(parsed.contracts ?? {}).length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function readSeed(chainId: number): { agentId: number; vaults: Record<string, Address> } | undefined {
  try {
    return JSON.parse(readFileSync(join(DEPLOYMENTS_DIR, `seed-${chainId}.json`), 'utf8'));
  } catch {
    return undefined;
  }
}

/** address → ticker, for turning a log into a sentence a human can read. */
export function symbolIndex(chainId: number): Record<string, { symbol: string; decimals: number }> {
  const d = readDeployment(chainId);
  if (!d) return {};
  const out: Record<string, { symbol: string; decimals: number }> = {};
  for (const entry of Object.values(d.assets)) {
    out[entry.address.toLowerCase()] = { symbol: entry.symbol, decimals: entry.decimals };
  }
  return out;
}

/**
 * Looks up a contract address and fails loudly when it is missing.
 *
 * A missing address means the deploy script has not run for this chain. Surfacing that as a named
 * error beats letting `undefined` flow into an RPC call and come back as an opaque decode failure.
 */
export function contractOf(d: ChainDeployment, name: string): Address {
  const address = d.contracts[name];
  if (!address) {
    throw new Error(`${name} is missing from deployments/${d.chainId}.json — run the deploy script`);
  }
  return address;
}
