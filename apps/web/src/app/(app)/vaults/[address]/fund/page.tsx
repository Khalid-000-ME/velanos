import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, X } from 'lucide-react';
import {
  Chip,
  Eyebrow,
  HairlineCell,
  HairlineGrid,
  formatAmount,
  formatBps,
  formatWad,
} from '@velanos/ui';
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
    <div className="content-width py-10">
      <Link
        href={`/vaults/${address}`}
        className="inline-flex items-center gap-1.5 text-[14px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
      >
        <ArrowLeft size={14} /> {vault.name}
      </Link>

      <Eyebrow className="mt-6">Deposit</Eyebrow>
      <h1 className="text-h1 mt-3">Fund {vault.name}</h1>

      {/* The deposit card is far shorter than the disclosure beside it, so it sticks rather than
          stranding half a screen of empty column. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.05fr] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <DepositPanel
            vault={vault.address}
            chainId={vault.chainId}
            settlementAsset={vault.mandate.settlementAsset}
            settlementSymbol={sym}
            settlementDecimals={dec}
            acceptsDeposits={acceptsDeposits}
            pricePerShareWad={vault.pricePerShareWad}
          />
        </div>

        <div className="space-y-4">
          {/* ── the worst case, in black ─────────────────────────────── */}
          <div className="relative overflow-hidden rounded-[var(--radius)] bg-[var(--black)] p-7 text-[var(--on-black)]">
            <div className="grid-field pointer-events-none absolute inset-0 opacity-40" aria-hidden />
            <div className="relative">
            <Eyebrow tone="onBlack">If things go wrong</Eyebrow>
            <p className="mt-5 text-[1.375rem] font-medium leading-snug tracking-[-0.02em]">
              Your loss is capped at {formatBps(ddBps)} of the high-water mark — backed by{' '}
              <span className="text-[var(--green-on-black)]">
                {formatAmount(vault.bondAvailable, dec, { maxFractionDigits: 0, symbol: sym })}
              </span>{' '}
              of the agent&rsquo;s own money.
            </p>

            <dl className="mt-7 grid gap-5 border-t border-[var(--line-on-black)] pt-5 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--on-black-2)]">
                  Floor per share
                </dt>
                <dd className="mt-2 text-[1.5rem] font-medium leading-none tracking-[-0.03em] tabular-nums">
                  {formatWad(vault.floorWad)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--on-black-2)]">
                  Bond coverage
                </dt>
                <dd className="mt-2 text-[1.5rem] font-medium leading-none tracking-[-0.03em] tabular-nums">
                  {fullyBacked ? (
                    <span className="text-[var(--green-on-black)]">Full</span>
                  ) : (
                    <span className="text-[var(--warn)]">
                      {((Number(bond) / Number(maxShortfall)) * 100).toFixed(0)}%
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            {!fullyBacked ? (
              <p className="mt-6 rounded-[var(--radius-sm)] border border-[var(--loss)]/30 bg-[var(--loss)]/10 px-4 py-3 text-[13px] leading-relaxed text-white">
                If this vault filled to its {formatAmount(maxAllocation.toString(), dec, { maxFractionDigits: 0 })}{' '}
                cap and fell straight to the floor, the bond would be short by{' '}
                <strong className="font-semibold">
                  {formatAmount(unbacked.toString(), dec, { maxFractionDigits: 0, symbol: sym })}
                </strong>
                . That remainder would stay with depositors. We would rather you knew now.
              </p>
            ) : (
              <p className="mt-6 text-[13px] leading-relaxed text-[var(--on-black-2)]">
                The bond currently covers the full distance to the floor even if this vault filled to
                its cap.
              </p>
            )}
            </div>
          </div>

          {/* ── covered / not covered ────────────────────────────────── */}
          <HairlineGrid columns={2}>
            <HairlineCell className="p-6">
              <div>
                <Eyebrow tone="green">Covered</Eyebrow>
                <ul className="mt-4 space-y-2.5">
                  {COVERED.map((item) => (
                    <li key={item} className="flex gap-2.5 text-[14px] leading-snug text-[var(--ink-2)]">
                      <Check size={14} className="mt-1 shrink-0 text-[var(--green-ink)]" strokeWidth={2.25} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </HairlineCell>
            <HairlineCell className="p-6">
              <div>
                <Eyebrow>Not covered</Eyebrow>
                <ul className="mt-4 space-y-2.5">
                  {NOT_COVERED.map((item) => (
                    <li key={item} className="flex gap-2.5 text-[14px] leading-snug text-[var(--ink-3)]">
                      <X size={14} className="mt-1 shrink-0 text-[var(--ink-3)]" strokeWidth={2.25} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </HairlineCell>
          </HairlineGrid>

          {/* ── the mandate ──────────────────────────────────────────── */}
          <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-6">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>The mandate you are agreeing to</Eyebrow>
              <Chip>Immutable</Chip>
            </div>
            <ul className="mt-5 space-y-2.5">
              {vault.mandateEnglish.map((line) => (
                <li key={line} className="flex gap-2.5 text-[14px] leading-relaxed text-[var(--ink-2)]">
                  <span className="mt-[9px] size-1 shrink-0 rounded-full bg-[var(--green)]" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-[var(--line)] pt-4 text-[13px] leading-relaxed text-[var(--ink-3)]">
              These terms were fixed when the vault was created and cannot be changed. New terms
              require a new vault with a new bond.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
