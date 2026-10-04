import Link from 'next/link';
import { Chip, StateChip, formatAmount, formatBps, formatWad } from '@velanos/ui';
import { CHAIN_SHORT, type AgentWithStats } from '@/lib/api';

const TIER_LABELS = ['Conservative', 'Balanced', 'Aggressive'] as const;

/**
 * One agent on the Discover grid.
 *
 * Bond locked is the headline figure, not return. Return is what every other product leads with and
 * it is the number an agent cannot be held to; the bond is what the agent has actually committed,
 * and it is the only figure on the card that constrains its behaviour.
 */
export function AgentCard({ agent }: { agent: AgentWithStats }) {
  const vaults = agent.vaults;
  const primary = vaults[0];
  const chains = [...new Set(vaults.map((v) => v.chainId))];
  const settlement = primary?.settlementSymbol || 'tUSDG';
  const decimals = primary?.settlementDecimals ?? 6;

  return (
    <Link
      href={`/agents/${agent.agentId}`}
      className="group block rounded-[var(--radius)] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-[var(--shadow-raised)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={agent.name} />
          <div>
            <h3 className="text-[15px] font-semibold leading-tight">{agent.name}</h3>
            <p className="mt-0.5 font-mono text-[11px] text-[var(--ink-3)]">
              {agent.vaultCount} vault{agent.vaultCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        {primary ? <StateChip state={primary.state} /> : null}
      </div>

      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
          Bond locked
        </p>
        <p className="mt-1 font-mono text-3xl font-semibold leading-none tracking-[-0.02em] text-[var(--green-ink)]">
          {formatAmount(agent.bondLocked, decimals, { maxFractionDigits: 0 })}
          <span className="ml-1.5 text-xs font-medium text-[var(--ink-3)]">{settlement}</span>
        </p>
      </div>

      {primary ? (
        <p className="mt-3 text-xs text-[var(--ink-2)]">
          Max loss {formatBps(drawdownBps(primary.hwmWad, primary.floorWad))} ·{' '}
          <span className="text-[var(--ink-3)]">
            floor {formatWad(primary.floorWad, 3)} per share
          </span>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
        {chains.map((id) => (
          <Chip key={id}>{CHAIN_SHORT[id] ?? id}</Chip>
        ))}
        <Chip>{TIER_LABELS[1]}</Chip>
        {agent.slashCount > 0 ? (
          <Chip tone="negative">
            {agent.slashCount} slash{agent.slashCount === 1 ? '' : 'es'}
          </Chip>
        ) : (
          <Chip tone="positive">No slashes</Chip>
        )}
        {agent.cleanSeasons > 0 ? <Chip tone="positive">{agent.cleanSeasons} clean</Chip> : null}
      </div>
    </Link>
  );
}

/**
 * Recovers the mandate's drawdown limit from the two figures the summary carries.
 *
 * The floor is the high-water mark less the limit, so the limit is the gap between them. Derived
 * rather than fetched because the card renders from the vault summary, and widening that payload to
 * carry the whole mandate for one percentage would make the Discover grid pay for it on every row.
 */
function drawdownBps(hwmWad: string, floorWad: string): number {
  const hwm = BigInt(hwmWad);
  if (hwm === 0n) return 0;
  return Number(((hwm - BigInt(floorWad)) * 10_000n) / hwm);
}

/** Deterministic monogram, so an agent looks the same on every screen without hosting an avatar. */
function Avatar({ name }: { name: string }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--black)] font-mono text-sm font-bold text-[var(--green)]">
      {initials}
    </span>
  );
}
