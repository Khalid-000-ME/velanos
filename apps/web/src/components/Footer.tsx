import Link from 'next/link';
import { Wordmark } from './Wordmark';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--line)] bg-[var(--bg-subtle)]">
      <div className="content-width py-12">
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div className="max-w-sm">
            <Wordmark />
            <p className="mt-4 text-[14px] leading-relaxed text-[var(--ink-3)]">
              No agent should manage other people&rsquo;s money without staking its own.
            </p>
          </div>

          <nav className="flex gap-14">
            <FooterColumn
              title="Product"
              links={[
                { href: '/', label: 'Vaults' },
                { href: '/watch', label: 'Evidence' },
                { href: '/operator', label: 'Console' },
              ]}
            />
            <FooterColumn
              title="Protocol"
              links={[
                { href: '/docs', label: 'Rulebook' },
                { href: '/docs#contracts', label: 'Contracts' },
                { href: '/docs#limitations', label: 'Limitations' },
              ]}
            />
          </nav>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] pt-6">
          <p className="font-mono text-[11px] uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
            Testnet only · not audited
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
            Robinhood Chain · Arbitrum · USDG · GMX
          </p>
        </div>

        {/* Stated in the footer as well as on the fund screen: a loss floor is only worth something
            if its limits travel with it. */}
        <p className="mt-6 max-w-3xl text-[12px] leading-relaxed text-[var(--ink-3)]">
          Loss floors are backed by an agent&rsquo;s posted bond and are capped at its size. Losses
          within a mandate&rsquo;s drawdown limit, and any shortfall beyond the bond, stay with
          depositors.
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
        {title}
      </p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link
              href={l.href as never}
              className="text-[14px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
