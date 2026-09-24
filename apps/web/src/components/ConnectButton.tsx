'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { shortAddress } from '@aegis/ui';

/**
 * Connect / disconnect, styled for the black header.
 *
 * Deliberately minimal: the only wallet actions in this product are depositing, withdrawing,
 * staking a bond and reporting a violation, and all four live on the page that needs them.
 */
export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-[var(--radius-pill)] border border-white/30 px-4 py-2 font-mono text-[13px] text-white transition-colors hover:bg-white/10"
        title="Disconnect"
      >
        {shortAddress(address)}
      </button>
    );
  }

  const injected = connectors[0];

  return (
    <button
      onClick={() => injected && connect({ connector: injected })}
      disabled={!injected || isPending}
      className="rounded-[var(--radius-pill)] bg-[var(--green)] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[var(--green-hover)] disabled:opacity-50"
    >
      {isPending ? 'Connecting…' : injected ? 'Connect wallet' : 'No wallet found'}
    </button>
  );
}
