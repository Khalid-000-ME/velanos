import Link from 'next/link';
import { EmptyState, StateChip, formatAmount, formatWad, shortAddress } from '@velanos/ui';
import { CHAIN_SHORT, type VaultSummary } from '@/lib/api';
import { BrandLogo } from './BrandLogo';

/**
 * Every vault under mandate, one row each.
 *
 * The bond column leads and is the only figure in lime: it is what the agent has actually committed.
 * NAV per share turns red-orange only when it has crossed its floor, so a breach is visible in a scan
 * of the table without reading a single number.
 */
export function VaultTable({ vaults }: { vaults: VaultSummary[] }) {
  if (vaults.length === 0) {
    return (
      <EmptyState
        title="No vaults indexed yet"
        hint="Run pnpm demo:seed to register an agent and create the demo vaults."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]">
      <table className="w-full min-w-[860px] text-left">
        <thead>
          <tr className="border-b border-[var(--line)] text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
            <th className="px-7 py-5 font-medium">Vault</th>
            <th className="px-4 py-5 font-medium">Chain</th>
            <th className="px-4 py-5 font-medium">Bond at stake</th>
            <th className="px-4 py-5 font-medium">NAV / share</th>
            <th className="px-4 py-5 font-medium">Loss floor</th>
            <th className="px-4 py-5 font-medium">Breaches</th>
            <th className="px-4 py-5 font-medium">State</th>
            <th className="px-7 py-5" />
          </tr>
        </thead>
        <tbody>
          {vaults.map((v) => {
            const breached = BigInt(v.pricePerShareWad) < BigInt(v.floorWad);
            return (
              <tr key={`${v.chainId}-${v.address}`} className="border-b border-[var(--line)] last:border-0">
                <td className="px-7 py-5">
                  <p className="text-[15px] font-semibold">{v.name}</p>
                  <p className="mt-0.5 font-mono text-[12px] text-[var(--ink-3)]">
                    {shortAddress(v.address, 4)}
                  </p>
                </td>
                <td className="px-4 py-5">
                  <span className="inline-flex items-center gap-2 text-[14px] text-[var(--ink-2)]">
                    <BrandLogo logo={v.chainId === 421614 ? 'ARBITRUM' : 'ROBINHOOD'} size={22} />
                    {CHAIN_SHORT[v.chainId] ?? v.chainId}
                  </span>
                </td>
                <td className="px-4 py-5 text-[16px] font-semibold tabular-nums text-[var(--green)]">
                  {formatAmount(v.bondAvailable, v.settlementDecimals, { maxFractionDigits: 0 })}
                  <span className="ml-1.5 text-[12px] font-normal text-[var(--ink-3)]">{v.settlementSymbol}</span>
                </td>
                <td
                  className="px-4 py-5 text-[15px] font-medium tabular-nums"
                  style={breached ? { color: 'var(--loss)' } : undefined}
                >
                  {formatWad(v.pricePerShareWad, 4)}
                </td>
                <td className="px-4 py-5 text-[15px] tabular-nums text-[var(--ink-2)]">
                  {formatWad(v.floorWad, 4)}
                </td>
                <td className="px-4 py-5 text-[15px] tabular-nums">
                  <span style={v.staticViolations > 0 ? { color: 'var(--loss)' } : undefined}>
                    {v.staticViolations}
                  </span>
                  <span className="text-[var(--ink-3)]"> / 2</span>
                </td>
                <td className="px-4 py-5">
                  <StateChip state={v.state} />
                </td>
                <td className="px-7 py-5 text-right">
                  <Link
                    href={`/vaults/${v.address}`}
                    className="inline-flex rounded-[var(--radius-pill)] bg-[var(--ink)] px-5 py-2 text-[14px] font-semibold text-[var(--bg)] transition-opacity hover:opacity-90"
                  >
                    View vault
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
