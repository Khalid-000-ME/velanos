'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { shortAddress } from '@aegis/ui';

/**
 * Connect / disconnect.
 *
 * Deliberately minimal: the only wallet actions in this product are depositing, withdrawing, staking
 * a bond and reporting a violation, and each lives on the screen that needs it.
 */
export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-1.5 font-mono text-[12px] text-[var(--ink-2)] transition-colors hover:bg-[var(--bg-subtle)]"
        title="Disconnect"
      >
        <span className="size-1.5 rounded-full bg-[var(--green)]" aria-hidden />
        {shortAddress(address)}
      </button>
    );
  }

  const injected = connectors[0];

  return (
    <button
      onClick={() => injected && connect({ connector: injected })}
      disabled={!injected || isPending}
      className="rounded-[var(--radius-sm)] bg-[var(--black)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--black-2)] disabled:opacity-50"
    >
      {isPending ? 'Connecting…' : injected ? 'Connect wallet' : 'No wallet'}
    </button>
  );
}
