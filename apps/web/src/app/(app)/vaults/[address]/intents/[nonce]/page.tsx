import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, ExternalLink, Minus, X } from 'lucide-react';
import { Chip, Eyebrow, cn, formatAmount, shortAddress } from '@velanos/ui';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

const KIND_NAMES = ['SPOT BUY', 'SPOT SELL', 'PERP OPEN', 'PERP CLOSE'] as const;

/**
 * The pre-flight inspector: one intent, every rule, the actual value against the limit.
 *
 * This is the screen that makes the protocol auditable rather than merely claimed. A judge can open
 * any intent and see the full ordered checklist the contract evaluated — not a summary of it, and not
 * a cached copy, but the same `explain()` output recomputed from live chain state.
 */
export default async function InspectorPage({
  params,
}: {
  params: Promise<{ address: string; nonce: string }>;
}) {
  const { address, nonce } = await params;

  const vault = await api.vault(address);
  if (!vault) notFound();

  const detail = await api.intent(vault.chainId, address, nonce);

  if (!detail) {
    return (
      <div className="content-width py-10">
        <BackLink address={address} name={vault.name} />
        <div className="mt-6 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-8">
          <h1 className="text-[1.25rem] font-medium tracking-[-0.01em]">
            This intent&rsquo;s body was not captured
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink-3)]">
            The checklist is recomputed from the signed intent, so it needs the full body. Only intents
            that went through the relay or the public evidence feed carry it; one submitted straight to
            the vault leaves just its on-chain events behind.
          </p>
        </div>
      </div>
    );
  }

  const statics = detail.checks.filter((c) => c.ruleId < 200);
  const statefuls = detail.checks.filter((c) => c.ruleId >= 200);
  const intent = detail.intent;
  const dec = vault.settlementDecimals;

  return (
    <div className="content-width py-10">
      <BackLink address={address} name={vault.name} />

      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div>
          <Eyebrow>Pre-flight inspector</Eyebrow>
          <h1 className="text-h1 mt-3">
            {KIND_NAMES[Number(intent.kind)] ?? 'Trade'}{' '}
            <span className="text-[var(--ink-3)]">
              {formatAmount(String(intent.amountIn), dec, {
                maxFractionDigits: 2,
                symbol: vault.settlementSymbol,
              })}
            </span>
          </h1>
          <p className="mt-2 font-mono text-[12px] text-[var(--ink-3)]">nonce {detail.nonce}</p>
        </div>
        <Outcome detail={detail} decimals={dec} symbol={vault.settlementSymbol} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.35fr] lg:items-start">
        {/* ── the intent itself ───────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-6">
            <Eyebrow className="mb-5">The signed intent</Eyebrow>
            <dl className="space-y-2 text-[13px]">
              <Field label="Kind" value={KIND_NAMES[Number(intent.kind)] ?? '—'} />
              <Field label="Asset in" value={shortAddress(String(intent.assetIn), 6)} mono />
              <Field label="Asset out" value={shortAddress(String(intent.assetOut), 6)} mono />
              <Field
                label="Amount in"
                value={formatAmount(String(intent.amountIn), dec, { maxFractionDigits: 4 })}
                mono
              />
              <Field label="Leverage" value={`${Number(intent.leverageBps) / 10_000}x`} mono />
              <Field label="Nonce" value={String(intent.nonce)} mono />
              <Field label="Issued at" value={String(intent.issuedAt)} mono />
              <Field label="Deadline" value={String(intent.deadline)} mono />
            </dl>

            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Signer
                <Check size={12} className="text-[var(--green-ink)]" />
                <span className="font-normal normal-case tracking-normal text-[var(--green-ink)]">
                  verified
                </span>
              </p>
              <p className="mt-1 break-all font-mono text-[11px]">{detail.signer}</p>

              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
                EIP-712 digest
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-[var(--ink-2)]">
                {detail.digest}
              </p>
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
                The domain binds this signature to this vault on this chain, so it is inert anywhere
                else.
              </p>
            </div>
          </div>

          {detail.rationale ? (
            <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-6">
              <Eyebrow>Why the agent said it did this</Eyebrow>
              <blockquote className="mt-2 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] px-3 py-2.5 text-[13px] italic leading-relaxed text-[var(--ink-2)]">
                &ldquo;{detail.rationale.text}&rdquo;
              </blockquote>
              <p className="mt-2 font-mono text-[10px] text-[var(--ink-3)]">
                {detail.rationale.model}
                {detail.rationale.profile ? ` · profile ${detail.rationale.profile}` : ''}
              </p>
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
                The hash of this text is committed on-chain alongside the signature, so it cannot be
                rewritten after the fact.
              </p>
            </div>
          ) : null}
        </div>

        {/* ── the checklist ───────────────────────────────────────────── */}
        <div className="space-y-4">
          <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] px-5 py-3">
              <Eyebrow>Static rules</Eyebrow>
              <span className="text-[12px] text-[var(--ink-3)]">
                checkable before signing · slashable
              </span>
            </header>
            <CheckList checks={statics} failing={detail.ruleId} />
          </section>

          <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] px-5 py-3">
              <Eyebrow>Stateful rules</Eyebrow>
              <span className="text-[12px] text-[var(--ink-3)]">
                depend on live state · never slashable
              </span>
            </header>
            <CheckList checks={statefuls} failing={detail.ruleId} />
          </section>
        </div>
      </div>
    </div>
  );
}

function BackLink({ address, name }: { address: string; name: string }) {
  return (
    <Link
      href={`/vaults/${address}`}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink)]"
    >
      <ArrowLeft size={14} /> {name}
    </Link>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[var(--ink-3)]">{label}</dt>
      <dd className={cn('text-right', mono && 'font-mono text-[12px]')}>{value}</dd>
    </div>
  );
}

/**
 * Each row shows actual against limit, which is what turns "rejected" into an explanation.
 *
 * The rule that actually decided the outcome is highlighted, because `explain()` deliberately keeps
 * evaluating after the first failure — useful for a full picture, confusing if the reader cannot tell
 * which red line was the operative one.
 */
function CheckList({
  checks,
  failing,
}: {
  checks: Awaited<ReturnType<typeof api.intent>> extends infer T
    ? T extends { checks: infer C }
      ? C
      : never
    : never;
  failing: number | null;
}) {
  return (
    <ul className="divide-y divide-[var(--line)]">
      {checks.map((check) => {
        const decisive = check.ruleId === failing;
        return (
          <li
            key={check.ruleId}
            className={cn(
              'flex items-start gap-3 px-5 py-3',
              decisive && 'bg-[var(--loss-tint)]',
            )}
          >
            <span className="mt-0.5 shrink-0">
              {check.passed ? (
                <Check size={15} className="text-[var(--green-ink)]" strokeWidth={2.5} />
              ) : check.rule?.slashable ? (
                <X size={15} className="text-[var(--loss)]" strokeWidth={2.5} />
              ) : (
                <Minus size={15} className="text-[var(--warn)]" strokeWidth={2.5} />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-[11px] font-bold text-[var(--ink-3)]">
                  {check.ruleId}
                </span>
                <span className="text-[13px] font-medium">{check.rule?.title ?? 'Rule'}</span>
                {decisive ? (
                  <Chip tone="negative" className="text-[9px]">
                    decided the outcome
                  </Chip>
                ) : null}
                {check.rule?.slashable && !check.passed && !decisive ? (
                  <Chip tone="negative" className="text-[9px]">
                    slashable
                  </Chip>
                ) : null}
              </div>

              {!check.passed ? (
                <p className="mt-1 font-mono text-[11px] text-[var(--ink-2)]">
                  actual {trim(check.actual)} · limit {trim(check.limit)}
                </p>
              ) : null}

              {decisive && check.rule ? (
                <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink-2)]">
                  {check.rule.description}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Outcome({
  detail,
  decimals,
  symbol,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof api.intent>>>;
  decimals: number;
  symbol: string;
}) {
  if (detail.slashed || detail.status === 'slashed') {
    return (
      <div className="rounded-[var(--radius)] bg-[var(--loss)] px-5 py-3 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Slashed</p>
        <p className="mt-0.5 font-mono text-xl font-semibold">
          {detail.slash
            ? formatAmount(detail.slash.penaltyPaid, decimals, { maxFractionDigits: 2, symbol })
            : '—'}
        </p>
        {detail.slash ? (
          <p className="mt-0.5 text-[11px] opacity-90">
            {formatAmount(
              (BigInt(detail.slash.penaltyPaid) - BigInt(detail.slash.bountyPaid)).toString(),
              decimals,
              { maxFractionDigits: 2 },
            )}{' '}
            to depositors ·{' '}
            {formatAmount(detail.slash.bountyPaid, decimals, { maxFractionDigits: 2 })} bounty
          </p>
        ) : null}
        {detail.slash?.txUrl ? (
          <a
            href={detail.slash.txUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] underline underline-offset-2"
          >
            transaction <ExternalLink size={9} />
          </a>
        ) : null}
      </div>
    );
  }

  if (detail.status === 'executed') {
    return (
      <div className="rounded-[var(--radius)] bg-[var(--green-tint)] px-5 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--green-ink)]">
          Executed
        </p>
        <p className="mt-0.5 text-[13px] text-[var(--ink-2)]">Every check passed.</p>
        {detail.txUrl ? (
          <a
            href={detail.txUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-[var(--green-ink)] underline underline-offset-2"
          >
            transaction <ExternalLink size={9} />
          </a>
        ) : null}
      </div>
    );
  }

  if (detail.status === 'published') {
    return (
      <div className="rounded-[var(--radius)] bg-[var(--black)] px-5 py-3 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--green)]">
          Refused and published
        </p>
        <p className="mt-0.5 max-w-xs text-[12px] leading-snug text-[var(--on-black-2)]">
          The relay would not submit this. The signature is public evidence and anyone can report it.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius)] bg-[var(--warn-tint)] px-5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Rejected, not slashed</p>
      <p className="mt-0.5 max-w-xs text-[12px] leading-snug text-[var(--ink-2)]">
        Blocked on live state the agent could not fully predict. The bond was untouched.
      </p>
    </div>
  );
}

/** Huge bigint strings are unreadable raw; anything past 12 digits gets exponent notation. */
function trim(value: string): string {
  if (value.length <= 12) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n.toExponential(3) : `${value.slice(0, 12)}…`;
}
