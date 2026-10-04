import { formatAmount } from '@velanos/ui';
import type { Stats as StatsData } from '@/lib/api';

/**
 * Four live figures, straight from the indexer.
 *
 * Capital at stake, capital paid out, how often the mechanism fired, and how many vaults are running.
 * Protocol records, not marketing — when the indexer is down they show a dash rather than a guess.
 */
export function Stats({ stats }: { stats: StatsData | null }) {
  const cells = [
    {
      label: 'Capital bonded by agents',
      value: stats ? formatAmount(stats.totalBonded, 6, { maxFractionDigits: 0 }) : '—',
      unit: 'tUSDG',
    },
    {
      label: 'Paid to depositors',
      value: stats ? formatAmount(stats.totalSlashedToDepositors, 6, { maxFractionDigits: 0 }) : '—',
      unit: 'tUSDG',
    },
    { label: 'Violations blocked', value: stats ? String(stats.violationsBlocked) : '—' },
    { label: 'Vaults under mandate', value: stats ? String(stats.vaultCount) : '—' },
  ];

  return (
    <section className="content-width pb-24">
      <div className="mb-6 flex justify-center">
        <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--green)]/25 bg-[var(--green-tint)] px-4 py-1.5 text-[13px] font-medium text-[var(--green)]">
          <span className="size-2 animate-pulse rounded-full bg-[var(--green)]" aria-hidden />
          Live from the chain
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-7 py-7"
          >
            <dt className="text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
              {c.label}
            </dt>
            <dd className="mt-3 flex items-baseline gap-2">
              <span className="text-[2.6rem] font-semibold leading-none tracking-[-0.035em] tabular-nums">
                {c.value}
              </span>
              {c.unit ? <span className="text-[13px] text-[var(--ink-3)]">{c.unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
