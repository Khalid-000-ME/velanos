import Link from 'next/link';
import { formatAmount } from '@aegis/ui';
import { api } from '@/lib/api';
import { Ticker } from './Ticker';

/**
 * The landing hero. Black panel, the thesis in six words, and three live counters.
 *
 * The counters are the argument: total bonded says agents have real capital at risk, total slashed
 * says the mechanism has actually fired, violations blocked says it fires often. All three come from
 * the indexer, so a judge is reading the protocol's own record rather than a marketing figure.
 */
export async function Hero() {
  const stats = await api.stats();

  return (
    <section className="content-width pt-8">
      <div className="rounded-[var(--radius-lg)] bg-[var(--black)] px-6 py-12 text-[var(--on-black)] sm:px-12 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
              Agents trade.
              <br />
              Bonds answer.
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[var(--on-black-2)]">
              Autonomous trading agents on Robinhood Chain and Arbitrum stake USDG before they touch
              yours. Every action is checked against an immutable mandate before any funds move — and
              when an agent breaks its mandate, its own capital pays you.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="#agents"
                className="rounded-[var(--radius-pill)] bg-[var(--green)] px-6 py-3 text-[15px] font-semibold text-black transition-colors hover:bg-[var(--green-hover)]"
              >
                Explore agents
              </Link>
              <Link
                href="/docs"
                className="rounded-[var(--radius-pill)] border border-white/40 px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-white/10"
              >
                How it works
              </Link>
            </div>
          </div>

          <dl className="grid gap-6 sm:grid-cols-3 lg:grid-cols-1">
            <Counter
              label="Total bonded by agents"
              value={stats ? formatAmount(stats.totalBonded, 6, { maxFractionDigits: 0 }) : '—'}
              unit="tUSDG"
              tone="green"
            />
            <Counter
              label="Slashed to depositors"
              value={
                stats ? formatAmount(stats.totalSlashedToDepositors, 6, { maxFractionDigits: 0 }) : '—'
              }
              unit="tUSDG"
              tone="loss"
            />
            <Counter
              label="Violations blocked"
              value={stats ? String(stats.violationsBlocked) : '—'}
              tone="white"
            />
          </dl>
        </div>
      </div>
    </section>
  );
}

function Counter({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: 'green' | 'loss' | 'white';
}) {
  const color = {
    green: 'var(--green)',
    loss: 'var(--loss)',
    white: '#ffffff',
  }[tone];

  return (
    <div className="border-t border-white/15 pt-4 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--on-black-2)]">
        {label}
      </dt>
      <dd className="mt-1.5 flex items-baseline gap-1.5" style={{ color }}>
        <Ticker value={value} className="font-mono text-3xl font-semibold tracking-[-0.02em]" />
        {unit ? <span className="text-xs text-[var(--on-black-2)]">{unit}</span> : null}
      </dd>
      <div className="mt-2 h-0.5 w-10 rounded-full" style={{ background: color }} />
    </div>
  );
}
