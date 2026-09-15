import { defineChain, type Chain } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

/**
 * Robinhood Chain testnet.
 *
 * PRD §19.4 asks us to prefer `robinhoodTestnet` from `viem/chains` when the installed
 * viem version exports it. It does not in viem 2.37, so the chain is defined here from
 * the values in PRD §4.1. Swap to the viem export when it lands — the shape is identical.
 */
export const robinhoodTestnet: Chain = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Chain Explorer',
      url: 'https://explorer.testnet.chain.robinhood.com',
      apiUrl: 'https://explorer.testnet.chain.robinhood.com/api',
    },
  },
  testnet: true,
});

export const ROBINHOOD_TESTNET_ID = 46630 as const;
export const ARBITRUM_SEPOLIA_ID = 421614 as const;

export type SupportedChainId = typeof ROBINHOOD_TESTNET_ID | typeof ARBITRUM_SEPOLIA_ID;

export const SUPPORTED_CHAIN_IDS = [ROBINHOOD_TESTNET_ID, ARBITRUM_SEPOLIA_ID] as const;

export const chains = {
  [ROBINHOOD_TESTNET_ID]: robinhoodTestnet,
  [ARBITRUM_SEPOLIA_ID]: arbitrumSepolia,
} as const satisfies Record<SupportedChainId, Chain>;

/** Short labels used in the status bar and chain badges. */
export const chainLabels = {
  [ROBINHOOD_TESTNET_ID]: 'Robinhood Chain testnet',
  [ARBITRUM_SEPOLIA_ID]: 'Arbitrum Sepolia',
} as const satisfies Record<SupportedChainId, string>;

export const chainShortLabels = {
  [ROBINHOOD_TESTNET_ID]: 'Robinhood',
  [ARBITRUM_SEPOLIA_ID]: 'Arbitrum',
} as const satisfies Record<SupportedChainId, string>;

export const faucets = {
  [ROBINHOOD_TESTNET_ID]: 'https://faucet.testnet.chain.robinhood.com',
  [ARBITRUM_SEPOLIA_ID]: 'https://faucet.quicknode.com/arbitrum/sepolia',
} as const satisfies Record<SupportedChainId, string>;

export function isSupportedChainId(id: number): id is SupportedChainId {
  return (SUPPORTED_CHAIN_IDS as readonly number[]).includes(id);
}

export function chainById(id: number): Chain {
  if (!isSupportedChainId(id)) throw new Error(`Unsupported chainId: ${id}`);
  return chains[id];
}

export function rpcUrlFor(id: SupportedChainId, env: Record<string, string | undefined> = {}): string {
  const override =
    id === ROBINHOOD_TESTNET_ID ? env.RH_TESTNET_RPC : env.ARB_SEPOLIA_RPC;
  return override ?? chains[id].rpcUrls.default.http[0];
}

export function explorerUrl(id: SupportedChainId): string {
  return chains[id].blockExplorers?.default.url ?? '';
}

export function txUrl(id: SupportedChainId, hash: string): string {
  return `${explorerUrl(id)}/tx/${hash}`;
}

export function addressUrl(id: SupportedChainId, address: string): string {
  return `${explorerUrl(id)}/address/${address}`;
}
