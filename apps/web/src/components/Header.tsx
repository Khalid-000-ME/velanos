'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@velanos/ui';
import { ConnectButton } from './ConnectButton';
import { Wordmark } from './Wordmark';

const MARKETING_NAV = [
  { href: '/#how', label: 'How it works' },
  { href: '/#depositors', label: 'For depositors' },
  { href: '/#operators', label: 'For agent operators' },
  { href: '/docs', label: 'Rulebook' },
] as const;

const APP_NAV = [
  { href: '/vaults', label: 'Vaults' },
  { href: '/watch', label: 'Evidence' },
  { href: '/operator', label: 'Console' },
  { href: '/docs', label: 'Rulebook' },
] as const;

/**
 * One header, two jobs.
 *
 * On the landing page it is a marketing bar — section links and a single "Open app" action. Inside
 * the product it becomes navigation plus the wallet. Showing a wallet button on a page whose only job
 * is to explain the idea would ask for a commitment before the visitor knows what it is for.
 */
export function Header() {
  const pathname = usePathname();
  const marketing = pathname === '/';
  const nav = marketing ? MARKETING_NAV : APP_NAV;

  return (
    <>
      {marketing ? <Announcement /> : null}
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--bg)]/80 backdrop-blur-xl">
        <div className="content-width flex h-[var(--header-h)] items-center justify-between gap-6">
          <Link href="/" aria-label="Velanos home" className="shrink-0">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active = !marketing && pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href as never}
                  className={cn(
                    'rounded-[var(--radius-pill)] px-3.5 py-2 text-[14px] transition-colors',
                    active
                      ? 'bg-[var(--surface-2)] font-medium text-[var(--ink)]'
                      : 'text-[var(--ink-2)] hover:text-[var(--ink)]',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {marketing ? (
            <Link
              href="/vaults"
              className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--green)] px-5 py-2.5 text-[14px] font-semibold text-black transition-colors hover:bg-[var(--green-hover)]"
            >
              Open app
            </Link>
          ) : (
            <ConnectButton />
          )}
        </div>
      </header>
    </>
  );
}

/**
 * The one-line announcement above the landing header.
 *
 * Points at the most persuasive thing in the product — a replay of an agent paying for a trade it
 * never made — rather than at a feature list.
 */
function Announcement() {
  return (
    <div className="bg-[var(--green)] text-black">
      <div className="content-width flex min-h-10 items-center justify-center gap-2 py-2 text-center text-[13px] font-medium">
        <span>A prompt-injected agent paid depositors for a trade it never made.</span>
        <Link href="/vaults#incidents" className="font-semibold underline underline-offset-2">
          Watch the replay &rarr;
        </Link>
      </div>
    </div>
  );
}
