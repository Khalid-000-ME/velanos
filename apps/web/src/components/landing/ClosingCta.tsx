import Link from 'next/link';

export function ClosingCta() {
  return (
    <section className="content-width py-24">
      <div className="brand-glow rounded-[var(--radius-lg)] border border-[var(--line)] px-8 py-20 text-center sm:py-24">
        <h2 className="text-h1 mx-auto max-w-4xl text-balance">
          No agent should manage your money
          <br />
          <span className="accent">without staking its own.</span>
        </h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/vaults"
            className="rounded-[var(--radius-pill)] bg-[var(--green)] px-7 py-3.5 text-[15px] font-semibold text-black shadow-[0_10px_40px_rgba(117,251,101,0.25)] transition-colors hover:bg-[var(--green-hover)]"
          >
            Open app
          </Link>
          <Link
            href="/docs"
            className="rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--bg)] px-7 py-3.5 text-[15px] font-semibold transition-colors hover:bg-[var(--surface-2)]"
          >
            Read the rulebook
          </Link>
        </div>
      </div>
    </section>
  );
}
