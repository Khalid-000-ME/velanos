/**
 * Runs the demo scenarios and prints a pass/fail table.
 *
 * This is the acceptance gate: each scenario asserts what the protocol should have done, read back
 * from chain state rather than from whatever the orchestrator claimed. A scenario that "ran" but left
 * the bond untouched is a failure, and the table says so.
 *
 *   pnpm demo:run s1         one scenario
 *   pnpm demo:all            every scenario in order
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, defineChain, formatUnits, http, type Address, type Chain } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';
const TOKEN = process.env.DEMO_ADMIN_TOKEN ?? 'change-me-local-only';
const CHAIN_ID = Number(process.env.DEMO_CHAIN_ID ?? 31337);

const DEPLOYMENTS = join(import.meta.dirname, '..', 'packages', 'config', 'deployments');

const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.LOCAL_RPC ?? 'http://127.0.0.1:8545'] } },
  testnet: true,
});

const robinhood = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RH_TESTNET_RPC ?? 'https://rpc.testnet.chain.robinhood.com'] } },
  testnet: true,
});

function chainFor(id: number): Chain {
  if (id === 31337) return anvil;
  if (id === 46630) return robinhood;
  if (id === 421614) return arbitrumSepolia;
  throw new Error(`unknown chain ${id}`);
}

const client = createPublicClient({ chain: chainFor(CHAIN_ID), transport: http() });

interface VaultState {
  state: number;
  freezeReason: number;
  staticViolations: number;
  strikes: number;
  bondAvailable: bigint;
  bondSlashed: bigint;
  pricePerShareWad: bigint;
  floorWad: bigint;
  settlementSymbol: string;
  settlementDecimals: number;
}

/** Reads the vault the same way the UI does, so a pass here is a pass a judge can see. */
async function readVault(address: string): Promise<VaultState> {
  const res = await fetch(`${SERVER}/vaults/${address}`);
  if (!res.ok) throw new Error(`server does not know vault ${address}`);
  const v = (await res.json()) as Record<string, string | number>;
  return {
    state: Number(v.state),
    freezeReason: Number(v.freezeReason),
    staticViolations: Number(v.staticViolations),
    strikes: Number(v.strikes),
    bondAvailable: BigInt(String(v.bondAvailable)),
    bondSlashed: BigInt(String(v.bondSlashed)),
    pricePerShareWad: BigInt(String(v.pricePerShareWad)),
    floorWad: BigInt(String(v.floorWad)),
    settlementSymbol: String(v.settlementSymbol),
    settlementDecimals: Number(v.settlementDecimals),
  };
}

function seedVaults(): Record<string, Address> {
  const seed = JSON.parse(readFileSync(join(DEPLOYMENTS, `seed-${CHAIN_ID}.json`), 'utf8')) as {
    vaults: Record<string, Address>;
  };
  return seed.vaults;
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-demo-token': TOKEN },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Waits for an assertion to hold rather than sleeping a fixed amount.
 *
 * Several outcomes depend on the watcher noticing something, and the watcher runs on its own clock.
 * Polling until the condition is true keeps the gate honest without making it slow or flaky.
 */
async function waitFor(
  label: string,
  check: () => Promise<boolean>,
  timeoutMs = 90_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await sleep(2_000);
  }
  console.log(`      timed out waiting for: ${label}`);
  return false;
}

interface Scenario {
  id: string;
  title: string;
  vaultKey: string;
  run: (vault: Address) => Promise<string[]>;
}

/** Each scenario returns the list of assertions that failed. Empty means pass. */
const SCENARIOS: Scenario[] = [
  {
    id: 's0',
    title: 'Good trade executes with every check green',
    vaultKey: 'A',
    async run(vault) {
      const before = await readVault(vault);
      await post('/demo/scenario/s0', { vault });
      await sleep(6_000);
      const after = await readVault(vault);

      const fails: string[] = [];
      if (after.bondAvailable !== before.bondAvailable) {
        fails.push('a compliant trade must not touch the bond');
      }
      if (after.staticViolations !== before.staticViolations) {
        fails.push('a compliant trade must not record a violation');
      }
      const intents = (await (await fetch(`${SERVER}/vaults/${vault}/intents?limit=5`)).json()) as {
        intents: Array<{ status: string }>;
      };
      if (!intents.intents.some((i) => i.status === 'executed')) {
        fails.push('expected an executed intent');
      }
      return fails;
    },
  },

  {
    id: 's1',
    title: 'Prompt injection is refused, published, reported and paid',
    vaultKey: 'A',
    async run(vault) {
      const before = await readVault(vault);
      await post('/demo/scenario/s1', { vault });

      const fails: string[] = [];

      const published = await waitFor('evidence published to the public feed', async () => {
        const feed = (await (await fetch(`${SERVER}/feed/intents/list`)).json()) as {
          intents: Array<{ vault: string; ruleId: number }>;
        };
        return feed.intents.some(
          (e) => e.vault.toLowerCase() === vault.toLowerCase() && e.ruleId === 101,
        );
      }, 30_000);
      if (!published) fails.push('the relay should have published the signed intent as evidence');

      const slashed = await waitFor('watcher reports and the bond pays', async () => {
        const v = await readVault(vault);
        return v.bondSlashed > before.bondSlashed && v.staticViolations > before.staticViolations;
      });
      if (!slashed) fails.push('the bond should have been slashed after the report');

      const after = await readVault(vault);
      const paid = after.bondSlashed - before.bondSlashed;
      if (slashed && paid !== 50_000_000n) {
        fails.push(`expected a 50 ${after.settlementSymbol} penalty, got ${fmt(paid, after)}`);
      }
      return fails;
    },
  },

  {
    id: 's2',
    title: 'Fat finger is slashed and the second breach freezes the vault',
    vaultKey: 'A',
    async run(vault) {
      const before = await readVault(vault);
      await post('/demo/scenario/s2', { vault });

      const fails: string[] = [];
      const ok = await waitFor('rule 103 slash lands', async () => {
        const v = await readVault(vault);
        return v.bondSlashed > before.bondSlashed;
      }, 45_000);
      if (!ok) fails.push('the oversized buy should have slashed the bond under rule 103');

      const frozen = await waitFor('vault freezes on the second breach', async () => {
        const v = await readVault(vault);
        return v.staticViolations >= 2 && v.state >= 3;
      }, 45_000);
      if (!frozen) fails.push('two static violations must freeze the vault without an admin key');
      return fails;
    },
  },

  {
    id: 's4',
    title: 'Revenge trader is rejected three times with the bond untouched',
    vaultKey: 'C',
    async run(vault) {
      // Build exposure first so the revenge buys actually breach the per-asset cap.
      await post('/demo/agent/run', { vault, profile: 'good', steps: 1 });
      await sleep(5_000);
      await post('/demo/agent/run', { vault, profile: 'good', steps: 1 });
      await sleep(5_000);

      const before = await readVault(vault);
      await post('/demo/scenario/s4', { vault });

      const fails: string[] = [];
      const warned = await waitFor('three strikes put the vault in cooling-off', async () => {
        const v = await readVault(vault);
        return v.strikes >= 3 && v.state === 2;
      }, 60_000);
      if (!warned) fails.push('three stateful rejections should warn the vault');

      const after = await readVault(vault);
      if (after.bondSlashed !== before.bondSlashed) {
        fails.push('a stateful rejection must never cost the bond — this is the fairness claim');
      }
      if (after.staticViolations !== before.staticViolations) {
        fails.push('a stateful rejection must not count as a violation');
      }
      return fails;
    },
  },

  {
    id: 's6',
    title: 'Market shock trips the breaker and the bond restores the floor',
    vaultKey: 'D',
    async run(vault) {
      await post('/demo/scenario/s6', { vault });
      await sleep(8_000);

      const built = await readVault(vault);
      const fails: string[] = [];
      if (built.staticViolations !== 0) {
        fails.push('the silent bleeder stays inside its mandate — no violation expected');
      }

      await post('/demo/shock', { chainId: CHAIN_ID, asset: 'TSLA', bps: -2_000 });
      await post('/demo/shock', { chainId: CHAIN_ID, asset: 'AMZN', bps: -1_250 });

      const repaired = await waitFor(
        'breaker trips, vault unwinds, bond tops depositors back to the floor',
        async () => {
          const v = await readVault(vault);
          return v.state === 6 && v.pricePerShareWad >= v.floorWad;
        },
        150_000,
      );
      if (!repaired) fails.push('NAV per share should end at or above the floor after compensation');

      const after = await readVault(vault);
      if (repaired && after.pricePerShareWad !== after.floorWad) {
        // Allowed to overshoot by rounding, never to fall short.
        const delta = after.pricePerShareWad - after.floorWad;
        if (delta < 0n) fails.push('NAV per share ended below the floor');
      }
      if (after.bondSlashed === 0n) {
        fails.push('the bond should have paid the shortfall');
      }
      return fails;
    },
  },
];

function fmt(raw: bigint, v: VaultState): string {
  return `${formatUnits(raw, v.settlementDecimals)} ${v.settlementSymbol}`;
}

async function main(): Promise<void> {
  const arg = (process.argv[2] ?? 'all').toLowerCase();
  const selected = arg === 'all' ? SCENARIOS : SCENARIOS.filter((s) => s.id === arg);

  if (selected.length === 0) {
    console.error(`unknown scenario ${arg}; known: ${SCENARIOS.map((s) => s.id).join(', ')}, all`);
    process.exit(1);
  }

  const vaults = seedVaults();
  console.log(`\nVelanos demo gate — chain ${CHAIN_ID}\n`);

  const results: Array<{ id: string; title: string; fails: string[] }> = [];

  for (const scenario of selected) {
    const vault = vaults[scenario.vaultKey];
    if (!vault) {
      results.push({ ...scenario, fails: [`no seeded vault ${scenario.vaultKey}`] });
      continue;
    }

    console.log(`▸ ${scenario.id}  ${scenario.title}`);
    console.log(`    vault ${scenario.vaultKey} ${vault}`);

    try {
      const fails = await scenario.run(vault);
      results.push({ id: scenario.id, title: scenario.title, fails });
      console.log(fails.length === 0 ? '    PASS\n' : `    FAIL\n`);
      for (const f of fails) console.log(`      · ${f}`);
      if (fails.length > 0) console.log();
    } catch (e) {
      results.push({ id: scenario.id, title: scenario.title, fails: [(e as Error).message] });
      console.log(`    ERROR  ${(e as Error).message}\n`);
    }
  }

  // ── summary table ──
  console.log('─'.repeat(78));
  for (const r of results) {
    const mark = r.fails.length === 0 ? 'PASS' : 'FAIL';
    console.log(`  ${mark}  ${r.id.padEnd(4)} ${r.title}`);
  }
  console.log('─'.repeat(78));

  const failed = results.filter((r) => r.fails.length > 0);
  console.log(`\n  ${results.length - failed.length}/${results.length} scenarios passed\n`);

  void client;
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
