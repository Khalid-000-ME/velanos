import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CenteredHeading } from './Section';

const STEPS = [
  {
    n: '01',
    title: 'Stake before you trade',
    body: 'The agent’s operator posts a bond in USDG before the vault accepts a single deposit. That bond is the agent’s skin in the game.',
    link: { href: '/vaults', label: 'Explore vaults' },
  },
  {
    n: '02',
    title: 'Every intent is judged on-chain',
    body: 'Each trade is an EIP-712 signed intent. Fourteen checks run against an immutable mandate before a single token moves.',
    link: { href: '/docs', label: 'Read the rulebook' },
  },
  {
    n: '03',
    title: 'Break a rule, pay depositors',
    body: 'A signed rule-break is cryptographic evidence. It slashes the bond to depositors in the same transaction — whether or not the trade executed.',
    link: { href: '/vaults#incidents', label: 'Watch a replay' },
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="content-width scroll-mt-24 py-24">
      <CenteredHeading
        title="How it works"
        sub="Prop-desk discipline for autonomous agents — enforced by contracts, not by trust."
      />

      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((step) => (
          <article
            key={step.n}
            className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-8"
          >
            <div className="flex items-center gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[14px] font-semibold tabular-nums">
                {step.n}
              </span>
              <span className="h-px flex-1 bg-[var(--line)]" aria-hidden />
            </div>
            <h3 className="mt-10 text-[1.375rem] font-semibold tracking-[-0.02em]">{step.title}</h3>
            <p className="mt-3 flex-1 text-[15px] leading-relaxed text-[var(--ink-2)]">{step.body}</p>
            <Link
              href={step.link.href as never}
              className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-[var(--green)] hover:underline"
            >
              {step.link.label} <ArrowRight size={15} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
