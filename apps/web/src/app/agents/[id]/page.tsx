import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import {
  Card,
  Chip,
  EmptyState,
  Metric,
  SectionHeading,
  StateChip,
  formatAmount,
  formatDate,
  formatWad,
  shortAddress,
} from '@aegis/ui';
import { CHAIN_LABELS, CHAIN_SHORT, api, explorerAddressUrl } from '@/lib/api';

export const dynamic = 'force-dynamic';

const TIER_BASE_BPS = [1_500, 2_500, 4_000];
const DISCOUNT_PER_SEASON_BPS = 250;

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await api.agent(id);
  if (!data) notFound();

  const { agent, vaults, violations } = data;
  const primary = vaults[0];
  const dec = primary?.settlementDecimals ?? 6;
  const sym = primary?.settlementSymbol ?? 'tUSDG';

  const bondLocked = vaults.reduce((acc, v) => acc + BigInt(v.bondAvailable), 0n);
  const bondSlashed = vaults.reduce((acc, v) => acc + BigInt(v.bondSlashed), 0n);

  // Mirrors AgentRegistry.requiredBondBps: a clean season shaves 250bps, with a floor at half base.
  const base = TIER_BASE_BPS[1]!;
  const floor = base / 2;
  const current = Math.max(floor, base - agent.cleanSeasons * DISCOUNT_PER_SEASON_BPS);
  const nextSeason = Math.max(floor, current - DISCOUNT_PER_SEASON_BPS);

  return (
    <div className="content-width pt-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--black)] font-mono text-lg font-bold text-[var(--green)]">
            {agent.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{agent.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-[var(--ink-3)]">
              <a
                href={explorerAddressUrl(agent.chainId, agent.operator)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-[var(--ink)]"
              >
                operator {shortAddress(agent.operator)} <ExternalLink size={10} />
              </a>
              <span>signer {shortAddress(agent.signer)}</span>
              <span>registered {formatDate(agent.registeredAt)}</span>
              {agent.erc8004Id !== '0' ? <span>ERC-8004 #{agent.erc8004Id}</span> : null}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[...new Set(vaults.map((v) => v.chainId))].map((cid) => (
                <Chip key={cid}>{CHAIN_SHORT[cid] ?? cid}</Chip>
              ))}
              <Chip tone={agent.slashCount > 0 ? 'negative' : 'positive'}>
                {agent.slashCount} slash{agent.slashCount === 1 ? '' : 'es'}
              </Chip>
              <Chip tone="positive">{agent.cleanSeasons} clean seasons</Chip>
            </div>
          </div>
        </div>

        {/* The claim that makes liability bearable for the agent, stated in its own words. */}
        <Card dark className="max-w-sm p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--on-black-2)]">
            Capital at risk first
          </p>
          <p className="mt-2 font-mono text-3xl font-semibold leading-none text-[var(--green)]">
            {formatAmount(bondLocked.toString(), dec, { maxFractionDigits: 0 })}
            <span className="ml-1.5 text-xs font-medium text-[var(--on-black-2)]">{sym}</span>
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--on-black-2)]">
            This agent has its own capital staked across {vaults.length} vault
            {vaults.length === 1 ? '' : 's'}. It pays depositors before anyone asks.
          </p>
          {bondSlashed > 0n ? (
            <p className="mt-2 font-mono text-[11px] text-[var(--loss)]">
              {formatAmount(bondSlashed.toString(), dec, { maxFractionDigits: 2 })} {sym} already paid out
            </p>
          ) : null}
        </Card>
      </div>

      {/* ── bond pricing ───────────────────────────────────────────────── */}
      <Card className="mt-8 p-5">
        <h2 className="text-sm font-semibold">Bond cost</h2>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--ink-3)]">
          A clean settlement record makes outside capital cheaper to access — which is the reason an
          operator accepts liability in the first place. It never loosens a single check.
        </p>

        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          <Metric label="Current requirement" value={`${(current / 100).toFixed(1)}%`} size="sm" sub="of max allocation" />
          <Metric label="After the next clean season" value={`${(nextSeason / 100).toFixed(1)}%`} size="sm" tone="positive" />
          <Metric label="Floor" value={`${(floor / 100).toFixed(1)}%`} size="sm" sub="discounts stop here" />
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]">
          <div
            className="h-full rounded-full bg-[var(--green)] transition-all"
            style={{ width: `${((base - current) / (base - floor)) * 100}%` }}
          />
        </div>
      </Card>

      {/* ── vaults ─────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <SectionHeading title="Vaults" sub="Each one carries its own immutable mandate." />
        {vaults.length === 0 ? (
          <EmptyState title="No vaults yet" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vaults.map((v) => (
              <Link
                key={`${v.chainId}-${v.address}`}
                href={`/vaults/${v.address}`}
                className="rounded-[var(--radius)] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-raised)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-snug">{v.name}</h3>
                  <StateChip state={v.state} />
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold leading-none tracking-[-0.02em]">
                  {formatAmount(v.nav, v.settlementDecimals, { maxFractionDigits: 0 })}
                  <span className="ml-1 text-[11px] font-medium text-[var(--ink-3)]">
                    {v.settlementSymbol}
                  </span>
                </p>
                <p className="mt-2 font-mono text-[11px] text-[var(--ink-3)]">
                  share {formatWad(v.pricePerShareWad, 4)} · floor {formatWad(v.floorWad, 4)}
                </p>
                <p className="mt-2 text-[11px] text-[var(--ink-3)]">
                  {CHAIN_LABELS[v.chainId] ?? v.chainId}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── violations ─────────────────────────────────────────────────── */}
      <section className="mt-10">
        <SectionHeading
          title="Violation history"
          sub="Every slash this agent has paid, with the transaction behind it."
        />
        {violations.length === 0 ? (
          <EmptyState
            title="No violations on record"
            hint="This agent has not had its bond slashed."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--bg-subtle)] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  <th className="px-4 py-2.5">Rule</th>
                  <th className="px-4 py-2.5">Vault</th>
                  <th className="px-4 py-2.5">Penalty</th>
                  <th className="px-4 py-2.5">Bounty</th>
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {violations.map((v, i) => (
                  <tr key={i} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[12px] font-bold">
                      {v.ruleId ?? 'drawdown'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">{shortAddress(v.vault)}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--loss)]">
                      {formatAmount(v.penaltyPaid, dec, { maxFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--ink-3)]">
                      {formatAmount(v.bountyPaid, dec, { maxFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-[var(--ink-3)]">
                      {formatDate(v.ts)}
                    </td>
                    <td className="px-4 py-2.5">
                      {v.txUrl ? (
                        <a
                          href={v.txUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)]"
                        >
                          tx <ExternalLink size={10} />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
