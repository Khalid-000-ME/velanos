import { and, desc, eq } from 'drizzle-orm';
import { RULES, type RuleId } from '@aegis/agent-sdk';
import { db, schema } from '../db/index';

export type IncidentStepType =
  | 'LLM_INPUT'
  | 'PROPOSAL'
  | 'INTENT_SIGNED'
  | 'GUARD_VERDICT'
  | 'REPORTED'
  | 'SLASHED'
  | 'LP_CREDITED'
  | 'STATE_CHANGED'
  | 'UNWOUND'
  | 'DRAWDOWN_COMPENSATED'
  | 'MARKET_SHOCK';

export interface IncidentStep {
  type: IncidentStepType;
  ts: number;
  txHash?: string;
  /** Short line the replay timeline renders. */
  label: string;
  data?: Record<string, unknown>;
}

export type IncidentCategory = 'static_violation' | 'drawdown' | 'late_settlement';

/**
 * Assembles the replay narrative for one failure.
 *
 * The incident is built as events arrive rather than reconstructed at render time. Ordering from
 * raw logs after the fact is ambiguous — several things land in the same block, and the off-chain
 * steps (the poisoned headline, the LLM's proposal) have no log at all — so the sequence a judge
 * watches would be a guess. Appending once, in arrival order, keeps the story exactly as it
 * happened.
 */
export async function openIncident(args: {
  chainId: number;
  vault: string;
  category: IncidentCategory;
  ruleId?: RuleId | 0;
  title?: string;
  ts: number;
}): Promise<number> {
  const existing = await findOpenIncident(args.chainId, args.vault);
  if (existing) return existing.id;

  const [row] = await db
    .insert(schema.incidents)
    .values({
      chainId: args.chainId,
      vault: args.vault,
      category: args.category,
      ruleId: args.ruleId ? args.ruleId : null,
      title: args.title ?? defaultTitle(args.category, args.ruleId),
      openedAt: args.ts,
      stepsJson: '[]',
    })
    .returning({ id: schema.incidents.id });

  return row!.id;
}

export async function findOpenIncident(chainId: number, vault: string) {
  const rows = await db
    .select()
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.chainId, chainId),
        eq(schema.incidents.vault, vault),
        // `closedAt IS NULL` via drizzle's isNull would need an import; a settled vault closes
        // its incident explicitly, so the newest row is the live one.
      ),
    )
    .orderBy(desc(schema.incidents.id))
    .limit(1);

  const row = rows[0];
  return row && row.closedAt === null ? row : undefined;
}

export async function appendStep(incidentId: number, step: IncidentStep): Promise<void> {
  const rows = await db
    .select({ stepsJson: schema.incidents.stepsJson })
    .from(schema.incidents)
    .where(eq(schema.incidents.id, incidentId))
    .limit(1);
  if (!rows[0]) return;

  const steps = JSON.parse(rows[0].stepsJson) as IncidentStep[];
  steps.push(step);
  await db
    .update(schema.incidents)
    .set({ stepsJson: JSON.stringify(steps) })
    .where(eq(schema.incidents.id, incidentId));
}

export async function addPayout(
  incidentId: number,
  toDepositors: bigint,
  toReporter: bigint,
): Promise<void> {
  const rows = await db
    .select({
      depositors: schema.incidents.totalPaidToDepositors,
      reporter: schema.incidents.totalPaidToReporter,
    })
    .from(schema.incidents)
    .where(eq(schema.incidents.id, incidentId))
    .limit(1);
  if (!rows[0]) return;

  await db
    .update(schema.incidents)
    .set({
      totalPaidToDepositors: (BigInt(rows[0].depositors) + toDepositors).toString(),
      totalPaidToReporter: (BigInt(rows[0].reporter) + toReporter).toString(),
    })
    .where(eq(schema.incidents.id, incidentId));
}

export async function closeIncident(incidentId: number, ts: number): Promise<void> {
  await db.update(schema.incidents).set({ closedAt: ts }).where(eq(schema.incidents.id, incidentId));
}

function defaultTitle(category: IncidentCategory, ruleId?: RuleId | 0): string {
  if (category === 'drawdown') return 'Market drawdown through the floor — bond topped depositors up';
  if (category === 'late_settlement') return 'Agent failed to settle at expiry';
  if (ruleId) return `${RULES[ruleId].title} — blocked and slashed`;
  return 'Mandate breach — blocked and slashed';
}
