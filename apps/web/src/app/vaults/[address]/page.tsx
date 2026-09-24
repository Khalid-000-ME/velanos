import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ExternalLink, Snowflake } from 'lucide-react';
import {
  Card,
  Chip,
  ExposureBar,
  Metric,
  StateChip,
  countdown,
  formatAmount,
  formatWad,
  shortAddress,
} from '@aegis/ui';
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

  return (
    <div className="content-width pt-8">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{vault.name}</h1>
            <StateChip state={vault.state} />
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-[var(--ink-3)]">
            <span>{CHAIN_LABELS[vault.chainId] ?? vault.chainId}</span>
            <a
              href={explorerAddressUrl(vault.chainId, vault.address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-[var(--ink)]"
            >
              {shortAddress(vault.address, 6)} <ExternalLink size={10} />
            </a>
            {vault.agent ? (
              <Link href={`/agents/${vault.agent.agentId}`} className="hover:text-[var(--ink)]">
                agent {vault.agent.name}
              </Link>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/vaults/${vault.address}/fund`}
            className="rounded-[var(--radius-pill)] bg-[var(--green)] px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[var(--green-hover)]"
          >
            Fund this vault
          </Link>
        </div>
      </div>

      <StateBanner vault={vault} incidentId={openIncident?.id ?? null} />

      {/* ── metrics ────────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card accent className="p-5">
          <Metric
            label={`NAV (${sym})`}
            value={formatAmount(vault.nav, dec, { maxFractionDigits: 2 })}
            size="lg"
            sub={`of ${formatAmount(vault.mandate.maxAllocation, dec, { maxFractionDigits: 0 })} cap`}
          />
        </Card>

        <Card className="p-5">
          <Metric
            label="NAV per share"
            value={formatWad(vault.pricePerShareWad)}
            tone={BigInt(vault.pricePerShareWad) >= 10n ** 18n ? 'positive' : 'negative'}
            sub={`high-water ${formatWad(vault.hwmWad)}`}
          />
        </Card>

        <Card className="p-5">
          <Metric
            label="Loss floor"
            value={formatWad(vault.floorWad)}
            tone={BigInt(vault.pricePerShareWad) < BigInt(vault.floorWad) ? 'negative' : 'neutral'}
            sub={`${(vault.mandate.maxDrawdownBps / 100).toFixed(0)}% below the high-water mark`}
          />
        </Card>

        <Card className="p-5">
          <Metric
            label="Bond available"
            value={formatAmount(vault.bondAvailable, dec, { maxFractionDigits: 0 })}
            tone="positive"
            sub={
              BigInt(vault.bondSlashed) > 0n
                ? `${formatAmount(vault.bondSlashed, dec, { maxFractionDigits: 0 })} already paid out`
                : `of ${formatAmount(vault.bondStaked, dec, { maxFractionDigits: 0 })} staked`
            }
          />
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Chip tone={vault.staticViolations > 0 ? 'negative' : 'positive'}>
          Violations {vault.staticViolations}/2
        </Chip>
        <Chip tone={vault.strikes > 0 ? 'warn' : 'neutral'}>Strikes {vault.strikes}/3</Chip>
        <Chip>{timeLeft ? `Expires in ${timeLeft}` : 'Term ended'}</Chip>
        <Chip>Mandate {shortAddress(vault.mandateHash, 6)}</Chip>
      </div>

      {/* ── chart + stream ─────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold">NAV per share vs the loss floor</h2>
            {nav ? (
              <NavChart series={nav} />
            ) : (
              <p className="text-sm text-[var(--ink-3)]">No NAV data yet.</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold">Positions</h2>
            {vault.positions.length === 0 ? (
              <p className="text-sm text-[var(--ink-3)]">
                Holding only {sym}. Nothing at market risk right now.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
                    <th className="pb-2">Asset</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2 w-[45%]">Exposure vs cap</th>
                  </tr>
                </thead>
                <tbody>
                  {vault.positions.map((p) => (
                    <tr key={p.asset} className="border-b border-[var(--line)] last:border-0">
                      <td className="py-2.5 font-medium">{p.symbol || shortAddress(p.asset)}</td>
                      <td className="py-2.5 font-mono text-[13px]">
                        {formatAmount(p.amount, 18, { maxFractionDigits: 4 })}
                      </td>
                      <td className="py-2.5">
                        <ExposureBar bps={p.exposureBps} capBps={vault.mandate.maxAssetExposureBps} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <Card className="flex flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold">Live intent stream</h2>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--green)]" aria-hidden />
              live
            </span>
          </div>
          <div className="max-h-[720px] overflow-y-auto">
            <IntentStream
              initial={intents?.intents ?? []}
              vault={vault.address}
              chainId={vault.chainId}
              settlementSymbol={sym}
              settlementDecimals={dec}
            />
          </div>
        </Card>
      </div>

      {/* ── mandate in plain English ───────────────────────────────────── */}
      <Card className="mt-6 p-5">
        <h2 className="mb-3 text-sm font-semibold">What this agent is allowed to do</h2>
        <ul className="grid gap-2 text-[13px] leading-relaxed text-[var(--ink-2)] sm:grid-cols-2">
          {vault.mandateEnglish.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--green)]" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/**
 * The banner states.
 *
 * Each one answers the only question a depositor has in that state — "is my money moving, and what
 * happens next" — rather than just naming the state. A FROZEN badge alone tells someone their funds
 * are stuck without telling them anything is being done about it.
 */
function StateBanner({
  vault,
  incidentId,
}: {
  vault: NonNullable<Awaited<ReturnType<typeof api.vault>>>;
  incidentId: number | null;
}) {
  const reasons = ['', 'repeated mandate breaches', 'a drawdown through the floor', 'failing to settle on time', 'a guardian halt'];

  if (vault.state === 3 || vault.state === 4) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[var(--radius)] bg-[var(--black)] px-5 py-4 text-sm text-white">
        <Snowflake size={16} className="text-[var(--green)]" />
        <span>
          <strong className="font-semibold">Agent frozen</strong> after{' '}
          {reasons[vault.freezeReason] ?? 'a halt'}. Positions are being unwound to{' '}
          {vault.settlementSymbol} and depositors can withdraw once it settles.
        </span>
        {incidentId ? (
          <Link
            href={`/incidents/${incidentId}`}
            className="ml-auto rounded-[var(--radius-pill)] bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25"
          >
            See what happened →
          </Link>
        ) : null}
      </div>
    );
  }

  if (vault.state === 2) {
    const left = countdown(vault.frozenAt + 120);
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[var(--radius)] bg-[var(--warn-tint)] px-5 py-4 text-sm">
        <AlertTriangle size={16} className="text-[var(--warn)]" />
        <span>
          <strong className="font-semibold">Cooling off.</strong> The agent hit its limits three times
          in a row, so new trades are paused{left ? ` for ${left}` : ''}. Nothing was slashed — these
          were rejections, not misconduct.
        </span>
      </div>
    );
  }

  if (vault.state === 6) {
    return (
      <div className="mt-5 rounded-[var(--radius)] bg-[var(--bg-muted)] px-5 py-4 text-sm text-[var(--ink-2)]">
        <strong className="font-semibold">Settled.</strong> Everything is back in{' '}
        {vault.settlementSymbol} and every share is redeemable in full.
        {incidentId ? (
          <Link href={`/incidents/${incidentId}`} className="ml-2 underline decoration-[var(--green)] decoration-2 underline-offset-2">
            Incident replay
          </Link>
        ) : null}
      </div>
    );
  }

  return null;
}
