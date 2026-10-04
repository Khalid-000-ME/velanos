import { z } from 'zod';

const EnvSchema = z.object({
  SERVER_URL: z.string().url().default('http://localhost:4000'),
  WATCHER_PK: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  /** Key holding the oracle's price-updater role, for assets without a Chainlink feed. */
  PRICE_UPDATER_PK: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  PRICE_POLL_MS: z.coerce.number().int().default(300_000),
  /** How often to sweep vaults for breakers, unwinds and settlements. */
  WATCHER_POLL_MS: z.coerce.number().int().default(10_000),
  LOCAL_RPC: z.string().url().optional(),
  RH_TESTNET_RPC: z.string().url().default('https://rpc.testnet.chain.robinhood.com'),
  ARB_SEPOLIA_RPC: z.string().url().default('https://sepolia-rollup.arbitrum.io/rpc'),
});

export const env = EnvSchema.parse(process.env);

export function rpcFor(chainId: number): string | undefined {
  if (chainId === 31337) return env.LOCAL_RPC;
  if (chainId === 46630) return env.RH_TESTNET_RPC;
  if (chainId === 421614) return env.ARB_SEPOLIA_RPC;
  return undefined;
}
