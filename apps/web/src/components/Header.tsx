'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@aegis/ui';
import { Shield } from './Shield';
import { ConnectButton } from './ConnectButton';

const NAV = [
  { href: '/', label: 'Discover' },
  { href: '/watch', label: 'Watch' },
  { href: '/operator', label: 'Operator' },
  { href: '/docs', label: 'Docs' },
] as const;

/** Black bar, white wordmark, green active underline. The only persistent dark surface. */
export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-[var(--black)] text-[var(--on-black)]">
      <div className="content-width flex h-[var(--header-h)] items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
            <Shield size={22} />
            Aegis
          </Link>

          <nav className="hidden items-center gap-6 sm:flex">
            {NAV.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative py-5 text-sm transition-colors',
                    active
                      ? 'font-medium text-white after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--green)]'
                      : 'text-[var(--on-black-2)] hover:text-white',
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
