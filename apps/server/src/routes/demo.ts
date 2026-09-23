import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { aegisPriceOracleAbi } from '@aegis/config';
import { db, resetIndexedState, schema } from '../db/index';
import { env } from '../env';
import { chainFor, priceUpdaterWalletFor, publicClientFor } from '../lib/chains';
import { contractOf, readDeployment, readSeed } from '../lib/deployments';
import { emit } from '../lib/events';
import { setNewsPoisoned } from './news';

/**
 * Endpoints that drive the demo.
 *
 * Every one of these is a **test control** and is labelled as such in the UI, because a market
 * shock we applied ourselves is not the same kind of fact as a price the market produced. The
 * protocol has no admin keys — nothing here can freeze a vault, move depositor funds or forgive a
 * slash. These only move test prices, poison a test news feed, and ask the agent to take a step.
 *
 * Token-gated and called from a server action, so the token never reaches the browser.
 */
const ShockBody = z.object({
  chainId: z.coerce.number().int(),
  asset: z.string().min(1),
  bps: z.coerce.number().int().min(-9_000).max(9_000),
});

export async function demoRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith('/demo/')) return;
    if (req.headers['x-demo-token'] !== env.DEMO_ADMIN_TOKEN) {
      return reply.code(401).send({ error: 'missing or invalid x-demo-token' });
    }
  });

  /** Moves a test price. Marked on the NAV chart so its effect is never mistaken for alpha. */
  app.post('/demo/shock', async (req, reply) => {
    const parsed = ShockBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { chainId, asset, bps } = parsed.data;

    const d = readDeployment(chainId);
    if (!d) return reply.code(400).send({ error: `chain ${chainId} is not deployed` });

    // Accepts a ticker or an address, because the operator console sends tickers and scripts send
    // whatever they already have.
    const entry = d.assets[asset] ?? Object.values(d.assets).find(
      (a) => a.address.toLowerCase() === asset.toLowerCase(),
    );
    if (!entry) return reply.code(400).send({ error: `unknown asset ${asset}` });

    const wallet = priceUpdaterWalletFor(chainId);
    if (!wallet?.account) {
      return reply.code(503).send({ error: 'set PRICE_UPDATER_PK to use the market shock control' });
    }

    const txHash = await wallet.writeContract({
      address: contractOf(d, 'AegisPriceOracle'),
      abi: aegisPriceOracleAbi,
      functionName: 'shock',
      args: [entry.address, bps],
      chain: chainFor(chainId),
      account: wallet.account,
    });
    await publicClientFor(chainId).waitForTransactionReceipt({ hash: txHash });

    return { ok: true, testControl: true, asset: entry.symbol, bps, txHash };
  });

  app.post<{ Body: { poisoned?: boolean } }>('/demo/news/poison', async (req) => {
    const poisoned = req.body?.poisoned ?? true;
    setNewsPoisoned(poisoned);
    emit('NewsFeedPoisoned', 0, { poisoned, testControl: true });
    return { ok: true, testControl: true, poisoned };
  });

  /** Asks the agent service to run N ticks under a named rogue profile. */
  app.post<{ Body: { vault?: string; profile?: string; steps?: number } }>(
    '/demo/agent/run',
    async (req, reply) => {
      const { vault, profile, steps } = req.body ?? {};
      if (!vault || !profile) return reply.code(400).send({ error: 'vault and profile are required' });

      try {
        const res = await fetch(`${env.AGENT_URL}/run`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-demo-token': env.DEMO_ADMIN_TOKEN },
          body: JSON.stringify({ vault, profile, steps: steps ?? 1 }),
        });
        return { ok: res.ok, testControl: true, agent: await res.json() };
      } catch (e) {
        return reply.code(502).send({ error: `agent unreachable at ${env.AGENT_URL}`, detail: String(e) });
      }
    },
  );

  /** The seeded vault addresses, so the operator console can offer them without hard-coding any. */
  app.get('/demo/seed', async () => {
    const seeds = [46630, 421614, 31337]
      .map((chainId) => ({ chainId, seed: readSeed(chainId) }))
      .filter((s) => s.seed);
    return { seeds };
  });

  /**
   * Clears indexed state so the indexer replays from `deployedAtBlock`.
   *
   * Does not touch the chain: re-seeding is a script, because a reset that could delete on-chain
   * state would be an admin key by another name.
   */
  app.post('/demo/reset', async () => {
    resetIndexedState();
    setNewsPoisoned(false);
    emit('DemoReset', 0, { testControl: true });
    return {
      ok: true,
      testControl: true,
      note: 'Indexed state cleared; the indexer will replay from the deployment block. Run pnpm demo:seed for fresh vaults.',
    };
  });

  app.get('/demo/state', async () => {
    const vaults = await db.select().from(schema.vaults);
    const feed = await db.select().from(schema.feedIntents);
    return {
      testControl: true,
      llmMode: env.LLM_MODE,
      vaults: vaults.map((v) => ({ chainId: v.chainId, address: v.address, name: v.name, state: v.state })),
      publishedEvidence: feed.length,
    };
  });

  app.post<{ Params: { id: string }; Body: { vault?: string; chainId?: number } }>(
    '/demo/scenario/:id',
    async (req, reply) => {
      const scenario = req.params.id.toLowerCase();
      const profile = SCENARIO_PROFILES[scenario];
      if (!profile) {
        return reply.code(400).send({ error: `unknown scenario ${scenario}`, known: Object.keys(SCENARIO_PROFILES) });
      }

      const vault = req.body?.vault;
      if (!vault) return reply.code(400).send({ error: 'vault is required' });

      if (profile.poisonNews !== undefined) setNewsPoisoned(profile.poisonNews);

      const res = await fetch(`${env.AGENT_URL}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-demo-token': env.DEMO_ADMIN_TOKEN },
        body: JSON.stringify({ vault, profile: profile.profile, steps: profile.steps }),
      }).catch(() => undefined);

      if (!res) return reply.code(502).send({ error: `agent unreachable at ${env.AGENT_URL}` });

      const incidents = await db
        .select()
        .from(schema.incidents)
        .where(eq(schema.incidents.vault, vault));

      return {
        ok: res.ok,
        testControl: true,
        scenario,
        profile: profile.profile,
        expected: profile.expected,
        agent: await res.json(),
        incidentId: incidents.at(-1)?.id ?? null,
      };
    },
  );
}

/** The seven demo scenarios, each a profile plus what it should produce. */
const SCENARIO_PROFILES: Record<
  string,
  { profile: string; steps: number; poisonNews?: boolean; expected: string }
> = {
  s0: { profile: 'good', steps: 1, poisonNews: false, expected: 'IntentExecuted; all checks green' },
  s1: {
    profile: 'prompt_injected',
    steps: 1,
    poisonNews: true,
    expected: 'Relay refuses, publishes evidence; watcher reports rule 101; bond pays depositors',
  },
  s2: {
    profile: 'fat_finger',
    steps: 1,
    poisonNews: false,
    expected: 'Rule 103 slash; second static violation freezes the vault',
  },
  s3: { profile: 'hallucinated_market', steps: 1, expected: 'Rule 101 slash on the perps vault' },
  s4: {
    profile: 'revenge_trader',
    steps: 3,
    poisonNews: false,
    expected: 'Three rule 201 rejections, no slash, vault WARNED',
  },
  s5: { profile: 'ghost_after_expiry', steps: 1, expected: 'Rule 105 slash after expiry' },
  s6: {
    profile: 'silent_bleeder',
    steps: 4,
    poisonNews: false,
    expected: 'Within-mandate buys; shock then trips the drawdown breaker',
  },
};
