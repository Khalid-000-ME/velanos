'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@velanos/ui';
import { ConnectButton } from './ConnectButton';
import { Wordmark } from './Wordmark';

const NAV = [
  { href: '/', label: 'Vaults' },
  { href: '/watch', label: 'Evidence' },
  { href: '/operator', label: 'Console' },
  { href: '/docs', label: 'Protocol' },
] as const;

/**
 * Light header with a hairline rule.
 *
 * The earlier version used a black bar, which fought every dark section further down the page for
 * attention. Keeping the chrome quiet lets the dark bands mean something when they arrive.
 */
export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--bg)]/85 backdrop-blur-md">
      <div className="content-width flex h-[var(--header-h)] items-center justify-between gap-6">
        <div className="flex items-center gap-10">
          <Link href="/" aria-label="Velanos home">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-[var(--radius-sm)] px-3 py-1.5 text-[14px] transition-colors',
                    active
                      ? 'bg-[var(--bg-muted)] font-medium text-[var(--ink)]'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink)]',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <ConnectButton />
      </div>
    </header>
  );
}
