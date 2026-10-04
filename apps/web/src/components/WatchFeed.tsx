'use client';

import { useState } from 'react';
import { ExternalLink, Gavel } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi';
import { violationCourtAbi } from '@velanos/config';
import { Button, Card, Chip, RulePill, formatAmount, relativeTime, shortAddress } from '@velanos/ui';
import { CHAIN_SHORT, type FeedEntry } from '@/lib/api';
import { asWalletChain } from '@/lib/wagmi';

/**
 * The reporting surface.
 *
 * Reporting is a wallet transaction from the reader's own address, not an API call we make on their
 * behalf — the bounty goes to whoever sends it, so it has to be them. The court re-derives the verdict
 * from the signature, so clicking this button cannot grief an innocent agent even if someone wanted to.
 */
export function WatchFeed({ entries }: { entries: FeedEntry[] }) {
  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <FeedRow key={`${entry.chainId}-${entry.vault}-${entry.nonce}`} entry={entry} />
      ))}
    </ul>
  );
}

function FeedRow({ entry }: { entry: FeedEntry }) {
  const { isConnected } = useAccount();
  const connectedChain = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const [done, setDone] = useState(entry.reported);

  const chainId = asWalletChain(entry.chainId);
  const wrongChain = isConnected && chainId !== undefined && connectedChain !== chainId;

  // Supplied by the indexer from the deployment file, so this component never carries an address
  // literal of its own.
  const courtAddress = entry.courtAddress as `0x${string}` | null;

  async function report() {
    if (!chainId) return;
    try {
      if (!courtAddress) return;
      const hash = await writeContractAsync({
        address: courtAddress,
        abi: violationCourtAbi,
        functionName: 'reportSignedViolation',
        args: [entry.intent as never, entry.signature],
        chainId,
      });
      setDone(true);
      toast.success('Violation reported', { description: `${hash.slice(0, 18)}…` });

      await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId: entry.chainId, vault: entry.vault, nonce: entry.nonce, txHash: hash }),
      }).catch(() => undefined);
    } catch (e) {
      toast.error('Could not report', {
        description: ((e as Error).message.split('\n')[0] ?? '').slice(0, 120),
      });
    }
  }

  return (
    <li>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <RulePill ruleId={entry.ruleId} title={entry.rule.title} slashable={entry.slashable} />
              <Chip>{CHAIN_SHORT[entry.chainId] ?? entry.chainId}</Chip>
              <span className="font-mono text-[11px] text-[var(--ink-3)]">
                nonce {entry.nonce} · {relativeTime(entry.ts)}
              </span>
            </div>

            <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
              {entry.rule.description}
            </p>

            <p className="mt-2 flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-[var(--ink-3)]">
              <span>vault {shortAddress(entry.vault, 6)}</span>
              <span>
                amount{' '}
                {formatAmount(String(entry.intent.amountIn ?? '0'), 6, { maxFractionDigits: 2 })}
              </span>
              <span>sig {entry.signature.slice(0, 18)}…</span>
            </p>
          </div>

          <div className="shrink-0">
            {done ? (
              <div className="text-right">
                <Chip tone="positive">Reported</Chip>
                {entry.reportedTxUrl ? (
                  <a
                    href={entry.reportedTxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 flex items-center justify-end gap-1 font-mono text-[10px] text-[var(--ink-3)] hover:text-[var(--ink)]"
                  >
                    tx <ExternalLink size={9} />
                  </a>
                ) : null}
              </div>
            ) : !isConnected ? (
              <p className="max-w-[180px] text-right text-[12px] text-[var(--ink-3)]">
                Connect a wallet to claim the bounty on this.
              </p>
            ) : wrongChain ? (
              <Button variant="secondary" onClick={() => chainId && switchChain({ chainId })}>
                Switch network
              </Button>
            ) : !courtAddress ? (
              <p className="max-w-[200px] text-right text-[12px] text-[var(--ink-3)]">
                The watcher bot claims these automatically within a few seconds.
              </p>
            ) : (
              <Button onClick={report} disabled={isPending}>
                <Gavel size={14} /> {isPending ? 'Reporting…' : 'Report and claim'}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}
