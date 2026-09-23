import type { ReactNode } from 'react';
import { cn } from '../cn';

/* ────────────────────────────────── Card ────────────────────────────────── */

export function Card({
  children,
  className,
  accent,
  dark,
}: {
  children: ReactNode;
  className?: string;
  /** 4px green left rule, for the one metric on a screen that matters most. */
  accent?: boolean;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius)] shadow-[var(--shadow-card)]',
        dark ? 'bg-[var(--black)] text-[var(--on-black)]' : 'border border-[var(--line)] bg-white',
        accent && 'border-l-4 border-l-[var(--green)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ───────────────────────────────── Metric ───────────────────────────────── */

/**
 * One figure with its label, and optionally what it is measured against.
 *
 * `sub` exists because almost no number in this product means anything alone: NAV matters relative
 * to a floor, a bond relative to a shortfall. A metric without its comparison is a metric a judge
 * has to do arithmetic on.
 */
export function Metric({
  label,
  value,
  sub,
  tone = 'neutral',
  size = 'md',
  mono = true,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warn';
  size?: 'sm' | 'md' | 'lg';
  mono?: boolean;
}) {
  const toneClass = {
    neutral: 'text-[var(--ink)]',
    positive: 'text-[var(--green-ink)]',
    negative: 'text-[var(--loss)]',
    warn: 'text-[var(--ink)]',
  }[tone];

  const sizeClass = { sm: 'text-xl', md: 'text-3xl', lg: 'text-5xl' }[size];

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
        {label}
      </span>
      <span
        className={cn(
          'font-semibold leading-none tracking-[-0.02em]',
          sizeClass,
          toneClass,
          mono && 'font-mono',
        )}
      >
        {value}
      </span>
      {sub ? <span className="text-xs text-[var(--ink-3)]">{sub}</span> : null}
    </div>
  );
}

/* ─────────────────────────────── State chip ─────────────────────────────── */

export type VaultStateName =
  | 'PENDING_BOND'
  | 'ACTIVE'
  | 'WARNED'
  | 'FROZEN'
  | 'UNWINDING'
  | 'EXPIRED'
  | 'SETTLED';

const STATE_STYLES: Record<VaultStateName, string> = {
  ACTIVE: 'bg-[var(--green-tint)] text-[var(--green-ink)]',
  WARNED: 'bg-[var(--warn-tint)] text-[var(--ink)]',
  FROZEN: 'bg-[var(--black)] text-white',
  UNWINDING: 'bg-[var(--black-2)] text-white',
  SETTLED: 'bg-[var(--bg-muted)] text-[var(--ink-2)]',
  PENDING_BOND: 'bg-[var(--bg-muted)] text-[var(--ink-3)]',
  EXPIRED: 'bg-[var(--bg-muted)] text-[var(--ink-2)]',
};

export const VAULT_STATE_NAMES: VaultStateName[] = [
  'PENDING_BOND',
  'ACTIVE',
  'WARNED',
  'FROZEN',
  'UNWINDING',
  'EXPIRED',
  'SETTLED',
];

export function Chip({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'warn' | 'dark';
}) {
  const tones = {
    neutral: 'bg-[var(--bg-muted)] text-[var(--ink-2)]',
    positive: 'bg-[var(--green-tint)] text-[var(--green-ink)]',
    negative: 'bg-[var(--loss-tint)] text-[var(--loss)]',
    warn: 'bg-[var(--warn-tint)] text-[var(--ink)]',
    dark: 'bg-[var(--black)] text-white',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StateChip({ state }: { state: number | VaultStateName }) {
  const name = typeof state === 'number' ? (VAULT_STATE_NAMES[state] ?? 'PENDING_BOND') : state;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]',
        STATE_STYLES[name],
      )}
    >
      {name.replace('_', ' ')}
    </span>
  );
}

/* ─────────────────────────── TEST CONTROL badge ─────────────────────────── */

/**
 * Marks anything that moves state we chose rather than state the world produced.
 *
 * Required by the build spec on every demo control, and load-bearing for credibility: a judge who
 * cannot tell a staged −20% shock from a real one has no reason to believe the NAV number next to
 * it either.
 */
export function TestControlBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--black)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-[var(--green)]" aria-hidden />
      Test control
    </span>
  );
}

/* ────────────────────────────── Rule pill ──────────────────────────────── */

export function RulePill({
  ruleId,
  title,
  slashable,
}: {
  ruleId: number;
  title: string;
  slashable: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-medium',
        slashable
          ? 'bg-[var(--loss-tint)] text-[var(--loss)]'
          : 'bg-[var(--warn-tint)] text-[var(--ink-2)]',
      )}
    >
      <span className="font-mono font-bold">{ruleId}</span>
      {title}
    </span>
  );
}

/* ──────────────────────────────── Buttons ──────────────────────────────── */

export function Button({
  children,
  variant = 'primary',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost-dark';
}) {
  const variants = {
    // Black text on #00C805 at 16px semibold clears AA for large text; white would not.
    primary:
      'bg-[var(--green)] text-black hover:bg-[var(--green-hover)] active:bg-[var(--green-press)] font-semibold',
    secondary: 'bg-[var(--black)] text-white hover:bg-[var(--black-2)] font-semibold',
    tertiary:
      'bg-transparent text-[var(--ink)] hover:underline decoration-[var(--green)] decoration-2 underline-offset-4 font-medium',
    danger: 'bg-[var(--loss)] text-white hover:brightness-110 font-semibold',
    'ghost-dark':
      'bg-transparent text-white border border-white/40 hover:bg-white/10 font-semibold',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] px-5 py-2.5 text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────── Progress ──────────────────────────────── */

/**
 * Exposure against its cap.
 *
 * Turns amber past 80% of the cap and red-orange at it, so an agent walking up to a limit is
 * visible before it trips rather than only after.
 */
export function ExposureBar({ bps, capBps }: { bps: number; capBps: number }) {
  const ratio = capBps === 0 ? 0 : Math.min(bps / capBps, 1);
  const tone =
    ratio >= 1 ? 'bg-[var(--loss)]' : ratio >= 0.8 ? 'bg-[var(--warn)]' : 'bg-[var(--green)]';

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]">
        <div
          className={cn('h-full rounded-full transition-all duration-300', tone)}
          style={{ width: `${Math.max(ratio * 100, 2)}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-xs text-[var(--ink-3)]">
        {(bps / 100).toFixed(1)}% / {(capBps / 100).toFixed(0)}%
      </span>
    </div>
  );
}

/* ──────────────────────────────── Layout ───────────────────────────────── */

export function SectionHeading({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">{title}</h2>
        {sub ? <p className="mt-1 text-sm text-[var(--ink-3)]">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[13px]', className)}>{children}</span>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] px-6 py-10 text-center">
      <p className="text-sm font-medium text-[var(--ink-2)]">{title}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--ink-3)]">{hint}</p> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-[var(--radius-sm)] bg-[var(--bg-muted)]', className)} />;
}
