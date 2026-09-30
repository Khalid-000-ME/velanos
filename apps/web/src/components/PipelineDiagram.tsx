import { cn } from '@aegis/ui';

/**
 * The protocol in one picture: a signed intent meets the mandate, and the path forks.
 *
 * The fork is the product. Every other agent-safety diagram is a straight line ending in "blocked",
 * which is where the value also ends — blocking costs the agent nothing. Here the rejected branch
 * keeps going: the signature survives as evidence and the bond pays. Both branches are drawn at equal
 * weight because that equality *is* the argument.
 *
 * Laid out with flex rather than absolute coordinates. Labels size themselves to their text, and the
 * connectors are flexible fills between them, so nothing drifts when a label wraps, the font loads, or
 * the viewport changes — an earlier coordinate-based version hid a line underneath a wider-than-
 * expected label.
 */
export function PipelineDiagram({ className }: { className?: string }) {
  return (
    <div className={cn('w-full', className)}>
      {/* Desktop: the full fork. */}
      <div className="hidden items-center sm:flex">
        <Pill>Signed intent</Pill>

        <span
          className="h-px min-w-6 flex-1 bg-gradient-to-r from-white/10 to-white/40"
          aria-hidden
        />

        <Pill tone="accent">Mandate check</Pill>

        <Fork />

        <div className="flex shrink-0 flex-col gap-9">
          <Pill tone="pass">Executes</Pill>
          <Pill tone="fail">Evidence &rarr; slash</Pill>
        </div>
      </div>

      {/* Phone: the same sequence stacked, since a horizontal fork at 390px is unreadable. */}
      <div className="flex flex-col items-start gap-3 sm:hidden">
        <Pill>Signed intent</Pill>
        <Rung />
        <Pill tone="accent">Mandate check</Pill>
        <Rung />
        <Pill tone="pass">Executes</Pill>
        <Rung tone="fail" />
        <Pill tone="fail">Evidence &rarr; slash</Pill>
      </div>

      <p className="sr-only">
        A signed intent is checked against the mandate. Compliant intents execute; non-compliant ones
        become evidence that slashes the agent&rsquo;s bond to depositors.
      </p>
    </div>
  );
}

/**
 * The Y-shaped split, stretched to the height of the two output labels.
 *
 * `preserveAspectRatio="none"` is deliberate here: the curve should follow the label column's height
 * whatever that turns out to be, and a 1.25px non-scaling stroke keeps the line weight honest while
 * the geometry distorts.
 */
function Fork() {
  return (
    <svg
      viewBox="0 0 64 100"
      preserveAspectRatio="none"
      className="h-[86px] w-10 shrink-0 sm:w-14"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="fork-pass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--green)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--green)" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="fork-fail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--loss)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--loss)" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <path
        d="M0 50 C 30 50, 34 16, 64 16"
        stroke="url(#fork-pass)"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0 50 C 30 50, 34 84, 64 84"
        stroke="url(#fork-fail)"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Rung({ tone }: { tone?: 'fail' }) {
  return (
    <span
      className="ml-5 h-5 w-px"
      style={{
        background: tone === 'fail' ? 'var(--loss)' : 'var(--green)',
        opacity: 0.6,
      }}
      aria-hidden
    />
  );
}

function Pill({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'accent' | 'pass' | 'fail';
}) {
  const tones = {
    default: 'border-white/20 text-[var(--on-black-2)]',
    accent: 'border-[var(--green)]/50 text-[var(--green-on-black)]',
    pass: 'border-[var(--green)]/50 text-[var(--green-on-black)]',
    fail: 'border-[var(--loss)]/50 text-[var(--loss-on-black)]',
  };
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-[var(--radius-sm)] border bg-[var(--black)] px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] sm:text-[11px]',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
