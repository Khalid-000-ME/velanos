import Image from 'next/image';
import { cn } from '@velanos/ui';

/**
 * Third-party marks for the chains, venues and assets Velanos touches.
 *
 * Each mark sits on the ground it was designed for: dark wordmarks on a white disc, Robinhood's lime
 * feather on black, and badge-shaped marks (Arbitrum's hexagon, GMX's triangle) on no disc at all.
 * Sources are listed in public/logos/SOURCES.md; marks belong to their owners and are used only to
 * name the asset or network.
 */
export type LogoKey =
  | 'TSLA'
  | 'AMZN'
  | 'AMD'
  | 'PLTR'
  | 'NFLX'
  | 'ETH'
  | 'BTC'
  | 'DOGE'
  | 'ROBINHOOD'
  | 'ARBITRUM'
  | 'GMX'
  | 'CLAUDE';

const LOGOS: Record<LogoKey, { src: string; name: string; disc: string | null; scale: number }> = {
  TSLA: { src: '/logos/tesla.svg', name: 'Tesla', disc: '#ffffff', scale: 0.56 },
  AMZN: { src: '/logos/amazon.svg', name: 'Amazon', disc: '#ffffff', scale: 0.58 },
  AMD: { src: '/logos/amd.svg', name: 'AMD', disc: '#ffffff', scale: 0.7 },
  PLTR: { src: '/logos/palantir.svg', name: 'Palantir', disc: '#ffffff', scale: 0.52 },
  NFLX: { src: '/logos/netflix.svg', name: 'Netflix', disc: '#000000', scale: 0.5 },
  ETH: { src: '/logos/ethereum.svg', name: 'Ethereum', disc: '#ffffff', scale: 0.56 },
  BTC: { src: '/logos/bitcoin.svg', name: 'Bitcoin', disc: '#ffffff', scale: 0.86 },
  DOGE: { src: '/logos/dogecoin.svg', name: 'Dogecoin', disc: '#ffffff', scale: 0.86 },
  ROBINHOOD: { src: '/logos/robinhood.svg', name: 'Robinhood Chain', disc: '#000000', scale: 0.56 },
  ARBITRUM: { src: '/logos/arbitrum.svg', name: 'Arbitrum', disc: null, scale: 1 },
  GMX: { src: '/logos/gmx.png', name: 'GMX', disc: null, scale: 1 },
  CLAUDE: { src: '/logos/claude.svg', name: 'Claude', disc: '#ffffff', scale: 0.6 },
};

export function BrandLogo({
  logo,
  size = 40,
  className,
}: {
  logo: LogoKey;
  size?: number;
  className?: string;
}) {
  const entry = LOGOS[logo];
  const inner = Math.round(size * entry.scale);

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full', className)}
      style={{ width: size, height: size, background: entry.disc ?? 'transparent' }}
      title={entry.name}
    >
      <Image
        src={entry.src}
        alt={entry.name}
        width={inner}
        height={inner}
        unoptimized
        className={logo === 'GMX' ? 'rounded-full' : undefined}
      />
    </span>
  );
}
