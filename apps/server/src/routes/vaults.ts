import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { mandateToEnglish, type Mandate } from '@aegis/agent-sdk';
import { db, schema } from '../db/index';
import { explorerTxUrl } from '../lib/chains';
import { readDeployment } from '../lib/deployments';

const ChainIdQuery = z.object({
  chainId: z.coerce.number().int().optional(),
  state: z.coerce.number().int().optional(),
});

/** The mandate is stored as JSON with decimal strings; the SDK wants bigints. */
function reviveMandate(json: string): Mandate {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const big = (k: string) => BigInt((raw[k] as string | number | undefined) ?? 0);
  const num = (k: string) => Number(raw[k] ?? 0);
  return {
    agentSigner: raw.agentSigner as Mandate['agentSigner'],
    operator: raw.operator as Mandate['operator'],
    settlementAsset: raw.settlementAsset as Mandate['settlementAsset'],
    kind: num('kind') as Mandate['kind'],
    allowedAssets: (raw.allowedAssets ?? []) as Mandate['allowedAssets'],
    allowedAdapters: (raw.allowedAdapters ?? []) as Mandate['allowedAdapters'],
    maxAllocation: big('maxAllocation'),
    maxTradeAmount: big('maxTradeAmount'),
    maxAssetExposureBps: num('maxAssetExposureBps'),
    maxSlippageBps: num('maxSlippageBps'),
    maxLeverageBps: num('maxLeverageBps'),
    maxDrawdownBps: num('maxDrawdownBps'),
    maxDailyLossBps: num('maxDailyLossBps'),
    start: big('start'),
    expiry: big('expiry'),
    bondRequired: big('bondRequired'),
    perViolationPenalty: big('perViolationPenalty'),
    reporterBountyBps: num('reporterBountyBps'),
    riskTier: num('riskTier'),
    metadataURI: String(raw.metadataURI ?? ''),
  };
}

function assetSymbolMap(chainId: number): Record<string, string> {
  const d = readDeployment(chainId);
  if (!d) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(d.assets)) out[entry.address.toLowerCase()] = key;
  return out;
}

export async function vaultRoutes(app: FastifyInstance): Promise<void> {
  app.get('/vaults', async (req) => {
    const q = ChainIdQuery.parse(req.query);
    const rows = await db.select().from(schema.vaults).orderBy(desc(schema.vaults.updatedAt));
    const filtered = rows.filter(
      (v) =>
        (q.chainId === undefined || v.chainId === q.chainId) &&
        (q.state === undefined || v.state === q.state),
    );
    return { vaults: filtered.map(serialiseVault) };
  });

  app.get<{ Params: { address: string } }>('/vaults/:address', async (req, reply) => {
    const rows = await db
      .select()
      .from(schema.vaults)
      .where(eq(schema.vaults.address, req.params.address))
      .limit(1);
    const v = rows[0];
    if (!v) return reply.code(404).send({ error: 'unknown vault' });

    const mandate = reviveMandate(v.mandateJson);
    const positions = await db
      .select()
      .from(schema.positions)
      .where(and(eq(schema.positions.chainId, v.chainId), eq(schema.positions.vault, v.address)));

    const agent = (
      await db
        .select()
        .from(schema.agents)
        .where(and(eq(schema.agents.chainId, v.chainId), eq(schema.agents.agentId, v.agentId)))
        .limit(1)
    )[0];

    return {
      ...serialiseVault(v),
      agent: agent ? { ...agent, erc8004Id: agent.erc8004Id } : null,
      mandate: JSON.parse(v.mandateJson),
      // Rendered server-side so the fund screen, the docs page and a share card cannot drift
      // into describing the same mandate differently.
      mandateEnglish:
        v.settlementSymbol === ''
          ? []
          : mandateToEnglish(mandate, {
              settlementSymbol: v.settlementSymbol,
              settlementDecimals: v.settlementDecimals,
              assetSymbols: assetSymbolMap(v.chainId),
            }),
      positions: positions.map((p) => ({
        asset: p.asset,
        symbol: p.symbol,
        amount: p.amount,
        valueSettlement: p.valueSettlement,
        exposureBps: p.exposureBps,
      })),
    };
  });

  app.get<{ Params: { address: string }; Querystring: { range?: string } }>(
    '/vaults/:address/nav',
    async (req) => {
      const ranges: Record<string, number> = { '1h': 3_600, '24h': 86_400, '7d': 604_800 };
      const window = ranges[req.query.range ?? '24h'] ?? 86_400;
      const since = Math.floor(Date.now() / 1000) - window;

      const points = await db
        .select()
        .from(schema.navPoints)
        .where(and(eq(schema.navPoints.vault, req.params.address), gte(schema.navPoints.ts, since)))
        .orderBy(asc(schema.navPoints.ts))
        .limit(2_000);

      // Slashes and shocks are returned alongside the series so the chart can mark *why* the line
      // moved, not just that it did.
      const slashes = await db
        .select()
        .from(schema.slashes)
        .where(eq(schema.slashes.vault, req.params.address));
      const shocks = await db
        .select()
        .from(schema.marketShocks)
        .where(gte(schema.marketShocks.ts, since));

      return {
        points: points.map((p) => ({
          ts: p.ts,
          nav: p.nav,
          pricePerShareWad: p.pricePerShareWad,
          hwmWad: p.hwmWad,
          floorWad: p.floorWad,
        })),
        markers: {
          slashes: slashes.map((s) => ({ ts: s.ts, amount: s.penaltyPaid, kind: s.kind, txHash: s.txHash })),
          shocks: shocks.map((s) => ({ ts: s.ts, symbol: s.symbol, bps: s.bps, txHash: s.txHash })),
        },
      };
    },
  );

  app.get<{ Params: { address: string }; Querystring: { limit?: string } }>(
    '/vaults/:address/intents',
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const rows = await db
        .select()
        .from(schema.intents)
        .where(eq(schema.intents.vault, req.params.address))
        .orderBy(desc(schema.intents.ts))
        .limit(limit);

      const withRationales = await Promise.all(
        rows.map(async (r) => {
          const rationale = r.rationaleHash
            ? (
                await db
                  .select()
                  .from(schema.rationales)
                  .where(eq(schema.rationales.hash, r.rationaleHash))
                  .limit(1)
              )[0]
            : undefined;
          return {
            ...r,
            rationale: rationale?.text ?? null,
            model: rationale?.model ?? null,
            profile: rationale?.profile ?? null,
            txUrl: r.txHash ? explorerTxUrl(r.chainId, r.txHash) : null,
          };
        }),
      );
      return { intents: withRationales };
    },
  );

  app.get('/agents', async () => {
    const agents = await db.select().from(schema.agents);
    const vaults = await db.select().from(schema.vaults);

    return {
      agents: agents.map((a) => {
        const own = vaults.filter((v) => v.chainId === a.chainId && v.agentId === a.agentId);
        return {
          ...a,
          vaultCount: own.length,
          bondLocked: own.reduce((acc, v) => acc + BigInt(v.bondAvailable), 0n).toString(),
          bondSlashed: own.reduce((acc, v) => acc + BigInt(v.bondSlashed), 0n).toString(),
          chains: [...new Set(own.map((v) => v.chainId))],
          vaults: own.map(serialiseVault),
        };
      }),
    };
  });

  app.get<{ Params: { id: string } }>('/agents/:id', async (req, reply) => {
    const agentId = Number(req.params.id);
    const rows = await db.select().from(schema.agents).where(eq(schema.agents.agentId, agentId));
    if (rows.length === 0) return reply.code(404).send({ error: 'unknown agent' });

    const vaults = await db.select().from(schema.vaults).where(eq(schema.vaults.agentId, agentId));
    const slashes = (
      await db.select().from(schema.slashes)
    ).filter((s) => vaults.some((v) => v.address === s.vault));

    return {
      agent: rows[0],
      allChains: rows,
      vaults: vaults.map(serialiseVault),
      violations: slashes.map((s) => ({
        ...s,
        txUrl: s.txHash ? explorerTxUrl(s.chainId, s.txHash) : null,
      })),
    };
  });
}

function serialiseVault(v: typeof schema.vaults.$inferSelect) {
  return {
    chainId: v.chainId,
    address: v.address,
    agentId: v.agentId,
    name: v.name,
    symbol: v.symbol,
    kind: v.kind,
    mandateHash: v.mandateHash,
    perpAdapter: v.perpAdapter,
    settlementSymbol: v.settlementSymbol,
    settlementDecimals: v.settlementDecimals,
    state: v.state,
    freezeReason: v.freezeReason,
    frozenAt: v.frozenAt,
    settledAt: v.settledAt,
    nav: v.nav,
    pricePerShareWad: v.pricePerShareWad,
    hwmWad: v.hwmWad,
    floorWad: v.floorWad,
    bondAvailable: v.bondAvailable,
    bondSlashed: v.bondSlashed,
    bondStaked: v.bondStaked,
    staticViolations: v.staticViolations,
    strikes: v.strikes,
    updatedAt: v.updatedAt,
  };
}
