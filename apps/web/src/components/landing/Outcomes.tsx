import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@velanos/ui';
import { CenteredHeading } from './Section';

/**
 * The differentiator, as three cards rather than a diagram.
 *
 * A guardrail project has one ending: blocked. Velanos has three, and the difference between them is
 * the product — misconduct pays depositors even when nothing executed, bad luck costs the agent
 * nothing, and a market crash spends the bond repairing depositors rather than punishing anyone.
 */
const OUTCOMES = [
  {
    tag: 'Misconduct',
    dot: 'var(--loss)',
    title: 'Broke a rule it could have checked',
    body: 'Bought a stock outside its mandate, oversized an order, or kept signing after its term ended.',
    verdict: 'Slashed',
    bond: '−50 · 45 to you',
    bondTone: 'var(--loss)',
    featured: true,
  },
  {
    tag: 'Bad luck',
    dot: 'var(--warn)',
    title: 'Hit a live limit',
    body: 'Prices moved, and the trade would have breached the exposure cap or the daily-loss budget.',
    verdict: 'Rejected',
    bond: 'Untouched',
    bondTone: 'var(--ink)',
    featured: false,
  },
  {
    tag: 'Market risk',
    dot: 'var(--green)',
    title: 'Fell through the loss floor',
    body: 'No rule broken — the market dropped past what depositors were promised.',
    verdict: 'Breaker trips',
    bond: 'Tops you up',
    bondTone: 'var(--green)',
    featured: false,
  },
] as const;

export function Outcomes() {
  return (
    <section className="content-width py-24">
      <CenteredHeading
        title={
          <>
            A blocked trade <span className="accent">still pays.</span>
          </>
        }
        sub="Guardrails stop at “blocked”. Velanos keeps the agent’s signature as evidence — and judges misconduct, bad luck and market risk differently."
      />

      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
        {OUTCOMES.map((o) => (
          <article
            key={o.tag}
            className={cn(
              'flex flex-col rounded-[var(--radius-lg)] border p-8',
              o.featured
                ? 'brand-glow-corner border-[var(--green)]/35'
                : 'border-[var(--line)] bg-[var(--surface)]',
            )}
          >
            <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
              <span className="size-2 rounded-full" style={{ background: o.dot }} aria-hidden />
              {o.tag}
            </span>
            <h3 className="mt-5 text-[1.5rem] font-semibold leading-tight tracking-[-0.025em]">
              {o.title}
            </h3>
            <p className="mt-3 flex-1 text-[15px] leading-relaxed text-[var(--ink-2)]">{o.body}</p>

            <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-[var(--line)] pt-6">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
                  Verdict
                </dt>
                <dd className="mt-1.5 text-[17px] font-semibold">{o.verdict}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
                  Bond
                </dt>
                <dd className="mt-1.5 text-[17px] font-semibold" style={{ color: o.bondTone }}>
                  {o.bond}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <p className="mt-8 text-center text-[13px] text-[var(--ink-3)]">
        Figures from the demo mandate: 300 tUSDG bond, 50 per violation, 10% reporter bounty, 8% loss
        floor.{' '}
        <Link href="/docs#lifecycle" className="inline-flex items-center gap-1 text-[var(--ink-2)] hover:text-[var(--ink)]">
          See the full lifecycle <ArrowRight size={12} />
        </Link>
      </p>
    </section>
  );
}
