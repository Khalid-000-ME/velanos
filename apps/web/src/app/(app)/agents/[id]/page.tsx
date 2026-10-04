import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import {
  Chip,
  EmptyState,
  Eyebrow,
  HairlineCell,
  HairlineGrid,
  Metric,
  SectionHeading,
  StateChip,
  formatAmount,
  formatDate,
  formatWad,
  shortAddress,
} from '@velanos/ui';
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
    <div className="content-width py-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--black)] font-mono text-[17px] font-medium text-[var(--green-on-black)]">
            {agent.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <Eyebrow>Agent</Eyebrow>
            <h1 className="text-h1 mt-2">{agent.name}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-[var(--ink-3)]">
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
            <div className="mt-4 flex flex-wrap gap-1.5">
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
        <div className="relative max-w-sm overflow-hidden rounded-[var(--radius)] bg-[var(--black)] p-6 text-[var(--on-black)]">
          <div className="grid-field pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <div className="relative">
          <Eyebrow tone="onBlack">Capital at risk first</Eyebrow>
          <p className="mt-4 text-[2.5rem] font-medium leading-none tracking-[-0.03em] tabular-nums text-[var(--green-on-black)]">
            {formatAmount(bondLocked.toString(), dec, { maxFractionDigits: 0 })}
            <span className="ml-2 text-[12px] font-normal text-[var(--on-black-2)]">{sym}</span>
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-[var(--on-black-2)]">
            This agent has its own capital staked across {vaults.length} vault
            {vaults.length === 1 ? '' : 's'}. It pays depositors before anyone asks.
          </p>
          {bondSlashed > 0n ? (
            <p className="mt-3 font-mono text-[12px] text-[var(--loss-on-black)]">
              {formatAmount(bondSlashed.toString(), dec, { maxFractionDigits: 2 })} {sym} already paid out
            </p>
          ) : null}
          </div>
        </div>
      </div>

      {/* ── bond pricing ───────────────────────────────────────────────── */}
      <div className="mt-10 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-7">
        <Eyebrow>Bond cost</Eyebrow>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-[var(--ink-3)]">
          A clean settlement record makes outside capital cheaper to access — which is the reason an
          operator accepts liability in the first place. It never loosens a single check.
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          <Metric label="Current requirement" value={`${(current / 100).toFixed(1)}%`} size="sm" sub="of max allocation" />
          <Metric label="After the next clean season" value={`${(nextSeason / 100).toFixed(1)}%`} size="sm" tone="positive" />
          <Metric label="Floor" value={`${(floor / 100).toFixed(1)}%`} size="sm" sub="discounts stop here" />
        </div>

        <div className="mt-6 h-1 overflow-hidden rounded-full bg-[var(--bg-muted)]">
          <div
            className="h-full rounded-full bg-[var(--green)] transition-all duration-500"
            style={{ width: `${((base - current) / (base - floor)) * 100}%` }}
          />
        </div>
      </div>

      {/* ── vaults ─────────────────────────────────────────────────────── */}
      <section className="mt-16">
        <SectionHeading
          eyebrow="Portfolio"
          index="01"
          title="Vaults"
          sub="Each one carries its own immutable mandate and its own bond."
        />
        {vaults.length === 0 ? (
          <EmptyState title="No vaults yet" />
        ) : (
          <HairlineGrid columns={3}>
            {vaults.map((v) => (
              <HairlineCell key={`${v.chainId}-${v.address}`}>
              <Link
                href={`/vaults/${v.address}`}
                className="block h-full p-6 transition-colors hover:bg-[var(--bg-subtle)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-medium leading-snug">{v.name}</h3>
                  <StateChip state={v.state} />
                </div>
                <p className="mt-5 text-[1.75rem] font-medium leading-none tracking-[-0.03em] tabular-nums">
                  {formatAmount(v.nav, v.settlementDecimals, { maxFractionDigits: 0 })}
                  <span className="ml-1.5 text-[11px] font-normal text-[var(--ink-3)]">
                    {v.settlementSymbol}
                  </span>
                </p>
                <p className="mt-3 font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                  share {formatWad(v.pricePerShareWad, 4)} · floor {formatWad(v.floorWad, 4)}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  {CHAIN_LABELS[v.chainId] ?? v.chainId}
                </p>
              </Link>
              </HairlineCell>
            ))}
          </HairlineGrid>
        )}
      </section>

      {/* ── violations ─────────────────────────────────────────────────── */}
      <section className="mt-16">
        <SectionHeading
          eyebrow="Record"
          index="02"
          title="Violation history"
          sub="Every slash this agent has paid, with the transaction behind it."
        />
        {violations.length === 0 ? (
          <EmptyState
            title="No violations on record"
            hint="This agent has not had its bond slashed."
          />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--bg-subtle)] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
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
          </div>
        )}
      </section>
    </div>
  );
}
