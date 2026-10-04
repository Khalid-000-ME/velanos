import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { velanosVaultAbi } from '@velanos/config';
import {
  RULES,
  SignedIntentSchema,
  checkStateful,
  checkStatic,
  recoverIntentSigner,
  type Mandate,
  type RuleId,
  type TradeIntent,
} from '@velanos/agent-sdk';
import { db, schema } from '../db/index';
import { publicClientFor, relayWalletFor, explorerTxUrl, chainFor } from '../lib/chains';
import { readDeployment } from '../lib/deployments';
import { emit, jsonSafe } from '../lib/events';
import { appendStep, openIncident } from '../lib/incidents';

const RelayBody = z.object({
  intent: SignedIntentSchema.shape.intent,
  sig: SignedIntentSchema.shape.sig,
  chainId: z.coerce.number().int().optional(),
  /** Optional provenance for the incident replay: which rogue profile produced this. */
  profile: z.string().optional(),
});

/**
 * The relay, and the reason a blocked trade still costs the agent something.
 *
 * An honest agent asks the relay to submit for it and gets gas sponsorship and a second opinion. A
 * misbehaving one gets refused — but refusal is not absolution. The relay publishes the signed
 * intent to a public feed instead of submitting it, and any watcher can take that signature to the
 * court and be paid for it.
 *
 * So the agent's funds are never at risk from a rule it broke, and the agent is still liable for
 * breaking it. Those two properties usually trade off against each other; separating submission
 * from evidence is what buys both.
 */
export async function relayRoutes(app: FastifyInstance): Promise<void> {
  app.post('/intents', async (req, reply) => {
    const parsed = RelayBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid intent', detail: parsed.error.flatten() });
    }
    const { intent, sig, profile } = parsed.data;

    const vaultRow = (
      await db.select().from(schema.vaults).where(eq(schema.vaults.address, intent.vault)).limit(1)
    )[0];
    if (!vaultRow) return reply.code(404).send({ error: 'unknown vault' });

    const chainId = parsed.data.chainId ?? vaultRow.chainId;
    const client = publicClientFor(chainId);

    // The signature is checked here, before anything else, because an intent that does not recover
    // to the agent's key is not evidence of anything and must not reach the public feed.
    const mandate = (await client.readContract({
      address: intent.vault,
      abi: velanosVaultAbi,
      functionName: 'mandate',
    })) as unknown as Mandate;

    const signer = await recoverIntentSigner(intent as TradeIntent, sig, chainId);
    if (signer.toLowerCase() !== mandate.agentSigner.toLowerCase()) {
      return reply.code(401).send({ error: 'signature does not match the vault agent', signer });
    }

    const frozenAt = (await client.readContract({
      address: intent.vault,
      abi: velanosVaultAbi,
      functionName: 'frozenAt',
    })) as bigint;

    const staticRule = checkStatic(intent as TradeIntent, mandate, frozenAt);

    if (staticRule !== 0) {
      await publishToFeed(chainId, intent as TradeIntent, sig, staticRule, profile);
      return {
        submitted: false,
        published: true,
        ruleId: staticRule,
        slashable: true,
        rule: RULES[staticRule],
        reason:
          'This intent breaks a static mandate rule. The relay will not submit it, but the signature is now public evidence and anyone may report it to the court.',
      };
    }

    const snapshot = (await client.readContract({
      address: intent.vault,
      abi: velanosVaultAbi,
      functionName: 'snapshot',
      args: [intent as never],
    })) as never;

    const statefulRule = checkStateful(
      intent as TradeIntent,
      mandate,
      snapshot,
      BigInt(Math.floor(Date.now() / 1000)),
    );
    if (statefulRule !== 0) {
      // Not misconduct, so nothing is published. Submitting it would burn gas to produce a
      // rejection the agent can already see.
      return {
        submitted: false,
        published: false,
        ruleId: statefulRule,
        slashable: false,
        rule: RULES[statefulRule],
        reason: 'Blocked on live state, not misconduct. Nothing is slashed and nothing is published.',
      };
    }

    const wallet = relayWalletFor(chainId);
    if (!wallet?.account) {
      return reply.code(503).send({
        error: 'relay has no signing key configured; set RELAY_PK or submit directly',
      });
    }

    const txHash = await wallet.writeContract({
      address: intent.vault,
      abi: velanosVaultAbi,
      functionName: 'execute',
      args: [intent as never, sig],
      chain: chainFor(chainId),
      account: wallet.account,
    });

    await db
      .insert(schema.intents)
      .values({
        chainId,
        // Lower-cased to match the indexer's rows. Stored checksummed, the unique (chain, vault, nonce)
        // index treats the same intent as two, and every relayed trade showed up twice.
        vault: intent.vault.toLowerCase(),
        nonce: intent.nonce.toString(),
        status: 'executed',
        route: 'relay',
        kind: Number(intent.kind),
        assetIn: intent.assetIn,
        assetOut: intent.assetOut,
        amountIn: intent.amountIn.toString(),
        rationaleHash: intent.rationaleHash,
        txHash,
        ts: Math.floor(Date.now() / 1000),
        intentJson: JSON.stringify(jsonSafe(intent)),
        signature: sig,
      })
      .onConflictDoUpdate({
        target: [schema.intents.chainId, schema.intents.vault, schema.intents.nonce],
        set: { txHash, route: 'relay', status: 'executed' },
      });

    emit('RelaySubmitted', chainId, { nonce: intent.nonce.toString(), txHash }, {
      vault: intent.vault,
      txHash,
    });

    return { submitted: true, txHash, txUrl: explorerTxUrl(chainId, txHash), ruleId: 0 };
  });

  /** The public evidence locker, newest first. Backs the /watch screen. */
  app.get('/feed/intents/list', async () => {
    const rows = await db
      .select()
      .from(schema.feedIntents)
      .orderBy(desc(schema.feedIntents.ts))
      .limit(100);

    // The court address travels with each entry so the UI can submit a report without ever holding
    // an address literal of its own.
    const courts = new Map<number, string | undefined>();
    for (const r of rows) {
      if (!courts.has(r.chainId)) {
        courts.set(r.chainId, readDeployment(r.chainId)?.contracts.ViolationCourt);
      }
    }

    return {
      intents: rows.map((r) => ({
        id: r.id,
        chainId: r.chainId,
        vault: r.vault,
        courtAddress: courts.get(r.chainId) ?? null,
        nonce: r.nonce,
        intent: JSON.parse(r.intentJson),
        signature: r.signature,
        ruleId: r.ruleId,
        rule: RULES[r.ruleId as RuleId],
        slashable: r.slashable,
        reported: Boolean(r.reportedTxHash),
        reportedTxHash: r.reportedTxHash,
        reportedTxUrl: r.reportedTxHash ? explorerTxUrl(r.chainId, r.reportedTxHash) : null,
        ts: r.ts,
      })),
    };
  });

  app.post<{ Body: { chainId?: number; vault?: string; nonce?: string; txHash?: string } }>(
    '/feed/intents/reported',
    async (req, reply) => {
      const { chainId, vault, nonce, txHash } = req.body ?? {};
      if (!chainId || !vault || !nonce || !txHash) {
        return reply.code(400).send({ error: 'chainId, vault, nonce and txHash are required' });
      }
      await db
        .update(schema.feedIntents)
        .set({ reportedTxHash: txHash })
        .where(
          and(
            eq(schema.feedIntents.chainId, chainId),
            eq(schema.feedIntents.vault, vault),
            eq(schema.feedIntents.nonce, nonce),
          ),
        );
      return { ok: true };
    },
  );

  app.post<{ Body: { hash?: string; text?: string; model?: string; profile?: string; promptExcerpt?: string } }>(
    '/rationales',
    async (req, reply) => {
      const body = req.body ?? {};
      if (!body.hash || typeof body.text !== 'string') {
        return reply.code(400).send({ error: 'hash and text are required' });
      }
      await db
        .insert(schema.rationales)
        .values({
          hash: body.hash.toLowerCase(),
          text: body.text,
          model: body.model ?? '',
          profile: body.profile ?? '',
          promptExcerpt: body.promptExcerpt ?? '',
          createdAt: Math.floor(Date.now() / 1000),
        })
        .onConflictDoNothing();
      return { ok: true };
    },
  );

  app.get<{ Params: { hash: string } }>('/rationales/:hash', async (req, reply) => {
    const rows = await db
      .select()
      .from(schema.rationales)
      .where(eq(schema.rationales.hash, req.params.hash.toLowerCase()))
      .limit(1);
    if (!rows[0]) return reply.code(404).send({ error: 'unknown rationale' });
    return rows[0];
  });
}

async function publishToFeed(
  chainId: number,
  intent: TradeIntent,
  sig: string,
  ruleId: RuleId,
  profile?: string,
): Promise<void> {
  const ts = Math.floor(Date.now() / 1000);

  await db
    .insert(schema.feedIntents)
    .values({
      chainId,
      vault: intent.vault,
      nonce: intent.nonce.toString(),
      intentJson: JSON.stringify(jsonSafe(intent)),
      signature: sig,
      ruleId,
      slashable: true,
      ts,
    })
    .onConflictDoNothing();

  const incidentId = await openIncident({
    chainId,
    vault: intent.vault,
    category: 'static_violation',
    ruleId,
    ts,
  });

  const rationale = (
    await db
      .select()
      .from(schema.rationales)
      .where(eq(schema.rationales.hash, intent.rationaleHash.toLowerCase()))
      .limit(1)
  )[0];

  if (rationale) {
    if (rationale.promptExcerpt) {
      await appendStep(incidentId, {
        type: 'LLM_INPUT',
        ts,
        label: 'Model input',
        data: { excerpt: rationale.promptExcerpt, profile: rationale.profile || profile },
      });
    }
    await appendStep(incidentId, {
      type: 'PROPOSAL',
      ts,
      label: 'Agent proposed a trade',
      data: { rationale: rationale.text, model: rationale.model, profile: rationale.profile || profile },
    });
  }

  await appendStep(incidentId, {
    type: 'INTENT_SIGNED',
    ts,
    label: 'Intent signed by the agent key',
    data: { nonce: intent.nonce.toString(), signature: sig },
  });
  await appendStep(incidentId, {
    type: 'GUARD_VERDICT',
    ts,
    label: `Relay refused to submit: rule ${ruleId} ${RULES[ruleId].title}`,
    data: { ruleId, slashable: true, publishedToFeed: true },
  });

  emit(
    'FeedIntentPublished',
    chainId,
    { nonce: intent.nonce.toString(), ruleId, rule: RULES[ruleId], intent: jsonSafe(intent), signature: sig },
    { vault: intent.vault },
  );
}
