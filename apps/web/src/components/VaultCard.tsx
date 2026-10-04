import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Chip, StateChip, formatAmount, formatWad } from '@velanos/ui';
import { CHAIN_SHORT, type AgentWithStats, type VaultSummary } from '@/lib/api';

/**
 * One vault on the index.
 *
 * Leads with bond, not return. Return is the number every other product leads with and the one an
 * agent cannot be held to; the bond is what the agent has actually committed and the only figure on
 * the card that constrains its behaviour.
 */
export function VaultCard({ vault, agent }: { vault: VaultSummary; agent?: AgentWithStats }) {
  const dec = vault.settlementDecimals;
  const sym = vault.settlementSymbol || 'tUSDG';
  const breached = BigInt(vault.pricePerShareWad) < BigInt(vault.floorWad);

  return (
    <Link
      href={`/vaults/${vault.address}`}
      className="group flex h-full flex-col justify-between p-6 transition-colors hover:bg-[var(--bg-subtle)]"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-medium tracking-[-0.01em]">{vault.name}</h3>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
              {agent?.name ?? `Agent ${vault.agentId}`} · {CHAIN_SHORT[vault.chainId] ?? vault.chainId}
            </p>
          </div>
          <ArrowUpRight
            size={15}
            className="shrink-0 text-[var(--ink-3)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--ink)]"
          />
        </div>

        <div className="mt-7">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
            Bond at stake
          </p>
          <p className="mt-2 text-[2rem] font-medium leading-none tracking-[-0.03em] tabular-nums text-[var(--green-ink)]">
            {formatAmount(vault.bondAvailable, dec, { maxFractionDigits: 0 })}
            <span className="ml-1.5 text-[12px] font-normal text-[var(--ink-3)]">{sym}</span>
          </p>
        </div>
      </div>

      <div className="mt-7 border-t border-[var(--line)] pt-4">
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="NAV / share" value={formatWad(vault.pricePerShareWad, 4)} />
          <Stat
            label="Loss floor"
            value={formatWad(vault.floorWad, 4)}
            tone={breached ? 'loss' : undefined}
          />
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <StateChip state={vault.state} />
          {vault.staticViolations > 0 ? (
            <Chip tone="negative">{vault.staticViolations} breach</Chip>
          ) : (
            <Chip tone="positive">Clean</Chip>
          )}
          {vault.strikes > 0 ? <Chip tone="warn">{vault.strikes}/3 strikes</Chip> : null}
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'loss' }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {label}
      </dt>
      <dd
        className="mt-1 font-mono text-[14px] tabular-nums"
        style={tone === 'loss' ? { color: 'var(--loss)' } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
