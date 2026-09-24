'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { formatAmount } from '@aegis/ui';

/**
 * Where the slashed bond actually went.
 *
 * The split is the product's fairness claim made visual: the overwhelming share goes to the people
 * who were put at risk, and the reporter's cut is visibly a cut rather than the main event. Stating
 * "90/10" in copy invites the reader to wonder; showing the bar settles it.
 */
export function MoneyFlow({
  toDepositors,
  toReporter,
  decimals,
  symbol,
}: {
  toDepositors: string;
  toReporter: string;
  decimals: number;
  symbol: string;
}) {
  const reduced = useReducedMotion();
  const dep = BigInt(toDepositors);
  const rep = BigInt(toReporter);
  const total = dep + rep;

  if (total === 0n) return null;

  const depPct = Number((dep * 10_000n) / total) / 100;
  const repPct = 100 - depPct;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--on-black-2)]">
          Where the bond went
        </h3>
        <span className="font-mono text-sm font-semibold text-white">
          {formatAmount(total.toString(), decimals, { maxFractionDigits: 2, symbol })}
        </span>
      </div>

      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/15">
        <motion.div
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${depPct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
          style={{ background: 'var(--green)' }}
        />
        <motion.div
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${repPct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.5 }}
          style={{ background: 'var(--warn)' }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-4 text-xs">
        <Leg
          color="var(--green)"
          label="To depositors"
          value={formatAmount(toDepositors, decimals, { maxFractionDigits: 2, symbol })}
          pct={depPct}
        />
        <Leg
          color="var(--warn)"
          label="To the reporter"
          value={formatAmount(toReporter, decimals, { maxFractionDigits: 2, symbol })}
          pct={repPct}
        />
      </dl>
    </div>
  );
}

function Leg({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: string;
  pct: number;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[var(--on-black-2)]">
        <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm font-semibold text-white">
        {value} <span className="text-[var(--on-black-2)]">({pct.toFixed(0)}%)</span>
      </dd>
    </div>
  );
}
