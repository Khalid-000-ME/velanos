import { cn } from '@velanos/ui';
import { BrandLogo, type LogoKey } from '../BrandLogo';

/**
 * What the demo mandate lets its agent touch — and what it does not.
 *
 * Showing the forbidden assets beside the allowed ones is the point: the prompt-injection scenario is
 * an agent buying Palantir, and a judge who has seen this grid already knows why that gets slashed.
 */
const ASSETS: Array<{ logo: LogoKey; ticker: string; name: string; venue: string; allowed: boolean }> = [
  { logo: 'TSLA', ticker: 'TSLA', name: 'Tesla', venue: 'Robinhood Chain', allowed: true },
  { logo: 'AMZN', ticker: 'AMZN', name: 'Amazon', venue: 'Robinhood Chain', allowed: true },
  { logo: 'AMD', ticker: 'AMD', name: 'AMD', venue: 'Robinhood Chain', allowed: true },
  { logo: 'PLTR', ticker: 'PLTR', name: 'Palantir', venue: 'Robinhood Chain', allowed: false },
  { logo: 'ETH', ticker: 'ETH-USD', name: 'Ethereum perp', venue: 'GMX · Arbitrum', allowed: true },
  { logo: 'BTC', ticker: 'BTC-USD', name: 'Bitcoin perp', venue: 'GMX · Arbitrum', allowed: true },
  { logo: 'DOGE', ticker: 'DOGE-USD', name: 'Dogecoin perp', venue: 'GMX · Arbitrum', allowed: false },
  { logo: 'NFLX', ticker: 'NFLX', name: 'Netflix', venue: 'Robinhood Chain', allowed: false },
];

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
            Spot vaults trade tokenized equities on Robinhood Chain. Perps vaults trade GMX markets on
            Arbitrum. Each vault&rsquo;s mandate names exactly which assets its agent may use — signing
            for anything else is a slashable offence, even if it never reaches the chain.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[14px]">
              <span className="size-2 rounded-full bg-[var(--green)]" aria-hidden />
              Settled in <strong className="font-semibold">USDG</strong>
            </span>
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] py-1.5 pl-1.5 pr-4 text-[14px]">
              <BrandLogo logo="GMX" size={22} />
              Perps via <strong className="font-semibold">GMX</strong>
            </span>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ASSETS.map((a) => (
            <li
              key={a.ticker}
              className={cn(
                'flex flex-col items-center rounded-[var(--radius-lg)] border px-3 pb-5 pt-6 text-center transition-colors',
                a.allowed
                  ? 'border-[var(--line)] bg-[var(--surface)]'
                  : 'border-[var(--line)] bg-[var(--surface)] opacity-60',
              )}
            >
              <BrandLogo logo={a.logo} size={52} className={a.allowed ? '' : 'grayscale'} />
              <p className="mt-4 text-[15px] font-semibold">{a.ticker}</p>
              <p className="mt-0.5 text-[12px] text-[var(--ink-3)]">{a.name}</p>
              <span
                className={cn(
                  'mt-3 rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
                  a.allowed
                    ? 'bg-[var(--green-tint)] text-[var(--green)]'
                    : 'bg-[var(--loss-tint)] text-[var(--loss)]',
                )}
              >
                {a.allowed ? 'In mandate' : 'Forbidden'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
