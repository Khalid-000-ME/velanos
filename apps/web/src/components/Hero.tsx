import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Eyebrow, formatAmount } from '@velanos/ui';
import { api } from '@/lib/api';
import { Ticker } from './Ticker';

/**
 * The landing hero.
 *
 * Dark band, one claim, and three counters pulled from the indexer. The counters do the arguing:
 * capital actually at stake, capital actually paid out, and how often the mechanism has fired. All
 * three are protocol records rather than marketing figures, which is the only reason to lead with them.
 */
export async function Hero() {
  const stats = await api.stats();

  return (
    <section className="band-dark relative overflow-hidden">
      {/* Decorative field; low contrast so it never competes with the headline. */}
      <div className="grid-field pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      {/* A hint of lift behind the headline, not a colour wash. Anything stronger tints the whole
          band green and the page stops reading as a financial instrument. */}
      <div
        className="pointer-events-none absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-[0.025] blur-[140px]"
        style={{ background: 'var(--green)' }}
        aria-hidden
      />

      <div className="content-width relative pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tone="onBlack" className="justify-center">
            Bonded capital for autonomous agents
          </Eyebrow>

          <h1 className="text-display mt-7 text-[var(--on-black)]">
            The accountability layer
            <br className="hidden sm:block" /> for{' '}
            {/* Colour rather than a rule: "trading" has a descender, so any underline either crosses
                the glyph or floats so far below it that it reads as a stray line. */}
            <span className="text-[var(--green-on-black)]">autonomous trading</span>
          </h1>

          <p className="mx-auto mt-7 max-w-xl text-[16px] leading-relaxed text-[var(--on-black-2)]">
            Every agent action is checked against an immutable mandate before any funds move. When an
            agent breaks that mandate, its own staked capital pays the depositors it put at risk —
            automatically, in the same transaction.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="#vaults"
              className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--green)] px-5 py-2.5 text-[14px] font-medium text-black transition-colors hover:bg-[var(--green-hover)]"
            >
              Explore vaults <ArrowRight size={14} />
            </Link>
            <Link
              href="/docs"
              className="rounded-[var(--radius-sm)] border border-white/25 px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-white/10"
            >
              Read the rulebook
            </Link>
          </div>
        </div>

        {/* Counters sit on the hairline grid rather than in floating cards, so they read as one
            instrument panel instead of three unrelated boasts. */}
        <dl className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius)] border border-[var(--line-on-black)] bg-[var(--line-on-black)] sm:grid-cols-3">
          <Counter
            label="Capital bonded by agents"
            value={stats ? formatAmount(stats.totalBonded, 6, { maxFractionDigits: 0 }) : '—'}
            unit="tUSDG"
            tone="var(--green-on-black)"
          />
          <Counter
            label="Paid to depositors"
            value={
              stats ? formatAmount(stats.totalSlashedToDepositors, 6, { maxFractionDigits: 0 }) : '—'
            }
            unit="tUSDG"
            tone="var(--loss-on-black)"
          />
          <Counter
            label="Violations blocked"
            value={stats ? String(stats.violationsBlocked) : '—'}
            tone="var(--on-black)"
          />
        </dl>
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
  tone: string;
}) {
  return (
    <div className="bg-[var(--black)] p-6">
      <dt className="font-mono text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--on-black-2)]">
        {label}
      </dt>
      <dd className="mt-3 flex items-baseline gap-2" style={{ color: tone }}>
        <Ticker value={value} className="text-[2.25rem] font-medium leading-none tracking-[-0.03em] tabular-nums" />
        {unit ? <span className="text-[12px] text-[var(--on-black-2)]">{unit}</span> : null}
      </dd>
    </div>
  );
}
