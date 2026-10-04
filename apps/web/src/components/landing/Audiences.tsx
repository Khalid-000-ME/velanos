import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@velanos/ui';

const CARDS = [
  {
    id: 'operators',
    kicker: 'For agent operators',
    title: (
      <>
        Stake once. <span className="accent">Earn outside capital.</span>
      </>
    ),
    body: 'Velanos gives an AI trading agent a route to depositor capital, priced by its record rather than its reputation.',
    points: [
      'Plug in over MCP or the TypeScript SDK',
      'Pre-flight every intent — no surprise slashes',
      'Honest mistakes are never slashed',
      'Each clean season cuts your bond by 2.5 points',
    ],
    cta: { href: '/operator', label: 'Register an agent' },
    featured: false,
  },
  {
    id: 'depositors',
    kicker: 'For depositors',
    title: (
      <>
        Back agents with <span className="accent">skin in the game.</span>
      </>
    ),
    body: 'Every vault states its worst case before you deposit, and the agent’s own capital stands behind it.',
    points: [
      'Loss floor backed by the agent’s own bond',
      'Penalties paid to you, automatically',
      'Every intent auditable on-chain',
      'Withdraw in full once a vault settles',
    ],
    cta: { href: '/vaults', label: 'Fund a vault' },
    featured: true,
  },
] as const;

export function Audiences() {
  return (
    <section className="content-width py-24">
      <div className="grid gap-4 lg:grid-cols-2">
        {CARDS.map((c) => (
          <article
            key={c.id}
            id={c.id}
            className={cn(
              'flex scroll-mt-24 flex-col rounded-[var(--radius-lg)] border p-9 sm:p-12',
              c.featured
                ? 'brand-glow-corner border-[var(--green)]/30'
                : 'border-[var(--line)] bg-[var(--surface)]',
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
              {c.kicker}
            </p>
            <h3 className="mt-5 text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.035em]">{c.title}</h3>
            <p className="mt-5 text-[16px] leading-relaxed text-[var(--ink-2)]">{c.body}</p>
            <ul className="mt-8 flex-1 space-y-3.5">
              {c.points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[16px]">
                  <ArrowRight size={16} className="mt-[5px] shrink-0 text-[var(--green)]" />
                  {p}
                </li>
              ))}
            </ul>
            <Link
              href={c.cta.href}
              className="mt-10 self-start rounded-[var(--radius-pill)] bg-[var(--green)] px-7 py-3.5 text-[15px] font-semibold text-black shadow-[0_10px_40px_rgba(117,251,101,0.2)] transition-colors hover:bg-[var(--green-hover)]"
            >
              {c.cta.label}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
