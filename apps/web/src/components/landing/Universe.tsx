import { cn } from '@velanos/ui';
import { ARBITRUM_SEPOLIA_ID, deployment } from '@velanos/config';
import { BrandLogo, type LogoKey } from '../BrandLogo';

/**
 * What the demo mandate lets its agent touch — and what it does not.
 *
 * Showing the forbidden assets beside the allowed ones is the point: the prompt-injection scenario is
 * an agent rotating into USDC, and a judge who has seen this grid already knows why that gets slashed.
 */
type Tile = {
  logo?: LogoKey;
  mono?: string;
  ticker: string;
  name: string;
  role: string;
  address: string;
  allowed: boolean | null;
};

function tiles(): Tile[] {
  const d = deployment(ARBITRUM_SEPOLIA_ID);
  return [
    { mono: 'G', ticker: 'USDG', name: 'Paxos Global Dollar', role: 'Settlement and bond', address: d.assets.USDG!.address, allowed: null },
    { logo: 'ETH', ticker: 'WETH', name: 'Wrapped Ether', role: 'In mandate', address: d.assets.ETH!.address, allowed: true },
    { mono: '$', ticker: 'USDC', name: 'Circle USD Coin', role: 'Forbidden', address: d.assets.USDC!.address, allowed: false },
  ];
}

export function Universe() {
  return (
    <section className="content-width py-24">
      <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="text-h1">
            The mandate decides
            <br />
            <span className="accent">what it can touch.</span>
          </h2>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-[var(--ink-2)]">
            Every vault&rsquo;s mandate names exactly which assets its agent may use. The tokens below are
            the real ones on Arbitrum Sepolia, priced by Chainlink — signing for anything outside the
            mandate is a slashable offence, even if it never reaches the chain.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[14px]">
              <span className="size-2 rounded-full bg-[var(--green)]" aria-hidden />
              Settled in <strong className="font-semibold">USDG</strong>
            </span>
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[14px]">
              <span className="size-2 rounded-full bg-[var(--green)]" aria-hidden />
              Priced by <strong className="font-semibold">Chainlink</strong>
            </span>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiles().map((a) => (
            <li
              key={a.ticker}
              className={cn(
                'flex flex-col items-center rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-3 pb-5 pt-6 text-center',
                a.allowed === false && 'opacity-70',
              )}
            >
              {a.logo ? (
                <BrandLogo logo={a.logo} size={52} />
              ) : (
                <span className="flex size-[52px] items-center justify-center rounded-full bg-[var(--surface-2)] text-[20px] font-semibold text-[var(--ink-2)]">
                  {a.mono}
                </span>
              )}
              <p className="mt-4 text-[15px] font-semibold">{a.ticker}</p>
              <p className="mt-0.5 text-[12px] text-[var(--ink-3)]">{a.name}</p>
              <span
                className={cn(
                  'mt-3 rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
                  a.allowed === null && 'bg-[var(--surface-2)] text-[var(--ink-2)]',
                  a.allowed === true && 'bg-[var(--green-tint)] text-[var(--green)]',
                  a.allowed === false && 'bg-[var(--loss-tint)] text-[var(--loss)]',
                )}
              >
                {a.role}
              </span>
              <a
                href={`https://sepolia.arbiscan.io/address/${a.address}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 text-[11px] text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
              >
                {a.address.slice(0, 6)}…{a.address.slice(-4)} ↗
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
