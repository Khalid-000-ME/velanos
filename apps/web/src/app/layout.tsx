import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Suspense } from 'react';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Providers } from '@/components/Providers';
import { StatusBar } from '@/components/StatusBar';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
});

/**
 * Mono does real work here — every label, address, hash and figure — so it is loaded at the same
 * priority as the body face rather than treated as a code-block afterthought.
 */
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Aegis — bonded capital for autonomous trading agents',
    template: '%s · Aegis',
  },
  description:
    'Every agent action is checked against an immutable mandate before funds move. Misconduct slashes the agent’s own capital to depositors, automatically and on-chain.',
  openGraph: {
    title: 'Aegis',
    description: 'The accountability layer for autonomous trading.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <Providers>
          <Header />
          {/* Streamed: the status bar reaches both chains' RPCs, and a slow testnet must not hold up
              the page behind it. */}
          <Suspense fallback={<div className="h-[var(--status-h)] border-b border-[var(--line)] bg-[var(--bg-subtle)]" />}>
            <StatusBar />
          </Suspense>
          <main className="min-h-[calc(100vh-var(--header-h)-var(--status-h))]">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
