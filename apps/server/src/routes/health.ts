import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { modeLabels, modesFromEnv } from '@velanos/config';
import { db, schema } from '../db/index';
import { activeChains, env } from '../env';
import { publicClientFor } from '../lib/chains';
import { readDeployment } from '../lib/deployments';

/**
 * Status endpoints that back the thin bar under the header.
 *
 * The bar exists so a judge can always tell what is real: which chains are being indexed, how far
 * behind the indexer is, whether the watcher is alive, and which integrations are running against
 * test stand-ins rather than the real thing. Hiding that behind a tooltip would make every other
 * number on screen less trustworthy, not more.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true, ts: Math.floor(Date.now() / 1000) }));

  app.get('/chains/status', async () => {
    const modes = modesFromEnv(process.env);

    const chains = await Promise.all(
      activeChains().map(async (chain) => {
        const deployment = readDeployment(chain.chainId);
        const cursorRows = await db
          .select()
          .from(schema.chainCursors)
          .where(eq(schema.chainCursors.chainId, chain.chainId))
          .limit(1);

        let head: number | null = null;
        try {
          head = Number(await publicClientFor(chain.chainId).getBlockNumber());
        } catch {
          head = null;
        }

        const indexed = cursorRows[0]?.lastBlock ?? null;
        return {
          chainId: chain.chainId,
          label: chain.label,
          deployed: Boolean(deployment),
          head,
          indexedBlock: indexed,
          // Surfaced rather than smoothed over: a growing lag is the first sign a demo is about to
          // show a stale number.
          blocksBehind: head !== null && indexed !== null ? Math.max(0, head - indexed) : null,
          mode: deployment?.mode ?? null,
          // Surfaced so the docs page and the README generator read addresses from one place
          // rather than each parsing the deployment files themselves.
          contracts: deployment?.contracts ?? null,
          assets: deployment
            ? Object.fromEntries(
                Object.entries(deployment.assets).map(([k, v]) => [
                  k,
                  { address: v.address, symbol: v.symbol, decimals: v.decimals },
                ]),
              )
            : null,
        };
      }),
    );

    const heartbeats = await db.select().from(schema.heartbeats);
    const nowTs = Math.floor(Date.now() / 1000);

    return {
      chains,
      modes: modeLabels(modes),
      services: heartbeats.map((h) => ({
        service: h.service,
        ts: h.ts,
        detail: h.detail,
        // A watcher that stopped 30 seconds ago is not "live", and the UI must not imply it is.
        live: nowTs - h.ts < 30,
      })),
      llmMode: env.LLM_MODE,
    };
  });

  app.post<{ Body: { service?: string; detail?: string } }>('/heartbeat', async (req) => {
    const service = req.body?.service ?? 'unknown';
    await db
      .insert(schema.heartbeats)
      .values({ service, ts: Math.floor(Date.now() / 1000), detail: req.body?.detail ?? '' })
      .onConflictDoUpdate({
        target: schema.heartbeats.service,
        set: { ts: Math.floor(Date.now() / 1000), detail: req.body?.detail ?? '' },
      });
    return { ok: true };
  });

  /** Headline counters for the landing page, straight out of the indexed slash log. */
  app.get('/stats', async () => {
    const vaults = await db.select().from(schema.vaults);
    const slashes = await db.select().from(schema.slashes);
    const intents = await db
      .select()
      .from(schema.intents)
      .orderBy(desc(schema.intents.ts))
      .limit(1_000);

    const feed = await db.select().from(schema.feedIntents);

    const totalBonded = vaults.reduce((acc, v) => acc + BigInt(v.bondAvailable), 0n);
    const totalSlashed = slashes.reduce((acc, s) => acc + BigInt(s.penaltyPaid), 0n);

    // A violation can be stopped in two places: inside the vault (an IntentRejected event, which
    // lands in `intents`) or at the relay, which refuses to submit and publishes the signature
    // instead (which lands only in `feed_intents`). Counting just the first undercounted every
    // relay-refused violation — the hero showed "0 blocked" beside a non-zero payout. Keyed by
    // vault and nonce so an intent present in both places is counted once.
    const blocked = new Set<string>();
    for (const i of intents) {
      if (i.status === 'slashed' || i.status === 'rejected') blocked.add(`${i.chainId}:${i.vault}:${i.nonce}`);
    }
    for (const f of feed) blocked.add(`${f.chainId}:${f.vault}:${f.nonce}`);
    // A reported violation is on-chain fact, so it counts even when the relay's own record of the
    // refused intent is gone (a reindexed database, or a violation reported by a third-party watcher).
    for (const sl of slashes) blocked.add(`${sl.chainId}:${sl.vault}:${sl.nonce}`);
    const violationsBlocked = blocked.size;

    return {
      totalBonded: totalBonded.toString(),
      totalSlashedToDepositors: totalSlashed.toString(),
      violationsBlocked,
      vaultCount: vaults.length,
      activeVaults: vaults.filter((v) => v.state === 1 || v.state === 2).length,
    };
  });
}
