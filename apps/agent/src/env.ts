import { z } from 'zod';

const EnvSchema = z.object({
  AGENT_PORT: z.coerce.number().int().default(4100),
  SERVER_URL: z.string().url().default('http://localhost:4000'),
  DEMO_ADMIN_TOKEN: z.string().min(1).default('change-me-local-only'),

  AGENT_SIGNER_PK: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  /** Used for the `direct` route, where the agent pays its own gas. */
  AGENT_TX_PK: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),

  LLM_PROVIDER: z.enum(['anthropic', 'groq']).default('anthropic'),
  LLM_MODEL: z.string().default('claude-opus-5-5'),
  LLM_MODE: z.enum(['live', 'replay']).default('replay'),
  LLM_RECORD: z.coerce.number().int().default(0),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  AGENT_TICK_MS: z.coerce.number().int().default(15_000),
  LOCAL_RPC: z.string().url().optional(),
  RH_TESTNET_RPC: z.string().url().default('https://rpc.testnet.chain.robinhood.com'),
  ARB_SEPOLIA_RPC: z.string().url().default('https://sepolia-rollup.arbitrum.io/rpc'),
});

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = EnvSchema.parse(process.env);

export function rpcFor(chainId: number): string | undefined {
  if (chainId === 31337) return env.LOCAL_RPC;
  if (chainId === 46630) return env.RH_TESTNET_RPC;
  if (chainId === 421614) return env.ARB_SEPOLIA_RPC;
  return undefined;
}
