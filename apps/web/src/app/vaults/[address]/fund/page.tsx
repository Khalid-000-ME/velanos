import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, X } from 'lucide-react';
import { Card, Chip, formatAmount, formatBps, formatWad } from '@aegis/ui';
import { DepositPanel } from '@/components/DepositPanel';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

const COVERED = [
  'Trades outside the mandate',
  'Oversized or over-leveraged orders',
  'Acting after freeze or expiry',
  'Losses beyond the drawdown floor (up to bond size)',
  'Failure to settle at expiry',
];

const NOT_COVERED = ['Losses within the drawdown limit', 'Strategy underperformance'];

/**
 * The fund screen, built around the worst case rather than the upside.
 *
 * The large figure on this page is the loss floor, not a projected return. A depositor deciding
 * whether to hand money to an autonomous agent is asking "how bad can this get", and answering that
 * honestly — including the part of the downside the bond cannot cover — is the only way the floor is
 * worth anything as a promise.
 */
export default async function FundPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const vault = await api.vault(address);
  if (!vault) notFound();

  const dec = vault.settlementDecimals;
  const sym = vault.settlementSymbol;
  const ddBps = vault.mandate.maxDrawdownBps;

  const maxAllocation = BigInt(vault.mandate.maxAllocation);
  const bond = BigInt(vault.bondAvailable);
  // The deepest hole the floor promises to fill, if the vault were full and fell straight to it.
  const maxShortfall = (maxAllocation * BigInt(ddBps)) / 10_000n;
  const fullyBacked = bond >= maxShortfall;
  const unbacked = fullyBacked ? 0n : maxShortfall - bond;

  const acceptsDeposits = vault.state === 1 || vault.state === 2;

  return (
    <div className="content-width pt-8">
      <Link
        href={`/vaults/${address}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink)]"
      >
        <ArrowLeft size={14} /> {vault.name}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em]">Fund {vault.name}</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.05fr] lg:items-start">
        <DepositPanel
          vault={vault.address}
          chainId={vault.chainId}
          settlementAsset={vault.mandate.settlementAsset}
          settlementSymbol={sym}
          settlementDecimals={dec}
          acceptsDeposits={acceptsDeposits}
          pricePerShareWad={vault.pricePerShareWad}
        />

        <div className="space-y-4">
          {/* ── the worst case, in black ─────────────────────────────── */}
          <Card dark className="p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--on-black-2)]">
              If things go wrong
            </p>
            <p className="mt-3 text-[22px] font-semibold leading-snug tracking-[-0.01em]">
              Your loss is capped at {formatBps(ddBps)} of the high-water mark — backed by{' '}
              <span className="text-[var(--green)]">
                {formatAmount(vault.bondAvailable, dec, { maxFractionDigits: 0, symbol: sym })}
              </span>{' '}
              of the agent&rsquo;s own money.
            </p>

            <dl className="mt-5 grid gap-4 border-t border-white/15 pt-4 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.06em] text-[var(--on-black-2)]">
                  Floor per share
                </dt>
                <dd className="mt-1 font-mono text-lg font-semibold">{formatWad(vault.floorWad)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.06em] text-[var(--on-black-2)]">
                  Bond coverage
                </dt>
                <dd className="mt-1 font-mono text-lg font-semibold">
                  {fullyBacked ? (
                    <span className="text-[var(--green)]">Fully backed</span>
                  ) : (
                    <span className="text-[var(--warn)]">
                      {((Number(bond) / Number(maxShortfall)) * 100).toFixed(0)}%
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            {!fullyBacked ? (
              <p className="mt-4 rounded-[var(--radius-sm)] bg-[var(--loss)]/20 px-3 py-2.5 text-[12px] leading-relaxed text-white">
                If this vault filled to its {formatAmount(maxAllocation.toString(), dec, { maxFractionDigits: 0 })}{' '}
                cap and fell straight to the floor, the bond would be short by{' '}
                <strong className="font-semibold">
                  {formatAmount(unbacked.toString(), dec, { maxFractionDigits: 0, symbol: sym })}
                </strong>
                . That remainder would stay with depositors. We would rather you knew now.
              </p>
            ) : (
              <p className="mt-4 text-[12px] leading-relaxed text-[var(--on-black-2)]">
                The bond currently covers the full distance to the floor even if this vault filled to
                its cap.
              </p>
            )}
          </Card>

          {/* ── covered / not covered ────────────────────────────────── */}
          <Card className="p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold">Covered</h2>
                <ul className="mt-2 space-y-1.5">
                  {COVERED.map((item) => (
                    <li key={item} className="flex gap-2 text-[13px] leading-snug text-[var(--ink-2)]">
                      <Check size={14} className="mt-0.5 shrink-0 text-[var(--green-ink)]" strokeWidth={2.5} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="text-sm font-semibold">Not covered</h2>
                <ul className="mt-2 space-y-1.5">
                  {NOT_COVERED.map((item) => (
                    <li key={item} className="flex gap-2 text-[13px] leading-snug text-[var(--ink-3)]">
                      <X size={14} className="mt-0.5 shrink-0 text-[var(--ink-3)]" strokeWidth={2.5} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          {/* ── the mandate ──────────────────────────────────────────── */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">The mandate you are agreeing to</h2>
              <Chip>Immutable</Chip>
            </div>
            <ul className="mt-3 space-y-1.5">
              {vault.mandateEnglish.map((line) => (
                <li key={line} className="flex gap-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--green)]" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-[var(--line)] pt-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
              These terms were fixed when the vault was created and cannot be changed. New terms
              require a new vault with a new bond.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
