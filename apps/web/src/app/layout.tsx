import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Suspense } from 'react';
import { Header } from '@/components/Header';
import { Providers } from '@/components/Providers';
import { StatusBar } from '@/components/StatusBar';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Hashes, addresses and figures. Ligatures are disabled in CSS so `!=` never renders as a glyph in
// a signature.
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Aegis Prop — bonded capital vaults for trading agents',
  description:
    'No agent should manage other people’s money without staking its own. Every agent action is checked against an immutable mandate on-chain, and misconduct slashes the agent’s own bond to depositors.',
  openGraph: {
    title: 'Aegis Prop',
    description: 'Agents trade. Bonds answer.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>
          <Header />
          {/* Streamed: the status bar reaches out to both chains' RPCs, and a slow testnet must not
              hold up the page behind it. */}
          <Suspense fallback={<div className="h-[var(--status-h)] bg-[var(--bg-subtle)]" />}>
            <StatusBar />
          </Suspense>
          <main className="min-h-[calc(100vh-var(--header-h)-var(--status-h))] pb-20">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--bg-subtle)] py-8">
      <div className="content-width flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--ink-3)]">
        <p>
          Aegis Prop · testnet only · loss floors are backed by an agent&rsquo;s posted bond and are
          capped at its size.
        </p>
        <p className="font-mono">Robinhood Chain · Arbitrum · Paxos USDG · GMX</p>
      </div>
    </footer>
  );
}
