import { createPublicClient, createWalletClient, http, parseAbi, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { chainById, deployment, isDeployed, isSupportedChainId } from '@velanos/config';
import { env, rpcFor } from './env';

/**
 * Keeps the oracle's stock prices tied to the real market.
 *
 * Testnet stock tokens have no price feed, so a dedicated updater key writes each price from a live
 * market quote. Assets priced by a Chainlink feed (the Arbitrum vault) are skipped: nobody, including
 * this key, can write those. A price is refreshed when the market moves more than 0.3% or when the
 * stored one is getting old, so the oracle never goes stale during a session.
 */
const oracleAbi = parseAbi([
  'function setPrice(address asset, uint256 priceUsd8)',
  'function price(address asset) view returns (uint256 priceUsd8, uint64 updatedAt)',
]);

const MOVE_THRESHOLD = 0.003;
const MAX_AGE_SECONDS = 6 * 60 * 60;

async function quoteUsd(ticker: string): Promise<number | undefined> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      { headers: { 'user-agent': 'Mozilla/5.0' } },
    );
    const body = (await res.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
    const p = body.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof p === 'number' && p > 0 ? p : undefined;
  } catch {
    return undefined;
  }
}

async function refreshChain(chainId: number): Promise<void> {
  if (!isSupportedChainId(chainId) || !isDeployed(chainId)) return;
  const d = deployment(chainId);
  const oracle = d.contracts.VelanosPriceOracle as Address | undefined;
  const rpc = rpcFor(chainId);
  if (!oracle || !rpc) return;

  const chain = chainById(chainId);
  const account = privateKeyToAccount(env.PRICE_UPDATER_PK as `0x${string}`);
  const pub = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });

  for (const [ticker, asset] of Object.entries(d.assets)) {
    if (ticker === 'USDG' || asset.feed || !asset.pool) continue;
    const market = await quoteUsd(ticker);
    if (!market) continue;

    const [current, updatedAt] = (await pub.readContract({
      address: oracle, abi: oracleAbi, functionName: 'price', args: [asset.address],
    })) as [bigint, bigint];
    const next = BigInt(Math.round(market * 1e8));
    const moved = Math.abs(Number(next - current)) / Number(current);
    const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
    if (moved < MOVE_THRESHOLD && age < MAX_AGE_SECONDS) continue;

    const hash = await wallet.writeContract({
      address: oracle, abi: oracleAbi, functionName: 'setPrice', args: [asset.address, next],
    });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`[prices] ${ticker} on ${chain.name}: ${(Number(current) / 1e8).toFixed(2)} -> ${market.toFixed(2)} (${hash})`);
  }
}

export function startPriceUpdater(): void {
  if (!env.PRICE_UPDATER_PK) {
    console.log('[prices] PRICE_UPDATER_PK not set; oracle prices will not be refreshed');
    return;
  }
  const tick = () => {
    for (const chainId of [46630, 421614]) {
      void refreshChain(chainId).catch((e) =>
        console.error(`[prices] chain ${chainId} refresh failed:`, ((e as Error).message ?? '').split('\n')[0]),
      );
    }
  };
  tick();
  setInterval(tick, env.PRICE_POLL_MS);
}
