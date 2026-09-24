'use client';

import { createConfig, http } from 'wagmi';
import { arbitrumSepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';

/**
 * Wallet configuration.
 *
 * Injected connectors only, and a connect button built from the design tokens rather than
 * RainbowKit: RainbowKit still pins wagmi 2, and the look here is a bespoke brokerage theme that
 * would have been overridden wholesale anyway. The whole surface is one small component.
 */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: {
    default: {
      name: 'Robinhood Chain Explorer',
      url: 'https://explorer.testnet.chain.robinhood.com',
    },
  },
  testnet: true,
});

export const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, arbitrumSepolia, anvil],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(),
    [arbitrumSepolia.id]: http(),
    [anvil.id]: http(),
  },
  ssr: true,
});

/**
 * The chain ids wagmi is configured for.
 *
 * wagmi narrows `chainId` to this union on every hook, and the indexer hands us a plain `number`, so
 * the narrowing happens once here. A vault on a chain the wallet config does not know is a real
 * situation — someone opens a link for a network we have not configured — and it should produce a
 * clear message rather than a cast that lets a hook silently query the wrong chain.
 */
export type WalletChainId = (typeof wagmiConfig)['chains'][number]['id'];

const WALLET_CHAIN_IDS: readonly number[] = wagmiConfig.chains.map((c) => c.id);

export function asWalletChain(chainId: number): WalletChainId | undefined {
  return WALLET_CHAIN_IDS.includes(chainId) ? (chainId as WalletChainId) : undefined;
}

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
