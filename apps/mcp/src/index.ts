#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { velanosVaultAbi } from '@velanos/config';
import {
  VelanosClient,
  RULES,
  mandateToEnglish,
  rationaleHash,
  signIntent,
  type Mandate,
  type RuleId,
  type TradeIntent,
} from '@velanos/agent-sdk';

/**
 * MCP server for third-party agents.
 *
 * An operator runs their own instance with their own signing key, so the agent framework on the other
 * end never needs to understand EIP-712, raw token decimals or the rule bands — it asks for a mandate
 * in English, pre-flights an idea, and submits.
 *
 * `preflight_intent` is the tool that matters. An agent that calls it before `submit_intent` cannot be
 * slashed for a static rule, because it will have seen the verdict the contract is about to reach. The
 * tool descriptions say so explicitly, since the model reading them is the party that pays.
 */
const ENV = z
  .object({
    AGENT_SIGNER_PK: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
    SERVER_URL: z.string().url().default('http://localhost:4000'),
    LOCAL_RPC: z.string().url().optional(),
    RH_TESTNET_RPC: z.string().url().default('https://rpc.testnet.chain.robinhood.com'),
    ARB_SEPOLIA_RPC: z.string().url().default('https://sepolia-rollup.arbitrum.io/rpc'),
  })
  .parse(process.env);

const DEPLOYMENTS = join(import.meta.dirname, '..', '..', '..', 'packages', 'config', 'deployments');

const anvil: Chain = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ENV.LOCAL_RPC ?? 'http://127.0.0.1:8545'] } },
  testnet: true,
});

const robinhood: Chain = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ENV.RH_TESTNET_RPC] } },
  testnet: true,
});

function chainFor(id: number): Chain {
  if (id === 31337) return anvil;
  if (id === 46630) return robinhood;
  if (id === 421614) return arbitrumSepolia;
  throw new Error(`unsupported chain ${id}`);
}

interface Deployment {
  contracts: Record<string, Address>;
  assets: Record<string, { address: Address; decimals: number; symbol: string }>;
}

function deployment(chainId: number): Deployment | undefined {
  try {
    return JSON.parse(readFileSync(join(DEPLOYMENTS, `${chainId}.json`), 'utf8')) as Deployment;
  } catch {
    return undefined;
  }
}

/** Resolves a vault to its chain by asking the indexer, so callers pass only an address. */
async function locateVault(vault: string) {
  const res = await fetch(`${ENV.SERVER_URL}/vaults/${vault}`);
  if (!res.ok) throw new Error(`unknown vault ${vault}`);
  return (await res.json()) as {
    chainId: number;
    name: string;
    state: number;
    nav: string;
    pricePerShareWad: string;
    floorWad: string;
    hwmWad: string;
    bondAvailable: string;
    staticViolations: number;
    strikes: number;
    settlementSymbol: string;
    settlementDecimals: number;
    mandateEnglish: string[];
    mandate: Record<string, unknown>;
    positions: Array<{ symbol: string; amount: string }>;
  };
}

function clientFor(chainId: number): VelanosClient {
  const d = deployment(chainId);
  return new VelanosClient({
    chainId,
    chain: chainFor(chainId),
    relayUrl: ENV.SERVER_URL,
    ...(d
      ? {
          addresses: {
            BondManager: d.contracts.BondManager,
            ViolationCourt: d.contracts.ViolationCourt,
            PolicyGuard: d.contracts.PolicyGuard,
            VaultFactory: d.contracts.VaultFactory,
          },
        }
      : {}),
  });
}

const ActionSchema = z.enum(['BUY', 'SELL', 'PERP_OPEN', 'PERP_CLOSE']);

/** Shared shape for the two tools that describe a trade. */
const intentShape = {
  vault: z.string().describe('Vault address'),
  action: ActionSchema.describe('BUY and PERP_OPEN increase risk and are size-capped; SELL and PERP_CLOSE are not'),
  asset: z.string().describe('Ticker, e.g. TSLA or ETH-USD. Must be in the mandate'),
  sizeUsd: z.number().describe('Size in settlement-asset units, e.g. 150 for 150 tUSDG'),
  leverage: z.number().optional().describe('Must be 1 on a spot vault'),
  isLong: z.boolean().optional(),
};

/** Builds the intent the same way the first-party agent harness does, with on-chain decimals. */
async function buildIntent(args: {
  vault: string;
  action: z.infer<typeof ActionSchema>;
  asset: string;
  sizeUsd: number;
  leverage?: number;
  isLong?: boolean;
  rationale?: string;
}): Promise<{ intent: TradeIntent; chainId: number; mandate: Mandate; symbol: string }> {
  const info = await locateVault(args.vault);
  const d = deployment(info.chainId);
  if (!d) throw new Error(`chain ${info.chainId} has no deployment file`);

  const entry = d.assets[args.asset.toUpperCase()];
  if (!entry) {
    throw new Error(
      `no address for ${args.asset} on chain ${info.chainId}; known: ${Object.keys(d.assets).join(', ')}`,
    );
  }

  const client = clientFor(info.chainId);
  const mandate = await client.getMandate(args.vault as Address);

  const kind =
    args.action === 'BUY' ? 0 : args.action === 'SELL' ? 1 : args.action === 'PERP_OPEN' ? 2 : 3;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const settlementDecimals = info.settlementDecimals;

  const intent: TradeIntent = {
    vault: args.vault as Address,
    kind: kind as TradeIntent['kind'],
    adapter: mandate.allowedAdapters[0] as Address,
    assetIn: kind === 1 ? entry.address : mandate.settlementAsset,
    assetOut: kind === 1 ? mandate.settlementAsset : entry.address,
    amountIn: parseUnits(
      args.sizeUsd.toString(),
      kind === 1 ? entry.decimals : settlementDecimals,
    ),
    minOut: 0n,
    leverageBps: Math.round((args.leverage ?? 1) * 10_000),
    isLong: args.isLong ?? true,
    // Time-seeded so repeated calls from a long-running agent never collide.
    nonce: BigInt(Date.now()),
    issuedAt: now,
    deadline: now + 120n,
    rationaleHash: rationaleHash(args.rationale ?? ''),
  };

  return { intent, chainId: info.chainId, mandate, symbol: info.settlementSymbol };
}

const server = new McpServer({ name: 'velanos', version: '0.1.0' });

server.registerTool(
  'get_mandate',
  {
    title: 'Get a vault mandate',
    description:
      'The rules this vault enforces, in plain English and as raw JSON. Read this before proposing anything: the mandate is the boundary of what you are permitted to do, and breaking it costs the agent real money.',
    inputSchema: { vault: z.string().describe('Vault address') },
  },
  async ({ vault }) => {
    const info = await locateVault(vault);
    const client = clientFor(info.chainId);
    const mandate = await client.getMandate(vault as Address);

    const english = mandateToEnglish(mandate, {
      settlementSymbol: info.settlementSymbol,
      settlementDecimals: info.settlementDecimals,
    });

    return {
      content: [
        {
          type: 'text',
          text: [
            `# ${info.name}`,
            '',
            ...english.map((l) => `- ${l}`),
            '',
            '## Raw mandate',
            '```json',
            JSON.stringify(info.mandate, null, 2),
            '```',
          ].join('\n'),
        },
      ],
    };
  },
);

server.registerTool(
  'get_vault_state',
  {
    title: 'Get live vault state',
    description:
      'NAV, NAV per share, the loss floor, the bond at stake, open positions, and how many strikes and violations the vault already carries.',
    inputSchema: { vault: z.string().describe('Vault address') },
  },
  async ({ vault }) => {
    const info = await locateVault(vault);
    const dec = info.settlementDecimals;
    const STATE = ['PENDING_BOND', 'ACTIVE', 'WARNED', 'FROZEN', 'UNWINDING', 'EXPIRED', 'SETTLED'];

    return {
      content: [
        {
          type: 'text',
          text: [
            `State: ${STATE[info.state] ?? info.state}`,
            `NAV: ${formatUnits(BigInt(info.nav), dec)} ${info.settlementSymbol}`,
            `NAV per share: ${formatUnits(BigInt(info.pricePerShareWad), 18)}`,
            `High-water mark: ${formatUnits(BigInt(info.hwmWad), 18)}`,
            `Loss floor: ${formatUnits(BigInt(info.floorWad), 18)} per share`,
            `Bond at stake: ${formatUnits(BigInt(info.bondAvailable), dec)} ${info.settlementSymbol}`,
            `Static violations: ${info.staticViolations}/2 (two freezes the vault)`,
            `Stateful strikes: ${info.strikes}/3 (three triggers a cooling-off period)`,
            info.positions.length > 0
              ? `Positions: ${info.positions.map((p) => `${p.symbol} ${p.amount}`).join(', ')}`
              : 'Positions: none',
          ].join('\n'),
        },
      ],
    };
  },
);

server.registerTool(
  'preflight_intent',
  {
    title: 'Pre-flight a trade before signing',
    description:
      'Runs the exact checks the contract will run and returns the full checklist. Call this before submit_intent: if it reports a slashable rule and you submit anyway, the bond pays depositors whether or not the trade executes.',
    inputSchema: intentShape,
  },
  async (args) => {
    const { intent, chainId } = await buildIntent(args);
    const result = await clientFor(chainId).preflight(intent);

    const lines = result.checks.map((c) => {
      const meta = c.ruleId === 0 ? undefined : RULES[c.ruleId as RuleId];
      const mark = c.passed ? 'PASS' : meta?.slashable ? 'FAIL (slashable)' : 'FAIL';
      return `${mark}  ${c.ruleId}  ${meta?.title ?? ''}${
        c.passed ? '' : `  — actual ${c.actual}, limit ${c.limit}`
      }`;
    });

    const verdict =
      result.ruleId === 0
        ? 'VERDICT: this intent would execute.'
        : result.slashable
          ? `VERDICT: rule ${result.ruleId} (${RULES[result.ruleId].title}) — SLASHABLE. Signing this costs the agent its bond. Do not submit it.`
          : `VERDICT: rule ${result.ruleId} (${RULES[result.ruleId].title}) — blocked but not slashable. Nothing is lost; adjust and retry.`;

    return { content: [{ type: 'text', text: [verdict, '', ...lines].join('\n') }] };
  },
);

server.registerTool(
  'submit_intent',
  {
    title: 'Sign and submit a trade',
    description:
      'Signs the intent with this server’s agent key and hands it to the relay. The relay refuses to forward anything that breaks a static rule — but the signature becomes public evidence either way, and anyone can report it for a bounty.',
    inputSchema: {
      ...intentShape,
      rationale: z
        .string()
        .max(600)
        .describe('Why you are doing this. Hashed on-chain alongside the signature, so it cannot be rewritten later'),
    },
  },
  async (args) => {
    if (!ENV.AGENT_SIGNER_PK) {
      return {
        content: [
          {
            type: 'text',
            text: 'This MCP server has no signing key. Set AGENT_SIGNER_PK to submit; preflight_intent works without one.',
          },
        ],
        isError: true,
      };
    }

    const { intent, chainId, symbol } = await buildIntent(args);
    const account = privateKeyToAccount(ENV.AGENT_SIGNER_PK as `0x${string}`);

    // Posted before signing, so the on-chain hash always resolves to text that already exists.
    await fetch(`${ENV.SERVER_URL}/rationales`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hash: rationaleHash(args.rationale),
        text: args.rationale,
        model: 'mcp-client',
        profile: 'third-party',
      }),
    }).catch(() => undefined);

    const sig = await signIntent({
      signTypedData: (a) => account.signTypedData(a as never),
      intent,
      chainId,
    });

    const res = await clientFor(chainId).submitRelay(intent, sig);

    if (res.submitted) {
      return {
        content: [
          {
            type: 'text',
            text: `Submitted. Transaction ${res.txHash}. Size ${args.sizeUsd} ${symbol} of ${args.asset}.`,
          },
        ],
      };
    }

    const rule = res.ruleId ? RULES[res.ruleId] : undefined;
    return {
      content: [
        {
          type: 'text',
          text: rule?.slashable
            ? `Refused: rule ${res.ruleId} (${rule.title}). The relay did not submit it, so nothing executed — but your signature is now public evidence and the bond is exposed. Pre-flight next time.`
            : `Not submitted: rule ${res.ruleId} (${rule?.title ?? 'blocked'}). Nothing was slashed. Adjust and retry.`,
        },
      ],
      isError: true,
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
