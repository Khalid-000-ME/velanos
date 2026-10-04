import { Suspense } from 'react';
import { StatusBar } from '@/components/StatusBar';

/**
 * Layout for the product pages: the vaults, the evidence feed, the console and the rulebook.
 *
 * These carry the system status strip — chain heights, service liveness, which integrations are test
 * stand-ins — because on a page showing live balances that context is part of reading the numbers.
 * The marketing page does not, and is cleaner for it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Streamed: the strip reaches both chains' RPCs, and a slow testnet must not hold up the page. */}
      <Suspense fallback={<div className="h-[var(--status-h)] border-b border-[var(--line)] bg-[var(--bg-subtle)]" />}>
        <StatusBar />
      </Suspense>
      <div className="pb-24">{children}</div>
    </>
  );
}
