'use client';

import { useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useChainId, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { toast } from 'sonner';
import { velanosVaultAbi, mockUsdgAbi } from '@velanos/config';
import { Button, Card, formatAmount } from '@velanos/ui';
import { asWalletChain } from '@/lib/wagmi';

/**
 * Approve, then deposit.
 *
 * Two transactions rather than one, surfaced as two visible steps: an ERC-20 approval is a thing the
 * depositor is actually doing, and hiding it behind a single "Deposit" button that prompts twice is
 * how wallets get abandoned mid-flow.
 *
 * The faucet is here too, because a judge should be able to fund a vault themselves rather than
 * taking our word for the numbers.
 */
export function DepositPanel({
  vault,
  chainId: rawChainId,
  settlementAsset,
  settlementSymbol,
  settlementDecimals,
  acceptsDeposits,
  pricePerShareWad,
}: {
  vault: string;
  chainId: number;
  settlementAsset: string;
  settlementSymbol: string;
  settlementDecimals: number;
  acceptsDeposits: boolean;
  pricePerShareWad: string;
}) {
  const chainId = asWalletChain(rawChainId);
  const { address, isConnected } = useAccount();
  const connectedChain = useChainId();
  const { switchChain } = useSwitchChain();
  const [amount, setAmount] = useState('');

  const wrongChain = isConnected && chainId !== undefined && connectedChain !== chainId;

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: settlementAsset as `0x${string}`,
    abi: mockUsdgAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(address) && chainId !== undefined },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: settlementAsset as `0x${string}`,
    abi: mockUsdgAbi,
    functionName: 'allowance',
    args: address ? [address, vault as `0x${string}`] : undefined,
    chainId,
    query: { enabled: Boolean(address) && chainId !== undefined },
  });

  const { data: maxDeposit } = useReadContract({
    address: vault as `0x${string}`,
    abi: velanosVaultAbi,
    functionName: 'maxDeposit',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: Boolean(address) && chainId !== undefined },
  });

  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash, chainId });

  let parsed = 0n;
  try {
    parsed = amount ? parseUnits(amount, settlementDecimals) : 0n;
  } catch {
    parsed = 0n;
  }

  const needsApproval = parsed > 0n && (allowance === undefined || (allowance as bigint) < parsed);
  const overCap = maxDeposit !== undefined && parsed > (maxDeposit as bigint);
  const overBalance = balance !== undefined && parsed > (balance as bigint);

  const sharePreview =
    parsed > 0n && BigInt(pricePerShareWad) > 0n
      ? (parsed * 10n ** 18n) / BigInt(pricePerShareWad)
      : 0n;

  async function run(label: string, fn: () => Promise<`0x${string}`>) {
    try {
      const hash = await fn();
      setTxHash(hash);
      toast.success(`${label} submitted`, { description: `${hash.slice(0, 18)}…` });
      // Refresh the reads that gate the next step rather than waiting for a page revalidate.
      setTimeout(() => {
        void refetchAllowance();
        void refetchBalance();
      }, 3_000);
    } catch (e) {
      const msg = (e as Error).message.split('\n')[0] ?? 'rejected';
      toast.error(`${label} failed`, { description: msg.slice(0, 120) });
    }
  }

  if (chainId === undefined) {
    return (
      <Card className="p-6">
        <h2 className="text-sm font-semibold">Deposit {settlementSymbol}</h2>
        <p className="mt-3 rounded-[var(--radius-sm)] bg-[var(--warn-tint)] px-3 py-2.5 text-[13px] text-[var(--ink-2)]">
          This vault lives on chain {rawChainId}, which this app is not configured to transact on. You
          can still read everything about it — depositing needs a wallet network we support.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold">Deposit {settlementSymbol}</h2>

      {!acceptsDeposits ? (
        <p className="mt-3 rounded-[var(--radius-sm)] bg-[var(--bg-muted)] px-3 py-2.5 text-[13px] text-[var(--ink-2)]">
          This vault is not accepting deposits right now. Only an active or cooling-off vault can take
          new money.
        </p>
      ) : null}

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="amount" className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
            Amount
          </label>
          <span className="font-mono text-[11px] text-[var(--ink-3)]">
            balance{' '}
            {balance !== undefined
              ? formatAmount((balance as bigint).toString(), settlementDecimals, { maxFractionDigits: 2 })
              : '—'}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] px-3 py-2.5 focus-within:border-[var(--green)]">
          <input
            id="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className="w-full bg-transparent font-mono text-lg outline-none"
          />
          <span className="shrink-0 text-xs font-medium text-[var(--ink-3)]">{settlementSymbol}</span>
          <button
            onClick={() => {
              const cap = maxDeposit as bigint | undefined;
              const bal = balance as bigint | undefined;
              const best = cap !== undefined && bal !== undefined ? (cap < bal ? cap : bal) : (bal ?? 0n);
              setAmount(formatUnits(best, settlementDecimals));
            }}
            className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--bg-muted)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-[var(--line)]"
          >
            Max
          </button>
        </div>

        {parsed > 0n ? (
          <p className="mt-2 font-mono text-[11px] text-[var(--ink-3)]">
            ≈ {formatAmount(sharePreview.toString(), settlementDecimals, { maxFractionDigits: 4 })} shares
          </p>
        ) : null}

        {overBalance ? (
          <p className="mt-2 text-[12px] text-[var(--loss)]">More than your balance.</p>
        ) : overCap ? (
          <p className="mt-2 text-[12px] text-[var(--loss)]">
            Over what this vault can still take —{' '}
            {formatAmount((maxDeposit as bigint).toString(), settlementDecimals, { maxFractionDigits: 2 })}{' '}
            {settlementSymbol} of room left.
          </p>
        ) : null}
      </div>

      {/* ── actions ──────────────────────────────────────────────────── */}
      <div className="mt-5 space-y-2">
        {!isConnected ? (
          <p className="text-[13px] text-[var(--ink-3)]">Connect a wallet to deposit.</p>
        ) : wrongChain ? (
          <Button variant="secondary" className="w-full" onClick={() => switchChain({ chainId })}>
            Switch network first
          </Button>
        ) : (
          <>
            <Button
              variant={needsApproval ? 'primary' : 'tertiary'}
              className="w-full"
              disabled={!needsApproval || isPending || confirming || parsed === 0n}
              onClick={() =>
                run('Approval', () =>
                  writeContractAsync({
                    address: settlementAsset as `0x${string}`,
                    abi: mockUsdgAbi,
                    functionName: 'approve',
                    args: [vault as `0x${string}`, parsed],
                    chainId,
                  }),
                )
              }
            >
              {needsApproval ? '1 · Approve' : '1 · Approved ✓'}
            </Button>

            <Button
              className="w-full"
              disabled={
                needsApproval ||
                parsed === 0n ||
                overBalance ||
                overCap ||
                !acceptsDeposits ||
                isPending ||
                confirming
              }
              onClick={() =>
                run('Deposit', () =>
                  writeContractAsync({
                    address: vault as `0x${string}`,
                    abi: velanosVaultAbi,
                    functionName: 'deposit',
                    args: [parsed, address as `0x${string}`],
                    chainId,
                  }),
                )
              }
            >
              {confirming ? 'Confirming…' : '2 · Deposit'}
            </Button>
          </>
        )}
      </div>

      {/* ── faucet ───────────────────────────────────────────────────── */}
      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] leading-snug text-[var(--ink-3)]">
            Need test {settlementSymbol}? The faucet gives 10,000 per address per day.
          </p>
          <Button
            variant="tertiary"
            className="shrink-0 px-0 text-xs"
            disabled={!isConnected || wrongChain}
            onClick={() =>
              run('Faucet', () =>
                writeContractAsync({
                  address: settlementAsset as `0x${string}`,
                  abi: mockUsdgAbi,
                  functionName: 'faucet',
                  chainId,
                }),
              )
            }
          >
            Get test {settlementSymbol}
          </Button>
        </div>
      </div>
    </Card>
  );
}
