'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { RulePill, cn, formatAmount, formatTime } from '@velanos/ui';
import { browserApi, type IntentRow } from '@/lib/api';

/**
 * The live feed of what the agent is doing, colour-coded by outcome.
 *
 * Green executed, amber rejected, red-orange slashed. The rationale is expandable on every row,
 * because the interesting thing about an agent is not that it traded but what it claimed it was
 * thinking — and whether the signature next to that claim broke a rule.
 */
export function IntentStream({
  initial,
  vault,
  chainId,
  settlementSymbol,
  settlementDecimals,
}: {
  initial: IntentRow[];
  vault: string;
  chainId: number;
  settlementSymbol: string;
  settlementDecimals: number;
}) {
  const [rows, setRows] = useState(initial);

  // SSE rather than polling: a slash should appear while the judge is looking at the screen, not on
  // the next interval. Any event for this vault triggers a refetch of the authoritative list, so the
  // stream never becomes a second source of truth for what happened.
  //
  // A slow poll runs underneath it. Some tunnels — ngrok's free tier among them — buffer a response
  // body, so the event stream opens and then delivers nothing; without this the feed would silently
  // sit still for the whole demo. When SSE works the poll costs one small request every few seconds.
  useEffect(() => {
    const source = new EventSource(`${browserApi}/events`);

    const refresh = async () => {
      try {
        const res = await fetch(`${browserApi}/vaults/${vault}/intents?limit=50`);
        if (res.ok) setRows(((await res.json()) as { intents: IntentRow[] }).intents);
      } catch {
        /* the next event will try again */
      }
    };

    const onEvent = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as { vault?: string };
        if (!payload.vault || payload.vault.toLowerCase() === vault.toLowerCase()) void refresh();
      } catch {
        /* ignore malformed frames */
      }
    };

    for (const type of [
      'IntentExecuted',
      'IntentRejected',
      'IntentIgnored',
      'ViolationReported',
      'RelaySubmitted',
      'FeedIntentPublished',
    ]) {
      source.addEventListener(type, onEvent);
    }

    const poll = setInterval(refresh, 5_000);

    return () => {
      clearInterval(poll);
      source.close();
    };
  }, [vault]);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-[var(--ink-3)]">
        No intents yet. Run a scenario from the operator console.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--line)]">
      {rows.map((row) => (
        <Row
          key={`${row.nonce}-${row.id}`}
          row={row}
          chainId={chainId}
          vault={vault}
          settlementSymbol={settlementSymbol}
          settlementDecimals={settlementDecimals}
        />
      ))}
    </ul>
  );
}

const KIND_VERBS = ['BUY', 'SELL', 'OPEN', 'CLOSE'] as const;

function Row({
  row,
  chainId,
  vault,
  settlementSymbol,
  settlementDecimals,
}: {
  row: IntentRow;
  chainId: number;
  vault: string;
  settlementSymbol: string;
  settlementDecimals: number;
}) {
  const [open, setOpen] = useState(false);

  const dot =
    row.status === 'executed'
      ? 'bg-[var(--green)]'
      : row.status === 'slashed'
        ? 'bg-[var(--loss)]'
        : 'bg-[var(--warn)]';

  const verb = row.kind !== null ? KIND_VERBS[row.kind] : '—';
  const amount =
    row.amountIn && (row.kind === 0 || row.kind === 2)
      ? formatAmount(row.amountIn, settlementDecimals, { maxFractionDigits: 0 })
      : null;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', dot)} aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs text-[var(--ink-3)]">{formatTime(row.ts)}</span>
            <span className="text-[13px] font-medium">
              {verb} {row.assetSymbol ?? ''}
              {amount ? ` ${amount} ${settlementSymbol}` : ''}
            </span>

            {row.status === 'slashed' ? (
              <span className="rounded-[var(--radius-sm)] bg-[var(--loss)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Slashed
              </span>
            ) : null}
            {row.ruleId && row.status !== 'slashed' ? (
              <span className="rounded-[var(--radius-sm)] bg-[var(--warn-tint)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-2)]">
                Rejected
              </span>
            ) : null}
            {row.route === 'relay' ? (
              <span className="font-mono text-[10px] text-[var(--ink-3)]">relay</span>
            ) : null}
          </div>

          {row.ruleId ? (
            <div className="mt-1.5">
              <RulePill ruleId={row.ruleId} title={ruleTitle(row.ruleId)} slashable={row.slashed} />
            </div>
          ) : null}

          {row.rationale ? (
            <div className="mt-1.5">
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-start gap-1 text-left text-[12px] leading-relaxed text-[var(--ink-3)] hover:text-[var(--ink-2)]"
              >
                <ChevronDown
                  size={12}
                  className={cn('mt-1 shrink-0 transition-transform', open && 'rotate-180')}
                />
                <span className={open ? '' : 'line-clamp-1'}>{row.rationale}</span>
              </button>
              {open && row.profile ? (
                <p className="mt-1 pl-4 font-mono text-[10px] text-[var(--ink-3)]">
                  profile {row.profile} · {row.model}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-1.5 flex items-center gap-3">
            <Link
              href={`/vaults/${vault}/intents/${row.nonce}`}
              className="text-[11px] font-medium underline decoration-[var(--green)] decoration-2 underline-offset-2"
            >
              Inspect checks
            </Link>
            {row.txUrl ? (
              <a
                href={row.txUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-3)] hover:text-[var(--ink)]"
              >
                tx <ExternalLink size={10} />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/** Minimal local titles so a feed row does not need the whole rule table shipped to the client. */
const RULE_TITLES: Record<number, string> = {
  101: 'Asset not in mandate',
  102: 'Venue not in mandate',
  103: 'Trade larger than the cap',
  104: 'Leverage above the limit',
  105: 'Signed outside the term',
  106: 'Signed after freeze',
  107: 'Validity window too long',
  108: 'Wrong instrument',
  201: 'Would breach the exposure cap',
  202: 'Price worse than the slippage limit',
  203: 'Daily loss budget spent',
  204: 'Intent expired',
  205: 'Not enough balance',
  206: 'Vault not accepting trades',
  207: 'Venue rejected the order',
  301: 'Signature does not match',
  302: 'Nonce already resolved',
  303: 'Wrong vault or chain',
};

function ruleTitle(ruleId: number): string {
  return RULE_TITLES[ruleId] ?? 'Rule';
}
