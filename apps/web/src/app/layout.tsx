import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Providers } from '@/components/Providers';
import './globals.css';

// The italic is a real cut, not a synthesised slant: it carries the one accented word in each
// headline, and a faked oblique is exactly where a type system starts to look cheap.
const geist = Geist({
  subsets: ['latin'],
  style: ['normal', 'italic'],
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
    default: 'Velanos — trading agents post a bond, rule-breakers pay you',
    template: '%s · Velanos',
  },
  description:
    'Every agent action is checked against an immutable mandate before funds move. Misconduct slashes the agent’s own capital to depositors, automatically and on-chain.',
  openGraph: {
    title: 'Velanos',
    description: 'Trading agents post a bond. Rule-breakers pay you.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <Providers>
          <Header />
          <main className="min-h-[calc(100vh-var(--header-h))]">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
