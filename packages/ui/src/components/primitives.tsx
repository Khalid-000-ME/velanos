import type { ReactNode } from 'react';
import { cn } from '../cn';

/* ───────────────────────────────── Eyebrow ───────────────────────────────── */

/**
 * The small monospace label that opens a section.
 *
 * Carries an optional index because numbered sections give a long page a spine — a reader landing
 * mid-scroll can tell where they are without a nav. Uppercase and widely tracked so it reads as
 * apparatus rather than as a heading competing with the real one.
 */
export function Eyebrow({
  children,
  index,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  index?: string;
  tone?: 'default' | 'onBlack' | 'green';
  className?: string;
}) {
  const tones = {
    default: 'text-[var(--ink-3)]',
    onBlack: 'text-[var(--on-black-2)]',
    green: 'text-[var(--green-ink)]',
  };
  return (
    <p
      className={cn(
        'flex items-center gap-2 text-[11px] font-medium uppercase tracking-[var(--track-label)]',
        tones[tone],
        className,
      )}
    >
      {index ? (
        <>
          <span className="tabular-nums">{index}</span>
          <span className="h-px w-5 bg-current opacity-40" aria-hidden />
        </>
      ) : null}
      {children}
    </p>
  );
}

/* ────────────────────────────────── Card ─────────────────────────────────── */

export function Card({
  children,
  className,
  accent,
  dark,
  flush,
}: {
  children: ReactNode;
  className?: string;
  /** 2px green left rule, for the one metric on a screen that matters most. */
  accent?: boolean;
  dark?: boolean;
  /** Drops the border, for a card sitting inside an already-divided grid. */
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius)]',
        dark ? 'bg-[var(--black)] text-[var(--on-black)]' : 'bg-[var(--surface)]',
        !flush && (dark ? 'border border-[var(--line-on-black)]' : 'border border-[var(--line)]'),
        accent && 'border-l-2 border-l-[var(--green)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────── Hairline grid ────────────────────────────── */

/**
 * A grid whose cells are separated by single hairlines.
 *
 * Implemented with per-cell top/left borders pulled outside a clipping container, rather than the
 * usual `gap-px` over a tinted background. The `gap-px` trick leaks: when the last row is not full —
 * four vaults in a three-column grid — the background shows through the empty cells as grey blocks
 * that look like broken layout. Here, empty space is simply absent, so a partial row ends cleanly at
 * any breakpoint.
 */
export function HairlineGrid({
  children,
  columns = 3,
  dark = false,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  dark?: boolean;
  className?: string;
}) {
  const cols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--radius)] border',
        dark ? 'border-[var(--line-on-black)] bg-[var(--black)]' : 'border-[var(--line)] bg-[var(--surface)]',
        className,
      )}
    >
      <div className={cn('-ml-px -mt-px grid grid-cols-1', cols)}>{children}</div>
    </div>
  );
}

/** A cell for {@link HairlineGrid}. Draws only its top and left rule; the container clips the rest. */
export function HairlineCell({
  children,
  dark = false,
  accent = false,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  dark?: boolean;
  /** Green inner rule on the left edge, for the one cell that carries the argument. */
  accent?: boolean;
  className?: string;
  as?: 'div' | 'li';
}) {
  return (
    <Tag
      className={cn(
        'border-l border-t',
        dark ? 'border-[var(--line-on-black)]' : 'border-[var(--line)]',
        className,
      )}
      style={accent ? { boxShadow: 'inset 2px 0 0 var(--green)' } : undefined}
    >
      {children}
    </Tag>
  );
}

/* ───────────────────────────────── Metric ────────────────────────────────── */

/**
 * One figure with its label and, almost always, what it is measured against.
 *
 * `sub` is not optional in spirit: almost no number in this product means anything alone. NAV matters
 * relative to a floor, a bond relative to a shortfall. A metric without its comparison is a metric the
 * reader has to do arithmetic on.
 */
export function Metric({
  label,
  value,
  sub,
  tone = 'neutral',
  size = 'md',
  onBlack = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warn';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onBlack?: boolean;
}) {
  const tones = {
    neutral: onBlack ? 'text-[var(--on-black)]' : 'text-[var(--ink)]',
    positive: onBlack ? 'text-[var(--green-on-black)]' : 'text-[var(--green-ink)]',
    negative: onBlack ? 'text-[var(--loss-on-black)]' : 'text-[var(--loss)]',
    warn: onBlack ? 'text-[var(--on-black)]' : 'text-[var(--warn)]',
  };

  const sizes = {
    sm: 'text-[1.375rem]',
    md: 'text-[2rem]',
    lg: 'text-[2.75rem]',
    xl: 'text-[3.5rem]',
  };

  return (
    <div className="flex flex-col gap-2">
      <span
        className={cn(
          'text-[11px] font-medium uppercase tracking-[var(--track-label)]',
          onBlack ? 'text-[var(--on-black-2)]' : 'text-[var(--ink-3)]',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'font-semibold leading-[0.95] tracking-[var(--track-h1)] tabular-nums',
          sizes[size],
          tones[tone],
        )}
      >
        {value}
      </span>
      {sub ? (
        <span className={cn('text-[13px]', onBlack ? 'text-[var(--on-black-2)]' : 'text-[var(--ink-3)]')}>
          {sub}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A row of metrics separated by hairlines rather than gaps.
 *
 * The continuous rule is what makes a set of numbers read as one instrument panel instead of four
 * unrelated cards, which is the difference between a dashboard and a landing page pretending to be one.
 */
export function MetricStrip({
  children,
  columns = 4,
  onBlack = false,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  onBlack?: boolean;
  className?: string;
}) {
  const cols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--radius)] border',
        onBlack ? 'border-[var(--line-on-black)] bg-[var(--black)]' : 'border-[var(--line)] bg-[var(--surface)]',
        className,
      )}
    >
      <div className={cn('-ml-px -mt-px grid grid-cols-1', cols)}>{children}</div>
    </div>
  );
}

/** A cell inside a {@link MetricStrip}. */
export function MetricCell({
  children,
  onBlack = false,
  className,
}: {
  children: ReactNode;
  onBlack?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-l border-t p-5 sm:p-6',
        onBlack ? 'border-[var(--line-on-black)]' : 'border-[var(--line)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────── State chip ──────────────────────────────── */

export type VaultStateName =
  | 'PENDING_BOND'
  | 'ACTIVE'
  | 'WARNED'
  | 'FROZEN'
  | 'UNWINDING'
  | 'EXPIRED'
  | 'SETTLED';

export const VAULT_STATE_NAMES: VaultStateName[] = [
  'PENDING_BOND',
  'ACTIVE',
  'WARNED',
  'FROZEN',
  'UNWINDING',
  'EXPIRED',
  'SETTLED',
];

const STATE_DOT: Record<VaultStateName, string> = {
  ACTIVE: 'var(--green)',
  WARNED: 'var(--warn)',
  FROZEN: 'var(--loss)',
  UNWINDING: 'var(--loss)',
  SETTLED: 'var(--ink-3)',
  PENDING_BOND: 'var(--line-strong)',
  EXPIRED: 'var(--ink-3)',
};

/**
 * Vault state as a dot plus a word.
 *
 * A dot rather than a filled pill: these appear in dense lists next to rule chips and bounty chips,
 * and six saturated pills in a row turn a table into confetti. The colour still does the fast read.
 */
export function StateChip({
  state,
  onBlack = false,
}: {
  state: number | VaultStateName;
  onBlack?: boolean;
}) {
  const name = typeof state === 'number' ? (VAULT_STATE_NAMES[state] ?? 'PENDING_BOND') : state;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
        onBlack
          ? 'border-[var(--line-on-black)] text-[var(--on-black-2)]'
          : 'border-[var(--line)] text-[var(--ink-2)]',
      )}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: STATE_DOT[name] }}
        aria-hidden
      />
      {name.replace('_', ' ')}
    </span>
  );
}

/* ─────────────────────────────────  Chip  ────────────────────────────────── */

export function Chip({
  children,
  className,
  tone = 'neutral',
  onBlack = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'warn' | 'dark';
  onBlack?: boolean;
}) {
  const tones = {
    neutral: onBlack
      ? 'border-[var(--line-on-black)] text-[var(--on-black-2)]'
      : 'border-[var(--line)] text-[var(--ink-2)]',
    positive: 'border-transparent bg-[var(--green-tint)] text-[var(--green-ink)]',
    negative: 'border-transparent bg-[var(--loss-tint)] text-[var(--loss)]',
    warn: 'border-transparent bg-[var(--warn-tint)] text-[var(--warn)]',
    dark: 'border-transparent bg-[var(--ink)] text-[var(--bg)]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ──────────────────────────────── Rule pill ──────────────────────────────── */

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
        'inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px]',
        slashable
          ? 'bg-[var(--loss-tint)] text-[var(--loss)]'
          : 'bg-[var(--warn-tint)] text-[var(--warn)]',
      )}
    >
      <span className="font-mono font-semibold tabular-nums">{ruleId}</span>
      <span className="text-[var(--ink-2)]">{title}</span>
    </span>
  );
}

/* ─────────────────────── TEST CONTROL badge ──────────────────────────────── */

/**
 * Marks anything that moves state we chose rather than state the world produced.
 *
 * Load-bearing for credibility, not decoration: a judge who cannot distinguish a staged −20% shock
 * from a real one has no reason to believe the NAV figure sitting next to it either.
 */
export function TestControlBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink)]',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-[var(--green)]" aria-hidden />
      Test control
    </span>
  );
}

/* ──────────────────────────────── Buttons ────────────────────────────────── */

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'tertiary' | 'danger' | 'onBlack';
  size?: 'sm' | 'md';
}) {
  const variants = {
    // Black text on lime: white would fail contrast on the brand green.
    primary:
      'bg-[var(--green)] text-black hover:bg-[var(--green-hover)] active:bg-[var(--green-press)] shadow-[0_8px_30px_rgba(117,251,101,0.18)]',
    secondary: 'bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line-strong)] hover:bg-[var(--bg-muted)]',
    outline: 'border border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--surface-2)]',
    tertiary:
      'text-[var(--ink)] hover:text-[var(--green-ink)] underline decoration-[var(--line-strong)] hover:decoration-[var(--green)] decoration-1 underline-offset-4',
    danger: 'bg-[var(--loss)] text-white hover:brightness-110',
    onBlack: 'border border-white/25 text-white hover:bg-white/10',
  };
  const sizes = {
    sm: 'px-4 py-2 text-[13px]',
    md: 'px-6 py-3 text-[15px]',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────── Exposure bar ────────────────────────────── */

/**
 * Exposure against its cap.
 *
 * Amber past 80% of the cap and red-orange at it, so an agent walking toward a limit is visible before
 * it trips rather than only in the rejection afterwards.
 */
export function ExposureBar({ bps, capBps }: { bps: number; capBps: number }) {
  const ratio = capBps === 0 ? 0 : Math.min(bps / capBps, 1);
  const tone =
    ratio >= 1 ? 'bg-[var(--loss)]' : ratio >= 0.8 ? 'bg-[var(--warn)]' : 'bg-[var(--green)]';

  return (
    <div className="flex items-center gap-3">
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]">
        <div
          className={cn('h-full rounded-full transition-all duration-500', tone)}
          style={{ width: `${Math.max(ratio * 100, 2)}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
        {(bps / 100).toFixed(1)}/{(capBps / 100).toFixed(0)}%
      </span>
    </div>
  );
}

/* ──────────────────────────────── Sections ───────────────────────────────── */

export function SectionHeading({
  eyebrow,
  index,
  title,
  sub,
  action,
  onBlack = false,
}: {
  eyebrow?: string;
  index?: string;
  title: string;
  sub?: string;
  action?: ReactNode;
  onBlack?: boolean;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow ? (
          <Eyebrow index={index} tone={onBlack ? 'onBlack' : 'default'} className="mb-4">
            {eyebrow}
          </Eyebrow>
        ) : null}
        <h2
          className={cn(
            'text-[length:var(--t-h2)] font-semibold leading-[1.05] tracking-[var(--track-h2)]',
            onBlack ? 'text-[var(--on-black)]' : 'text-[var(--ink)]',
          )}
        >
          {title}
        </h2>
        {sub ? (
          <p
            className={cn(
              'mt-3 text-[15px] leading-relaxed',
              onBlack ? 'text-[var(--on-black-2)]' : 'text-[var(--ink-3)]',
            )}
          >
            {sub}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[13px] tabular-nums', className)}>{children}</span>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] px-6 py-12 text-center">
      <p className="text-[14px] font-medium text-[var(--ink-2)]">{title}</p>
      {hint ? <p className="mt-1.5 text-[13px] text-[var(--ink-3)]">{hint}</p> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-[var(--radius-sm)] bg-[var(--bg-muted)]', className)} />;
}
