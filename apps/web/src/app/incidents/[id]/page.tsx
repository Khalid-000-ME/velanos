import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, Chip, formatAmount, formatDate, shortAddress } from '@aegis/ui';
import { IncidentTimeline } from '@/components/IncidentTimeline';
import { MoneyFlow } from '@/components/MoneyFlow';
import { CHAIN_LABELS, api } from '@/lib/api';

export const dynamic = 'force-dynamic';

const CATEGORY_COPY: Record<string, { kicker: string; explain: string }> = {
  static_violation: {
    kicker: 'Mandate breach',
    explain:
      'The agent signed an action its mandate forbids. The trade never happened — and the signature it put on that action is what paid depositors.',
  },
  drawdown: {
    kicker: 'Drawdown breaker',
    explain:
      'No rule was broken here. The market moved, NAV per share fell through the floor depositors were promised, and the agent’s bond was spent closing the gap.',
  },
  late_settlement: {
    kicker: 'Failure to settle',
    explain:
      'The mandate’s term ended with positions still open and the agent did not wind them down. Walking away is itself a breach.',
  },
};

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const incident = await api.incident(id);
  if (!incident) notFound();

  const copy = CATEGORY_COPY[incident.category] ?? CATEGORY_COPY.static_violation!;
  const dec = incident.settlementDecimals;
  const sym = incident.settlementSymbol;
  const totalPaid = (
    BigInt(incident.totalPaidToDepositors) + BigInt(incident.totalPaidToReporter)
  ).toString();

  return (
    <div className="content-width pt-8">
      <Link
        href={`/vaults/${incident.vault}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink)]"
      >
        <ArrowLeft size={14} /> {incident.vaultName}
      </Link>

      {/* ── black hero ─────────────────────────────────────────────────── */}
      <div className="mt-4 rounded-[var(--radius-lg)] bg-[var(--black)] px-6 py-8 text-[var(--on-black)] sm:px-10 sm:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--green)]">
                {copy.kicker}
              </span>
              {incident.rule ? (
                <span className="rounded-[var(--radius-sm)] bg-[var(--loss)] px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  Rule {incident.ruleId}
                </span>
              ) : null}
            </div>

            <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-[1.12] tracking-[-0.02em] sm:text-4xl">
              {incident.title}
            </h1>

            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-[var(--on-black-2)]">
              {copy.explain}
            </p>

            <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--on-black-2)]">
              <span>{CHAIN_LABELS[incident.chainId] ?? incident.chainId}</span>
              <span>{shortAddress(incident.vault, 6)}</span>
              <span>{formatDate(incident.openedAt)}</span>
              {incident.closedAt ? <span>resolved</span> : <span className="text-[var(--warn)]">open</span>}
            </p>
          </div>

          <div className="space-y-6 rounded-[var(--radius)] bg-white/[0.06] p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--on-black-2)]">
                Paid out of the agent&rsquo;s bond
              </p>
              <p className="mt-1.5 font-mono text-4xl font-semibold leading-none tracking-[-0.02em] text-[var(--green)]">
                {formatAmount(totalPaid, dec, { maxFractionDigits: 2 })}
                <span className="ml-2 text-xs font-medium text-[var(--on-black-2)]">{sym}</span>
              </p>
            </div>

            <MoneyFlow
              toDepositors={incident.totalPaidToDepositors}
              toReporter={incident.totalPaidToReporter}
              decimals={dec}
              symbol={sym}
            />
          </div>
        </div>
      </div>

      {/* ── timeline + context ─────────────────────────────────────────── */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <Card className="p-6">
          <IncidentTimeline steps={incident.steps} />
        </Card>

        <div className="space-y-4">
          {incident.rule ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold">
                Rule {incident.ruleId} — {incident.rule.title}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
                {incident.rule.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip tone={incident.rule.slashable ? 'negative' : 'warn'}>
                  {incident.rule.slashable ? 'Slashable' : 'Not slashable'}
                </Chip>
                <Chip>{incident.rule.band} rule</Chip>
              </div>
              {incident.rule.slashable ? (
                <p className="mt-3 border-t border-[var(--line)] pt-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
                  Static rules depend only on the intent and the mandate, so the agent could have
                  checked this itself before signing. That is why signing it is misconduct rather than
                  bad luck.
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="text-sm font-semibold">What this does not cover</h2>
            <ul className="mt-2 space-y-1.5 text-[13px] text-[var(--ink-3)]">
              <li>Losses within the drawdown limit</li>
              <li>Strategy underperformance</li>
            </ul>
            <p className="mt-3 border-t border-[var(--line)] pt-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
              Payouts are capped at the size of the bond. Any shortfall beyond it stays with
              depositors, and the fund screen shows that remainder before anyone deposits.
            </p>
          </Card>

          <Link
            href={`/vaults/${incident.vault}`}
            className="block rounded-[var(--radius)] border border-[var(--line)] px-5 py-4 text-sm font-medium transition-colors hover:bg-[var(--bg-subtle)]"
          >
            Open the vault cockpit →
          </Link>
        </div>
      </div>
    </div>
  );
}
