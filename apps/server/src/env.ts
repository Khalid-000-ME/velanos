import { z } from 'zod';
import { ARBITRUM_SEPOLIA_ID, ROBINHOOD_TESTNET_ID, type SupportedChainId } from '@velanos/config';

const EnvSchema = z.object({
  SERVER_PORT: z.coerce.number().int().default(4000),
  RH_TESTNET_RPC: z.string().url().default('https://rpc.testnet.chain.robinhood.com'),
  ARB_SEPOLIA_RPC: z.string().url().default('https://sepolia-rollup.arbitrum.io/rpc'),
  /** Local anvil, used for development and the differential tests. */
  LOCAL_RPC: z.string().url().optional(),
  DATABASE_PATH: z.string().default('./data/velanos.db'),
  DEMO_ADMIN_TOKEN: z.string().min(1).default('change-me-local-only'),
  AGENT_URL: z.string().url().default('http://localhost:4100'),
  /** Submits relayed intents and keeps oracle prices fresh. */
  RELAY_PK: z.string().optional(),
  PRICE_UPDATER_PK: z.string().optional(),
  USDG_MODE: z.enum(['mock', 'official']).default('mock'),
  STOCK_TOKEN_MODE: z.enum(['mock', 'official']).default('mock'),
  PERP_MODE: z.enum(['gmx', 'mock']).default('gmx'),
  LLM_MODE: z.enum(['live', 'replay']).default('replay'),
  INDEXER_POLL_MS: z.coerce.number().int().default(2_000),
  NAV_SNAPSHOT_MS: z.coerce.number().int().default(15_000),
  LOG_BATCH_BLOCKS: z.coerce.number().int().default(2_000),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

/**
 * Which chains to index.
 *
 * A local anvil chain is included when `LOCAL_RPC` is set, so the whole stack — indexer, relay,
 * UI — can be exercised end to end without waiting on a public testnet. The chain id is part of
 * every row, so running both at once is safe.
 */
export function activeChains(): { chainId: number; rpcUrl: string; label: string }[] {
  const chains = [
    { chainId: ROBINHOOD_TESTNET_ID as number, rpcUrl: env.RH_TESTNET_RPC, label: 'Robinhood Chain testnet' },
    { chainId: ARBITRUM_SEPOLIA_ID as number, rpcUrl: env.ARB_SEPOLIA_RPC, label: 'Arbitrum Sepolia' },
  ];
  if (env.LOCAL_RPC) chains.push({ chainId: 31337, rpcUrl: env.LOCAL_RPC, label: 'Local anvil' });
  return chains;
}

export function isSupported(chainId: number): chainId is SupportedChainId {
  return chainId === ROBINHOOD_TESTNET_ID || chainId === ARBITRUM_SEPOLIA_ID;
}
