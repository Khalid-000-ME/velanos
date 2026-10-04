import { Fragment } from 'react';
import { cn } from '@velanos/ui';

/**
 * One intent, followed from the bond to every possible ending.
 *
 * The diagram exists to answer the question a judge brings to every agent-safety project: "so it's
 * guardrails?" Guardrails end at "blocked". This shows where they end — the dashed marker on the
 * third lane — and then keeps going, because the blocked branch is where Velanos does its actual work:
 * the signature on a forbidden intent becomes evidence, and the evidence moves the agent's own money
 * to the people it put at risk.
 *
 * It also shows the two cases a naive slashing design gets wrong. An honest agent that trips a live
 * limit is rejected without penalty (lane two), and an honest agent caught by the market is not
 * punished at all — its bond is spent repairing depositors instead (lane four).
 *
 * Built with flex rather than SVG coordinates so nodes size to their text and connectors fill the
 * gaps; on narrow screens the same markup turns vertical.
 */

type Tone = 'neutral' | 'pass' | 'warn' | 'slash' | 'repair';

const TONE = {
  neutral: { border: 'rgba(255,255,255,0.16)', text: 'var(--on-black)', line: 'rgba(255,255,255,0.25)' },
  pass: { border: 'rgba(0,200,5,0.45)', text: 'var(--green-on-black)', line: 'rgba(0,200,5,0.55)' },
  warn: { border: 'rgba(245,180,0,0.45)', text: '#f5b400', line: 'rgba(245,180,0,0.5)' },
  slash: { border: 'rgba(255,77,0,0.5)', text: 'var(--loss-on-black)', line: 'rgba(255,77,0,0.6)' },
  repair: { border: 'rgba(0,200,5,0.45)', text: 'var(--green-on-black)', line: 'rgba(0,200,5,0.5)' },
} satisfies Record<Tone, { border: string; text: string; line: string }>;

interface Step {
  title: string;
  detail: string;
  tone?: Tone;
}

interface LaneSpec {
  code: string;
  title: string;
  example: string;
  tone: Tone;
  steps: Step[];
  /** Insert the "guardrails stop here" marker after this step index. */
  guardrailAfter?: number;
  outcome: { label: string; value: string };
  /** One line of mechanism under the flow — detail that would otherwise widen the lane. */
  note: string;
}

const SETUP: Array<{ n: string; title: string; detail: string }> = [
  {
    n: '01',
    title: 'Bond posted',
    detail: 'The operator stakes the agent’s own capital. The vault will not accept deposits until it does.',
  },
  {
    n: '02',
    title: 'Agent proposes',
    detail: 'An LLM reads prices, news and the mandate, then suggests one trade and explains why. It never signs.',
  },
  {
    n: '03',
    title: 'Code signs',
    detail: 'Deterministic code converts to raw units, signs an EIP-712 intent and commits a hash of the reasoning.',
  },
  {
    n: '04',
    title: 'Rulebook runs',
    detail: '14 checks in a fixed order, on-chain. It always returns a verdict — it never just reverts.',
  },
];

const LANES: LaneSpec[] = [
  {
    code: 'PASS',
    title: 'Inside every rule',
    example: 'e.g. buy 20 USDG of an allowed asset',
    tone: 'pass',
    steps: [
      { title: 'Exact approval', detail: 'only to an allowlisted venue' },
      { title: 'Trade fills', detail: 'NAV and positions update' },
      { title: 'Approval reset', detail: 'back to zero, same tx' },
    ],
    outcome: { label: 'Bond', value: 'Untouched' },
    note: 'The vault never makes an arbitrary call — only typed calls to venues named in its mandate, for the exact amount.',
  },
  {
    code: '2xx',
    title: 'Trips a live limit',
    example: 'e.g. would breach the 40% per-asset cap',
    tone: 'warn',
    steps: [
      { title: 'Blocked', detail: 'nothing executes' },
      { title: 'Strike recorded', detail: 'not misconduct — state moved' },
      { title: 'Three strikes', detail: 'cool-off that clears itself' },
    ],
    outcome: { label: 'Bond', value: 'Untouched' },
    note: 'The agent could not have known the price would move. Bad luck is not misconduct, so it is never slashed.',
  },
  {
    code: '1xx',
    title: 'Breaks a rule it could have checked',
    example: 'e.g. buys an asset its mandate forbids',
    tone: 'slash',
    guardrailAfter: 0,
    steps: [
      { title: 'Blocked', detail: 'nothing executes', tone: 'neutral' },
      { title: 'Signature kept', detail: 'published as public evidence', tone: 'slash' },
      { title: 'Anyone reports', detail: 'court re-checks on-chain', tone: 'slash' },
      { title: 'Bond slashed', detail: '90% depositors · 10% reporter', tone: 'slash' },
    ],
    outcome: { label: 'Bond', value: 'Pays depositors' },
    note: 'The agent could have checked this rule before signing, so signing is the offence. A second breach freezes the vault and unwinds it to cash.',
  },
];

const MARKET_LANE: LaneSpec = {
  code: 'NO RULE BROKEN',
  title: 'The market falls through the promised floor',
  example: 'e.g. a 20% shock to a fully compliant book',
  tone: 'repair',
  steps: [
    { title: 'Floor crossed', detail: 'NAV/share below high-water − 8%', tone: 'warn' },
    { title: 'Breaker trips', detail: 'anyone can call it', tone: 'warn' },
    { title: 'Unwound', detail: 'everything sold back to cash', tone: 'neutral' },
    { title: 'Gap paid', detail: 'bond lifts NAV/share to the floor', tone: 'repair' },
  ],
  outcome: { label: 'Bond', value: 'Repairs depositors' },
  note: 'Paid against realised cash after the unwind, not a paper loss — the test suite checks NAV per share lands exactly on the floor.',
};

export function LifecycleDiagram() {
  return (
    <div className="space-y-10">
      <SetupRail />

      <div>
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--on-black-2)]">
          The rulebook returns one of three verdicts
        </p>
        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line-on-black)]">
          {LANES.map((lane, i) => (
            <Lane key={lane.code} lane={lane} first={i === 0} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--on-black-2)]">
          Separately — an honest agent caught by the market
        </p>
        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line-on-black)]">
          <Lane lane={MARKET_LANE} first />
        </div>
      </div>

      <p className="max-w-3xl text-[13px] leading-relaxed text-[var(--on-black-2)]">
        Every step after signing is permissionless: the relay, the watcher bot or any wallet can submit,
        report, trip the breaker, unwind and settle. There is no admin key that can freeze funds,
        forgive a slash or move depositor money. Penalty size, bounty share and the floor are set per
        vault in its mandate; the split shown is the demo mandate&rsquo;s.
      </p>
    </div>
  );
}

/* ─────────────────────────────── setup rail ─────────────────────────────── */

function SetupRail() {
  return (
    <ol className="grid grid-cols-1 gap-3 md:grid-cols-4 md:gap-0">
      {SETUP.map((step, i) => (
        <li key={step.n} className="relative flex md:block">
          <div className="relative z-10 flex-1 rounded-[var(--radius)] border border-[var(--line-on-black)] bg-[var(--black)] p-5 md:mr-6">
            <span className="font-mono text-[11px] tabular-nums text-[var(--green-on-black)]">
              {step.n}
            </span>
            <h3 className="mt-3 text-[15px] font-medium tracking-[-0.01em] text-[var(--on-black)]">
              {step.title}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--on-black-2)]">{step.detail}</p>
          </div>
          {i < SETUP.length - 1 ? (
            <span
              className="absolute right-0 top-1/2 hidden h-px w-6 -translate-y-1/2 bg-white/25 md:block"
              aria-hidden
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/* ────────────────────────────────── lanes ───────────────────────────────── */

function Lane({ lane, first }: { lane: LaneSpec; first?: boolean }) {
  const tone = TONE[lane.tone];

  return (
    <div className={cn('bg-[var(--black)] p-5 sm:p-6', !first && 'border-t border-[var(--line-on-black)]')}>
      {/* header: verdict, description, outcome */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="rounded-[var(--radius-sm)] border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]"
            style={{ borderColor: tone.border, color: tone.text }}
          >
            {lane.code}
          </span>
          <span className="text-[15px] font-medium tracking-[-0.01em] text-[var(--on-black)]">
            {lane.title}
          </span>
          <span className="font-mono text-[11px] text-[var(--on-black-2)]">{lane.example}</span>
        </div>

        <div className="flex items-baseline gap-2 text-[11px] uppercase tracking-[0.08em]">
          <span className="text-[var(--on-black-2)]">{lane.outcome.label}</span>
          <span style={{ color: tone.text }}>{lane.outcome.value}</span>
        </div>
      </div>

      {/* flow */}
      <div className="mt-5 flex flex-col items-stretch lg:flex-row lg:items-center">
        {lane.steps.map((step, i) => {
          const stepTone = TONE[step.tone ?? lane.tone];
          const showGuardrail = lane.guardrailAfter === i;
          const isLast = i === lane.steps.length - 1;

          return (
            <Fragment key={step.title}>
              <Node step={step} color={stepTone} />
              {showGuardrail ? (
                <>
                  <Connector color="rgba(255,255,255,0.2)" />
                  <GuardrailMarker />
                  <Connector color={TONE.slash.line} />
                </>
              ) : !isLast ? (
                <Connector color={TONE[lane.steps[i + 1]?.tone ?? lane.tone].line} />
              ) : null}
            </Fragment>
          );
        })}
      </div>

      <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-[var(--on-black-2)]">{lane.note}</p>
    </div>
  );
}

function Node({ step, color }: { step: Step; color: { border: string; text: string } }) {
  return (
    <div
      className="shrink-0 rounded-[var(--radius-sm)] border bg-[var(--black-2)] px-3 py-2 lg:w-[176px]"
      style={{ borderColor: color.border }}
    >
      <p className="text-[13px] font-medium leading-tight" style={{ color: color.text }}>
        {step.title}
      </p>
      <p className="mt-1 font-mono text-[10px] leading-snug text-[var(--on-black-2)]">{step.detail}</p>
    </div>
  );
}

/**
 * Fixed length rather than stretching to fill the row.
 *
 * Stretchy connectors spread a three-step lane across the full width, so every lane ended at the same
 * right edge and the layout said nothing. With fixed connectors the lanes are left-aligned and their
 * lengths become the argument: the pass and live-limit lanes stop early, and the misconduct lane —
 * the one that continues past where guardrails stop — runs the whole width.
 */
function Connector({ color }: { color: string }) {
  return (
    <span
      className="ml-5 h-4 w-px shrink-0 lg:ml-0 lg:h-px lg:w-7"
      style={{ background: color }}
      aria-hidden
    />
  );
}

/**
 * The line every guardrail product stops at.
 *
 * Drawn as an interruption in the flow rather than a footnote, because it is the single most important
 * thing on the page: everything to its right is what an "agent guardrail" does not do.
 */
function GuardrailMarker() {
  return (
    <div className="relative flex shrink-0 items-center gap-2 py-1 lg:flex-col lg:gap-1.5 lg:py-0">
      <span
        className="hidden h-5 border-l border-dashed border-white/40 lg:block"
        aria-hidden
      />
      <span className="whitespace-nowrap rounded-[var(--radius-sm)] border border-dashed border-white/40 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-white/70">
        Guardrails stop here
      </span>
      <span
        className="hidden h-5 border-l border-dashed border-white/40 lg:block"
        aria-hidden
      />
    </div>
  );
}
