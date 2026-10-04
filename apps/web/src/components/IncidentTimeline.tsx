'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import {
  Ban,
  CircleDollarSign,
  ExternalLink,
  FileSignature,
  Gavel,
  Megaphone,
  Newspaper,
  RefreshCw,
  Shuffle,
  TrendingDown,
  Users,
} from 'lucide-react';
import { Button, formatTime } from '@velanos/ui';
import type { IncidentStep } from '@/lib/api';

const STEP_ICONS: Record<string, typeof Ban> = {
  LLM_INPUT: Newspaper,
  PROPOSAL: Megaphone,
  INTENT_SIGNED: FileSignature,
  GUARD_VERDICT: Ban,
  REPORTED: Users,
  SLASHED: Gavel,
  LP_CREDITED: CircleDollarSign,
  DRAWDOWN_COMPENSATED: CircleDollarSign,
  STATE_CHANGED: Shuffle,
  UNWOUND: Shuffle,
  MARKET_SHOCK: TrendingDown,
};

/**
 * The replay: what happened, in order, with the transactions behind it.
 *
 * Auto-plays on load because the sequence *is* the argument — a poisoned headline, the agent's own
 * words, its signature, the verdict, the payout — and a reader who has to click to discover that
 * ordering has already missed the point. A replay button is there for the second viewing.
 *
 * Steps animate in sequence rather than all at once, so the causal chain reads as a chain. With
 * reduced motion the whole thing renders immediately; the ordering is in the markup, not the
 * animation.
 */
export function IncidentTimeline({ steps }: { steps: IncidentStep[] }) {
  const [run, setRun] = useState(0);
  const reduced = useReducedMotion();

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">What happened</h2>
        <Button variant="tertiary" onClick={() => setRun((v) => v + 1)} className="px-0 text-xs">
          <RefreshCw size={13} /> Replay
        </Button>
      </div>

      <ol key={run} className="relative space-y-0">
        {/* The spine, drawn behind the markers. */}
        <span
          className="absolute left-[15px] top-2 bottom-2 w-px bg-[var(--line)]"
          aria-hidden
        />

        {steps.map((step, i) => {
          const Icon = STEP_ICONS[step.type] ?? Shuffle;
          const emphasis = step.type === 'SLASHED' || step.type === 'DRAWDOWN_COMPENSATED';
          const blocked = step.type === 'GUARD_VERDICT';

          return (
            <motion.li
              key={`${step.ts}-${i}-${step.type}`}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : i * 0.35, duration: 0.3, ease: 'easeOut' }}
              className="relative flex gap-4 pb-6 last:pb-0"
            >
              <span
                className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border"
                style={{
                  background: emphasis ? 'var(--loss)' : blocked ? 'var(--black)' : 'white',
                  borderColor: emphasis ? 'var(--loss)' : blocked ? 'var(--black)' : 'var(--line-strong)',
                  color: emphasis || blocked ? 'white' : 'var(--ink-2)',
                }}
              >
                <Icon size={15} strokeWidth={1.75} />
              </span>

              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <p className="text-[14px] font-medium leading-snug">{step.label}</p>
                  <span className="font-mono text-[11px] text-[var(--ink-3)]">
                    {formatTime(step.ts)}
                  </span>
                </div>

                <StepDetail step={step} />

                {step.txUrl ? (
                  <a
                    href={step.txUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)]"
                  >
                    view transaction <ExternalLink size={10} />
                  </a>
                ) : null}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

/** Quotes the agent's own words, and the headline it was reacting to, where they exist. */
function StepDetail({ step }: { step: IncidentStep }) {
  const data = step.data ?? {};

  if (step.type === 'LLM_INPUT' && typeof data.excerpt === 'string') {
    return (
      <blockquote className="mt-2 rounded-[var(--radius-sm)] border-l-2 border-[var(--loss)] bg-[var(--loss-tint)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--ink-2)]">
        {data.excerpt.split('\n').slice(0, 5).join('\n')}
      </blockquote>
    );
  }

  if (step.type === 'PROPOSAL' && typeof data.rationale === 'string') {
    return (
      <div className="mt-2">
        <blockquote className="rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] px-3 py-2 text-[12px] italic leading-relaxed text-[var(--ink-2)]">
          &ldquo;{data.rationale}&rdquo;
        </blockquote>
        {typeof data.model === 'string' ? (
          <p className="mt-1 font-mono text-[10px] text-[var(--ink-3)]">
            {data.model}
            {typeof data.profile === 'string' ? ` · profile ${data.profile}` : ''}
          </p>
        ) : null}
      </div>
    );
  }

  if (step.type === 'INTENT_SIGNED' && typeof data.signature === 'string') {
    return (
      <p className="mt-1.5 break-all font-mono text-[10px] text-[var(--ink-3)]">
        nonce {String(data.nonce)} · sig {data.signature.slice(0, 34)}…
      </p>
    );
  }

  return null;
}
