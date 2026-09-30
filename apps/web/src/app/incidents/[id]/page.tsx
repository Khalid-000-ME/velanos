import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Chip, Eyebrow, formatAmount, formatDate, shortAddress } from '@aegis/ui';
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
    <div className="content-width py-10">
      <Link
        href={`/vaults/${incident.vault}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink)]"
      >
        <ArrowLeft size={14} /> {incident.vaultName}
      </Link>

      {/* ── black hero ─────────────────────────────────────────────────── */}
      <div className="relative mt-5 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--black)] px-6 py-10 text-[var(--on-black)] sm:px-10 sm:py-12">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-40" aria-hidden />

        <div className="relative grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Eyebrow tone="onBlack">{copy.kicker}</Eyebrow>
              {incident.rule ? (
                <span className="rounded-[var(--radius-sm)] border border-[var(--loss)]/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--loss-on-black)]">
                  Rule {incident.ruleId}
                </span>
              ) : null}
            </div>

            <h1 className="text-h1 mt-5 max-w-2xl text-[var(--on-black)]">{incident.title}</h1>

            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--on-black-2)]">
              {copy.explain}
            </p>

            <p className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--on-black-2)]">
              <span>{CHAIN_LABELS[incident.chainId] ?? incident.chainId}</span>
              <span>{shortAddress(incident.vault, 6)}</span>
              <span>{formatDate(incident.openedAt)}</span>
              {incident.closedAt ? (
                <span>resolved</span>
              ) : (
                <span className="text-[var(--warn)]">open</span>
              )}
            </p>
          </div>

          <div className="space-y-7 rounded-[var(--radius)] border border-[var(--line-on-black)] bg-white/[0.04] p-6">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--on-black-2)]">
                Paid out of the agent&rsquo;s bond
              </p>
              <p className="mt-3 text-[2.75rem] font-medium leading-none tracking-[-0.03em] tabular-nums text-[var(--green-on-black)]">
                {formatAmount(totalPaid, dec, { maxFractionDigits: 2 })}
                <span className="ml-2 text-[12px] font-normal text-[var(--on-black-2)]">{sym}</span>
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
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-white">
          <header className="border-b border-[var(--line)] px-6 py-3">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
              Causal chain
            </h2>
          </header>
          <div className="p-6">
            <IncidentTimeline steps={incident.steps} />
          </div>
        </section>

        <div className="space-y-4">
          {incident.rule ? (
            <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white p-6">
              <Eyebrow>Rule {incident.ruleId}</Eyebrow>
              <h2 className="mt-3 text-[1.0625rem] font-medium tracking-[-0.01em]">
                {incident.rule.title}
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-2)]">
                {incident.rule.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Chip tone={incident.rule.slashable ? 'negative' : 'warn'}>
                  {incident.rule.slashable ? 'Slashable' : 'Not slashable'}
                </Chip>
                <Chip>{incident.rule.band}</Chip>
              </div>
              {incident.rule.slashable ? (
                <p className="mt-5 border-t border-[var(--line)] pt-4 text-[13px] leading-relaxed text-[var(--ink-3)]">
                  Static rules depend only on the intent and the mandate, so the agent could have
                  checked this itself before signing. That is why signing it is misconduct rather than
                  bad luck.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white p-6">
            <Eyebrow>Scope</Eyebrow>
            <h2 className="mt-3 text-[1.0625rem] font-medium tracking-[-0.01em]">
              What this does not cover
            </h2>
            <ul className="mt-3 space-y-1.5 text-[14px] text-[var(--ink-3)]">
              <li>Losses within the drawdown limit</li>
              <li>Strategy underperformance</li>
            </ul>
            <p className="mt-5 border-t border-[var(--line)] pt-4 text-[13px] leading-relaxed text-[var(--ink-3)]">
              Payouts are capped at the size of the bond. Any shortfall beyond it stays with
              depositors, and the fund screen names that remainder before anyone deposits.
            </p>
          </div>

          <Link
            href={`/vaults/${incident.vault}`}
            className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--line)] bg-white px-6 py-4 text-[14px] font-medium transition-colors hover:bg-[var(--bg-subtle)]"
          >
            Open the vault cockpit
            <span aria-hidden>&rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
