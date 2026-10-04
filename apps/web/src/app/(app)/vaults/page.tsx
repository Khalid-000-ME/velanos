import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Chip, EmptyState, formatAmount, shortAddress } from '@velanos/ui';
import { VaultTable } from '@/components/VaultTable';
import { CHAIN_SHORT, api } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vaults' };

/**
 * The app home: every vault, then every incident.
 *
 * Incidents sit here rather than on the landing page because they are the evidence a sceptical
 * visitor goes looking for once they have decided the idea is worth checking.
 */
export default async function VaultsPage() {
  const [vaultsRes, incidentsRes] = await Promise.all([api.vaults(), api.incidents()]);
  const vaults = vaultsRes?.vaults ?? [];
  const incidents = incidentsRes?.incidents ?? [];

  return (
    <div className="content-width pt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">Vaults</h1>
          <p className="mt-3 max-w-xl text-[16px] text-[var(--ink-2)]">
            One agent, one immutable mandate and one bond per vault. Open a vault to see every intent its
            agent has signed and what the contract decided.
          </p>
        </div>
      </div>

      <div className="mt-10">
        <VaultTable vaults={vaults} />
      </div>

      <section id="incidents" className="mt-20 scroll-mt-24">
        <h2 className="text-[1.75rem] font-semibold tracking-[-0.03em]">Incident replays</h2>
        <p className="mt-2 text-[15px] text-[var(--ink-2)]">
          Every failure, reconstructed step by step — what the agent saw, what it signed, and where the
          money went.
        </p>

        {incidents.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="No incidents yet"
              hint="Run the prompt-injection scenario from the console to create one."
            />
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {incidents.map((incident) => (
              <Link
                key={incident.id}
                href={`/incidents/${incident.id}`}
                className="group flex flex-col rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-7 transition-colors hover:border-[var(--line-strong)]"
              >
                <div className="flex items-center gap-2">
                  <Chip tone={incident.category === 'drawdown' ? 'warn' : 'negative'}>
                    {incident.category.replace('_', ' ')}
                  </Chip>
                  {incident.ruleId ? (
                    <span className="font-mono text-[11px] text-[var(--ink-3)]">rule {incident.ruleId}</span>
                  ) : null}
                </div>
                <h3 className="mt-5 text-[17px] font-semibold leading-snug">{incident.title}</h3>
                <p className="mt-2 flex-1 text-[13px] text-[var(--ink-3)]">
                  {vaults.find((v) => v.address.toLowerCase() === incident.vault.toLowerCase())?.name ??
                    shortAddress(incident.vault)}{' '}
                  · {CHAIN_SHORT[incident.chainId] ?? `chain ${incident.chainId}`}
                </p>
                <p className="mt-6 text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
                  Paid to depositors
                </p>
                <p className="mt-1.5 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--green)]">
                  {formatAmount(incident.totalPaidToDepositors, 6, { maxFractionDigits: 2 })}
                </p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--ink-2)] transition-colors group-hover:text-[var(--ink)]">
                  Watch the replay <ArrowRight size={14} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
