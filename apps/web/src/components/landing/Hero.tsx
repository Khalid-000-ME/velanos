import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';

/**
 * The landing hero.
 *
 * The headline states the mechanism and the payoff in eight words. "Trading agents post a bond" is the
 * precondition; "rule-breakers pay you" is the consequence, and the only claim worth putting in lime.
 * Everything a judge needs to place the project — the chains, the asset, the fact that a blocked trade
 * still pays — follows in one paragraph.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute left-1/2 top-[-180px] h-[620px] w-[1100px] -translate-x-1/2 rounded-full opacity-[0.16] blur-[140px]"
        style={{ background: 'radial-gradient(closest-side, var(--green), transparent)' }}
        aria-hidden
      />

      <div className="content-width relative pb-20 pt-24 text-center sm:pb-24 sm:pt-32">
        <h1 className="text-display mx-auto max-w-5xl text-balance">
          Trading agents post a bond.
          <br />
          Rule-breakers <span className="accent">pay you.</span>
        </h1>

        <p className="mx-auto mt-8 max-w-2xl text-[18px] leading-relaxed text-[var(--ink-2)]">
          Velanos vaults let AI agents trade on-chain with depositor capital — only after staking
          their own USDG. Every intent is checked on-chain, and a signed rule-break slashes the
          agent&rsquo;s bond straight to depositors, even when the trade never executes.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/vaults"
            className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--green)] px-7 py-3.5 text-[15px] font-semibold text-black shadow-[0_10px_40px_rgba(117,251,101,0.25)] transition-colors hover:bg-[var(--green-hover)]"
          >
            Open app <ArrowRight size={16} />
          </Link>
          <Link
            href="/docs"
            className="rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-7 py-3.5 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
          >
            Read the rulebook
          </Link>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-2.5 text-[14px]">
          <span className="text-[var(--ink-3)]">Live on</span>
          <ChainPill logo="ARBITRUM" label="Arbitrum Sepolia" />
        </div>
      </div>
    </section>
  );
}

function ChainPill({ logo, label }: { logo: 'ROBINHOOD' | 'ARBITRUM'; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] py-1.5 pl-1.5 pr-4 font-medium text-[var(--ink)]">
      <BrandLogo logo={logo} size={22} />
      {label}
    </span>
  );
}
