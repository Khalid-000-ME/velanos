import {
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { chainById, isSupportedChainId } from '@velanos/config';
import { activeChains, env } from '../env';

const localAnvil: Chain = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
});

export function chainFor(chainId: number): Chain {
  if (isSupportedChainId(chainId)) return chainById(chainId);
  if (chainId === 31337) return localAnvil;
  throw new Error(`Unsupported chainId ${chainId}`);
}

const publicClients = new Map<number, PublicClient>();

export function publicClientFor(chainId: number): PublicClient {
  const cached = publicClients.get(chainId);
  if (cached) return cached;

  const rpcUrl = activeChains().find((c) => c.chainId === chainId)?.rpcUrl;
  const client = createPublicClient({
    chain: chainFor(chainId),
    transport: http(rpcUrl),
  }) as PublicClient;
  publicClients.set(chainId, client);
  return client;
}

/**
 * Wallet the relay uses to submit intents on an agent's behalf.
 *
 * Holding a key here does not give the server authority over a vault: `execute` is authorised by
 * the agent's signature, not the sender, so the worst this key can do is pay gas for an intent the
 * agent already signed.
 */
export function relayWalletFor(chainId: number): WalletClient | undefined {
  if (!env.RELAY_PK) return undefined;
  return createWalletClient({
    account: privateKeyToAccount(env.RELAY_PK as `0x${string}`),
    chain: chainFor(chainId),
    transport: http(activeChains().find((c) => c.chainId === chainId)?.rpcUrl),
  });
}

export function priceUpdaterWalletFor(chainId: number): WalletClient | undefined {
  if (!env.PRICE_UPDATER_PK) return undefined;
  return createWalletClient({
    account: privateKeyToAccount(env.PRICE_UPDATER_PK as `0x${string}`),
    chain: chainFor(chainId),
    transport: http(activeChains().find((c) => c.chainId === chainId)?.rpcUrl),
  });
}

export function explorerTxUrl(chainId: number, hash: string): string {
  const base = chainFor(chainId).blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : '';
}

export function isAddress(value: unknown): value is Address {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}
