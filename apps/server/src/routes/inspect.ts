import type { FastifyInstance } from 'fastify';
import { and, eq, desc } from 'drizzle-orm';
import { velanosVaultAbi } from '@velanos/config';
import { RULES, explain, type Mandate, type RuleId, type TradeIntent } from '@velanos/agent-sdk';
import { db, schema } from '../db/index';
import { explorerTxUrl, publicClientFor } from '../lib/chains';

/**
 * Backs the pre-flight inspector: one intent, every rule, actual against limit.
 *
 * The checklist is recomputed from live chain state rather than stored at index time. A judge should
 * be able to open any intent — including one that executed hours ago — and see the same verdict the
 * contract reached, derived the same way, rather than a snapshot we took and might have got wrong.
 */
export async function inspectRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { chainId: string; vault: string; nonce: string } }>(
    '/intents/:chainId/:vault/:nonce',
    async (req, reply) => {
      const chainId = Number(req.params.chainId);
      const { vault, nonce } = req.params;

      const stored = (
        await db
          .select()
          .from(schema.intents)
          .where(
            and(
              eq(schema.intents.chainId, chainId),
              eq(schema.intents.vault, vault),
              eq(schema.intents.nonce, nonce),
            ),
          )
          .limit(1)
      )[0];

      const published = (
        await db
          .select()
          .from(schema.feedIntents)
          .where(
            and(
              eq(schema.feedIntents.chainId, chainId),
              eq(schema.feedIntents.vault, vault),
              eq(schema.feedIntents.nonce, nonce),
            ),
          )
          .limit(1)
      )[0];

      const intentJson = stored?.intentJson ?? published?.intentJson;
      if (!intentJson) {
        return reply.code(404).send({
          error: 'no stored intent for this nonce',
          hint: 'only intents that went through the relay or the public feed carry their full body',
        });
      }

      const intent = reviveIntent(JSON.parse(intentJson) as Record<string, unknown>);
      const client = publicClientFor(chainId);

      const [mandate, frozenAt] = await Promise.all([
        client.readContract({
          address: intent.vault,
          abi: velanosVaultAbi,
          functionName: 'mandate',
        }) as Promise<unknown>,
        client.readContract({
          address: intent.vault,
          abi: velanosVaultAbi,
          functionName: 'frozenAt',
        }) as Promise<unknown>,
      ]);

      const snapshot = (await client.readContract({
        address: intent.vault,
        abi: velanosVaultAbi,
        functionName: 'snapshot',
        args: [intent as never],
      })) as never;

      const digest = (await client.readContract({
        address: intent.vault,
        abi: velanosVaultAbi,
        functionName: 'hashIntent',
        args: [intent as never],
      })) as string;

      const checks = explain(
        intent,
        mandate as Mandate,
        BigInt(frozenAt as bigint),
        snapshot,
        BigInt(Math.floor(Date.now() / 1000)),
      );

      const rationale = intent.rationaleHash
        ? (
            await db
              .select()
              .from(schema.rationales)
              .where(eq(schema.rationales.hash, intent.rationaleHash.toLowerCase()))
              .limit(1)
          )[0]
        : undefined;

      const slash = (
        await db
          .select()
          .from(schema.slashes)
          .where(and(eq(schema.slashes.vault, vault), eq(schema.slashes.nonce, nonce)))
          .limit(1)
      )[0];

      return {
        chainId,
        vault,
        nonce,
        intent: JSON.parse(intentJson),
        signature: stored?.signature ?? published?.signature ?? null,
        signer: (mandate as Mandate).agentSigner,
        digest,
        status: stored?.status ?? 'published',
        ruleId: stored?.ruleId ?? published?.ruleId ?? null,
        rule: ruleOf(stored?.ruleId ?? published?.ruleId),
        slashed: stored?.slashed ?? false,
        txHash: stored?.txHash ?? null,
        txUrl: stored?.txHash ? explorerTxUrl(chainId, stored.txHash) : null,
        amountOut: stored?.amountOut ?? null,
        rationale: rationale
          ? { text: rationale.text, model: rationale.model, profile: rationale.profile }
          : null,
        // The full ordered checklist, which is the point of the screen.
        checks: checks.map((c) => ({
          ruleId: c.ruleId,
          passed: c.passed,
          actual: c.actual.toString(),
          limit: c.limit.toString(),
          ...(c.ruleId !== 0 ? { rule: RULES[c.ruleId] } : {}),
        })),
        slash: slash
          ? {
              penaltyPaid: slash.penaltyPaid,
              bountyPaid: slash.bountyPaid,
              reporter: slash.reporter,
              txUrl: slash.txHash ? explorerTxUrl(chainId, slash.txHash) : null,
            }
          : null,
      };
    },
  );

  app.get<{ Querystring: { vault?: string } }>('/incidents', async (req) => {
    const rows = req.query.vault
      ? await db
          .select()
          .from(schema.incidents)
          .where(eq(schema.incidents.vault, req.query.vault))
          .orderBy(desc(schema.incidents.id))
      : await db.select().from(schema.incidents).orderBy(desc(schema.incidents.id)).limit(50);

    return {
      incidents: rows.map((i) => ({
        id: i.id,
        chainId: i.chainId,
        vault: i.vault,
        title: i.title,
        category: i.category,
        ruleId: i.ruleId,
        rule: ruleOf(i.ruleId),
        totalPaidToDepositors: i.totalPaidToDepositors,
        totalPaidToReporter: i.totalPaidToReporter,
        stepCount: (JSON.parse(i.stepsJson) as unknown[]).length,
        openedAt: i.openedAt,
        closedAt: i.closedAt,
      })),
    };
  });

  app.get<{ Params: { id: string } }>('/incidents/:id', async (req, reply) => {
    const rows = await db
      .select()
      .from(schema.incidents)
      .where(eq(schema.incidents.id, Number(req.params.id)))
      .limit(1);
    const i = rows[0];
    if (!i) return reply.code(404).send({ error: 'unknown incident' });

    const vaultRow = (
      await db.select().from(schema.vaults).where(eq(schema.vaults.address, i.vault)).limit(1)
    )[0];

    const steps = (JSON.parse(i.stepsJson) as Array<Record<string, unknown>>).map((s) => ({
      ...s,
      txUrl: s.txHash ? explorerTxUrl(i.chainId, String(s.txHash)) : null,
    }));

    return {
      id: i.id,
      chainId: i.chainId,
      vault: i.vault,
      vaultName: vaultRow?.name ?? i.vault,
      settlementSymbol: vaultRow?.settlementSymbol ?? '',
      settlementDecimals: vaultRow?.settlementDecimals ?? 6,
      title: i.title,
      category: i.category,
      ruleId: i.ruleId,
      rule: ruleOf(i.ruleId),
      totalPaidToDepositors: i.totalPaidToDepositors,
      totalPaidToReporter: i.totalPaidToReporter,
      steps,
      openedAt: i.openedAt,
      closedAt: i.closedAt,
    };
  });
}

function ruleOf(ruleId: number | null | undefined) {
  if (!ruleId) return null;
  return RULES[ruleId as RuleId] ?? null;
}

function reviveIntent(raw: Record<string, unknown>): TradeIntent {
  return {
    vault: raw.vault as TradeIntent['vault'],
    kind: Number(raw.kind) as TradeIntent['kind'],
    adapter: raw.adapter as TradeIntent['adapter'],
    assetIn: raw.assetIn as TradeIntent['assetIn'],
    assetOut: raw.assetOut as TradeIntent['assetOut'],
    amountIn: BigInt(raw.amountIn as string),
    minOut: BigInt(raw.minOut as string),
    leverageBps: Number(raw.leverageBps),
    isLong: Boolean(raw.isLong),
    nonce: BigInt(raw.nonce as string),
    issuedAt: BigInt(raw.issuedAt as string),
    deadline: BigInt(raw.deadline as string),
    rationaleHash: raw.rationaleHash as TradeIntent['rationaleHash'],
  };
}
