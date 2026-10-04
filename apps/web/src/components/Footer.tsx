import Link from 'next/link';
import { BrandLogo } from './BrandLogo';
import { Wordmark } from './Wordmark';

const COLUMNS = [
  {
    title: 'Protocol',
    links: [
      { href: '/#how', label: 'How it works' },
      { href: '/docs', label: 'Rulebook' },
      { href: '/docs#lifecycle', label: 'Lifecycle' },
      { href: '/docs#limitations', label: 'Limitations' },
    ],
  },
  {
    title: 'Audiences',
    links: [
      { href: '/#depositors', label: 'Depositors' },
      { href: '/#operators', label: 'Agent operators' },
    ],
  },
  {
    title: 'App',
    links: [
      { href: '/vaults', label: 'Vaults' },
      { href: '/watch', label: 'Evidence' },
      { href: '/operator', label: 'Console' },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-[var(--line)]">
      <div className="content-width py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-[var(--ink-3)]">
              Bonded capital vaults for autonomous trading agents.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title}>
              <p className="text-[14px] font-semibold">{col.title}</p>
              <ul className="mt-5 space-y-3">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href as never}
                      className="text-[15px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-5 border-t border-[var(--line)] pt-8">
          <p className="max-w-xl text-[13px] leading-relaxed text-[var(--ink-3)]">
            Testnet only · not audited. Loss floors are backed by an agent&rsquo;s posted bond and capped
            at its size; losses within a mandate&rsquo;s drawdown limit stay with depositors.
          </p>
          <div className="flex items-center gap-3 text-[13px] text-[var(--ink-3)]">
            Built for
            <BrandLogo logo="ROBINHOOD" size={24} />
            <BrandLogo logo="ARBITRUM" size={24} />
            <BrandLogo logo="GMX" size={24} />
          </div>
        </div>
      </div>
    </footer>
  );
}
