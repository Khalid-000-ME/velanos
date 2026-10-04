import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowUpRight, Snowflake } from 'lucide-react';
import {
  Chip,
  Eyebrow,
  ExposureBar,
  Metric,
  MetricCell,
  MetricStrip,
  StateChip,
  countdown,
  formatAmount,
  formatWad,
  shortAddress,
} from '@velanos/ui';
import { IntentStream } from '@/components/IntentStream';
import { NavChart } from '@/components/NavChart';
import { CHAIN_LABELS, api, explorerAddressUrl } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function VaultCockpit({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;

  const [vault, nav, intents, incidents] = await Promise.all([
    api.vault(address),
    api.vaultNav(address, '24h'),
    api.vaultIntents(address),
    api.incidents(address),
  ]);

  if (!vault) notFound();

  const dec = vault.settlementDecimals;
  const sym = vault.settlementSymbol;
  const expiry = Number(vault.mandate.expiry);
  const timeLeft = countdown(expiry);
  const openIncident = incidents?.incidents.find((i) => i.closedAt === null);
  const breached = BigInt(vault.pricePerShareWad) < BigInt(vault.floorWad);

  return (
    <div className="content-width py-10">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <Eyebrow>{CHAIN_LABELS[vault.chainId] ?? vault.chainId}</Eyebrow>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-h1">{vault.name}</h1>
            <StateChip state={vault.state} />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-[var(--ink-3)]">
            <a
              href={explorerAddressUrl(vault.chainId, vault.address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-[var(--ink)]"
            >
              {shortAddress(vault.address, 6)} <ArrowUpRight size={11} />
            </a>
            {vault.agent ? (
              <Link href={`/agents/${vault.agent.agentId}`} className="hover:text-[var(--ink)]">
                agent · {vault.agent.name}
              </Link>
            ) : null}
            <span>mandate · {shortAddress(vault.mandateHash, 5)}</span>
          </p>
        </div>

        <Link
          href={`/vaults/${vault.address}/fund`}
          className="rounded-[var(--radius-sm)] bg-[var(--green)] px-5 py-2.5 text-[14px] font-medium text-black transition-colors hover:bg-[var(--green-hover)]"
        >
          Fund this vault
        </Link>
      </div>

      <StateBanner vault={vault} incidentId={openIncident?.id ?? null} />

      {/* ── metric strip ───────────────────────────────────────────────── */}
      <MetricStrip className="mt-8" columns={4}>
        <MetricCell>
          <Metric
            label={`Net asset value`}
            value={formatAmount(vault.nav, dec, { maxFractionDigits: 2 })}
            size="lg"
            sub={`${sym} · cap ${formatAmount(vault.mandate.maxAllocation, dec, { maxFractionDigits: 0 })}`}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="NAV per share"
            value={formatWad(vault.pricePerShareWad)}
            tone={breached ? 'negative' : 'neutral'}
            size="lg"
            sub={`high-water ${formatWad(vault.hwmWad)}`}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Loss floor"
            value={formatWad(vault.floorWad)}
            size="lg"
            tone={breached ? 'negative' : 'neutral'}
            sub={`${(vault.mandate.maxDrawdownBps / 100).toFixed(0)}% below high-water mark`}
          />
        </MetricCell>
        <MetricCell>
          <Metric
            label="Bond at stake"
            value={formatAmount(vault.bondAvailable, dec, { maxFractionDigits: 0 })}
            tone="positive"
            size="lg"
            sub={
              BigInt(vault.bondSlashed) > 0n
                ? `${formatAmount(vault.bondSlashed, dec, { maxFractionDigits: 2 })} already paid out`
                : `of ${formatAmount(vault.bondStaked, dec, { maxFractionDigits: 0 })} staked`
            }
          />
        </MetricCell>
      </MetricStrip>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Chip tone={vault.staticViolations > 0 ? 'negative' : 'positive'}>
          Breaches {vault.staticViolations}/2
        </Chip>
        <Chip tone={vault.strikes > 0 ? 'warn' : 'neutral'}>Strikes {vault.strikes}/3</Chip>
        <Chip>{timeLeft ? `Term ends in ${timeLeft}` : 'Term ended'}</Chip>
      </div>

      {/* ── chart + stream ─────────────────────────────────────────────── */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <div className="space-y-6">
          <Panel label="NAV per share vs the loss floor">
            {nav ? (
              <div className="p-5">
                <NavChart series={nav} />
              </div>
            ) : (
              <p className="p-5 text-[14px] text-[var(--ink-3)]">No NAV data yet.</p>
            )}
          </Panel>

          <Panel label="Positions">
            {vault.positions.length === 0 ? (
              <p className="p-5 text-[14px] text-[var(--ink-3)]">
                Holding only {sym}. Nothing at market risk right now.
              </p>
            ) : (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    <th className="px-5 py-2.5 font-medium">Asset</th>
                    <th className="px-5 py-2.5 font-medium">Amount</th>
                    <th className="w-[45%] px-5 py-2.5 font-medium">Exposure vs cap</th>
                  </tr>
                </thead>
                <tbody>
                  {vault.positions.map((p) => (
                    <tr key={p.asset} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-5 py-3 font-medium">{p.symbol || shortAddress(p.asset)}</td>
                      <td className="px-5 py-3 font-mono text-[13px] tabular-nums">
                        {formatAmount(p.amount, 18, { maxFractionDigits: 4 })}
                      </td>
                      <td className="px-5 py-3">
                        <ExposureBar bps={p.exposureBps} capBps={vault.mandate.maxAssetExposureBps} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel label="Mandate">
            <ul className="grid gap-x-8 gap-y-2.5 p-5 text-[14px] leading-relaxed text-[var(--ink-2)] sm:grid-cols-2">
              {vault.mandateEnglish.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span
                    className="mt-[9px] size-1 shrink-0 rounded-full bg-[var(--green)]"
                    aria-hidden
                  />
                  {line}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel
          label="Intent stream"
          action={
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--green)]" aria-hidden />
              live
            </span>
          }
        >
          <div className="max-h-[760px] overflow-y-auto">
            <IntentStream
              initial={intents?.intents ?? []}
              vault={vault.address}
              chainId={vault.chainId}
              settlementSymbol={sym}
              settlementDecimals={dec}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** A bordered region with a monospace caption, the repeating container on every data screen. */
function Panel({
  label,
  children,
  action,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-white">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
          {label}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * The banner states.
 *
 * Each answers the only question a depositor has in that state — is my money moving, and what happens
 * next — rather than just naming the state. A FROZEN badge alone says funds are stuck without saying
 * anything is being done about it.
 */
function StateBanner({
  vault,
  incidentId,
}: {
  vault: NonNullable<Awaited<ReturnType<typeof api.vault>>>;
  incidentId: number | null;
}) {
  const reasons = [
    '',
    'repeated mandate breaches',
    'a drawdown through the floor',
    'failing to settle on time',
    'a guardian halt',
  ];

  if (vault.state === 3 || vault.state === 4) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[var(--radius)] bg-[var(--black)] px-5 py-4 text-[14px] text-white">
        <Snowflake size={16} className="text-[var(--green-on-black)]" />
        <span>
          <strong className="font-medium">Trading halted</strong> after{' '}
          {reasons[vault.freezeReason] ?? 'a halt'}. Positions are being unwound to{' '}
          {vault.settlementSymbol}; depositors can withdraw in full once it settles.
        </span>
        {incidentId ? (
          <Link
            href={`/incidents/${incidentId}`}
            className="ml-auto rounded-[var(--radius-sm)] border border-white/25 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors hover:bg-white/10"
          >
            See what happened
          </Link>
        ) : null}
      </div>
    );
  }

  if (vault.state === 2) {
    const left = countdown(vault.frozenAt + 120);
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--warn)]/30 bg-[var(--warn-tint)] px-5 py-4 text-[14px]">
        <AlertTriangle size={16} className="text-[var(--warn)]" />
        <span className="text-[var(--ink-2)]">
          <strong className="font-medium text-[var(--ink)]">Cooling off.</strong> The agent hit its
          limits three times in a row, so new trades are paused{left ? ` for ${left}` : ''}. Nothing
          was slashed — these were rejections, not misconduct.
        </span>
      </div>
    );
  }

  if (vault.state === 6) {
    return (
      <div className="mt-6 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-subtle)] px-5 py-4 text-[14px] text-[var(--ink-2)]">
        <strong className="font-medium text-[var(--ink)]">Settled.</strong> Everything is back in{' '}
        {vault.settlementSymbol} and every share is redeemable in full.
        {incidentId ? (
          <Link
            href={`/incidents/${incidentId}`}
            className="ml-2 underline decoration-[var(--line-strong)] underline-offset-4 hover:decoration-[var(--green)]"
          >
            Incident replay
          </Link>
        ) : null}
      </div>
    );
  }

  return null;
}
