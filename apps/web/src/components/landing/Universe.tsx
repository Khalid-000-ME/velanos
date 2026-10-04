import { cn } from '@velanos/ui';
import { ARBITRUM_SEPOLIA_ID, ROBINHOOD_TESTNET_ID, deployment } from '@velanos/config';
import { explorerAddressUrl } from '../../lib/api';
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
  role: 'Settlement' | 'In mandate' | 'Forbidden';
  chainId: number;
  address: string;
};

/** Every tile is read from the deployment files, so the grid can only show tokens that are really deployed. */
function tiles(): Tile[] {
  const rh = deployment(ROBINHOOD_TESTNET_ID).assets;
  const arb = deployment(ARBITRUM_SEPOLIA_ID).assets;
  return [
    { logo: 'TSLA', ticker: 'TSLA', name: 'Tesla', role: 'In mandate', chainId: ROBINHOOD_TESTNET_ID, address: rh.TSLA!.address },
    { logo: 'AMZN', ticker: 'AMZN', name: 'Amazon', role: 'In mandate', chainId: ROBINHOOD_TESTNET_ID, address: rh.AMZN!.address },
    { logo: 'AMD', ticker: 'AMD', name: 'AMD', role: 'In mandate', chainId: ROBINHOOD_TESTNET_ID, address: rh.AMD!.address },
    { logo: 'ETH', ticker: 'WETH', name: 'Wrapped Ether', role: 'In mandate', chainId: ARBITRUM_SEPOLIA_ID, address: arb.ETH!.address },
    { logo: 'PLTR', ticker: 'PLTR', name: 'Palantir', role: 'Forbidden', chainId: ROBINHOOD_TESTNET_ID, address: rh.PLTR!.address },
    { logo: 'NFLX', ticker: 'NFLX', name: 'Netflix', role: 'Forbidden', chainId: ROBINHOOD_TESTNET_ID, address: rh.NFLX!.address },
    { mono: '$', ticker: 'USDC', name: 'Circle USD Coin', role: 'Forbidden', chainId: ARBITRUM_SEPOLIA_ID, address: arb.USDC!.address },
    { mono: 'G', ticker: 'USDG', name: 'Paxos Global Dollar', role: 'Settlement', chainId: ROBINHOOD_TESTNET_ID, address: rh.USDG!.address },
  ];
}

export function Universe() {
  return (
    <section className="content-width py-24">
      <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.35fr]">
        <div>
          <h2 className="text-h1">
            The mandate decides
            <br />
            <span className="accent">what it can touch.</span>
          </h2>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-[var(--ink-2)]">
            Every vault&rsquo;s mandate names exactly which assets its agent may use. The tokens here are
            the real ones — tokenised stocks on Robinhood Chain, WETH and USDC on Arbitrum — and signing
            for anything outside the mandate is a slashable offence, even if it never reaches the chain.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[14px]">
              <span className="size-2 rounded-full bg-[var(--green)]" aria-hidden />
              Settled in <strong className="font-semibold">USDG</strong>
            </span>
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[14px]">
              <span className="size-2 rounded-full bg-[var(--green)]" aria-hidden />
              Priced by <strong className="font-semibold">Chainlink &amp; live quotes</strong>
            </span>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles().map((a) => (
            <li
              key={a.ticker}
              className={cn(
                'flex flex-col items-center rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-3 pb-5 pt-6 text-center',
                a.role === 'Forbidden' && 'opacity-70',
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
                  a.role === 'Settlement' && 'bg-[var(--surface-2)] text-[var(--ink-2)]',
                  a.role === 'In mandate' && 'bg-[var(--green-tint)] text-[var(--green)]',
                  a.role === 'Forbidden' && 'bg-[var(--loss-tint)] text-[var(--loss)]',
                )}
              >
                {a.role}
              </span>
              <a
                href={explorerAddressUrl(a.chainId, a.address)}
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
