import {
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  velanosVaultAbi,
  chainById,
  isSupportedChainId,
  violationCourtAbi,
} from '@velanos/config';
import { RULES, type RuleId, type TradeIntent } from '@velanos/agent-sdk';
import { env, rpcFor } from './env';
import { TxQueue, isTerminalFailure } from './txqueue';

const anvil: Chain = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
});

function chainFor(chainId: number): Chain {
  if (chainId === 31337) return anvil;
  if (isSupportedChainId(chainId)) return chainById(chainId);
  throw new Error(`unsupported chainId ${chainId}`);
}

const account = privateKeyToAccount(env.WATCHER_PK as `0x${string}`);

/**
 * The watcher: an unprivileged bot that earns money by keeping the protocol honest.
 *
 * It holds no authority. Every action it takes is one anyone could take, and it takes them because
 * doing so pays: reporting a signed violation earns a share of the penalty, and the lifecycle calls
 * cost gas but keep vaults from sitting frozen with depositor money stuck inside.
 *
 * That is the design intent. A protocol that needs *us* to run this is a protocol with an operator;
 * a protocol that pays *anyone* to run it is one that keeps working after we stop paying attention.
 */

interface FeedIntent {
  chainId: number;
  vault: Address;
  nonce: string;
  intent: Record<string, unknown>;
  signature: `0x${string}`;
  ruleId: number;
  slashable: boolean;
  reported: boolean;
}

interface VaultRow {
  chainId: number;
  address: Address;
  name: string;
  state: number;
  pricePerShareWad: string;
  floorWad: string;
  settlementSymbol: string;
  settlementDecimals: number;
}

const VaultState = {
  PENDING_BOND: 0, ACTIVE: 1, WARNED: 2, FROZEN: 3, UNWINDING: 4, EXPIRED: 5, SETTLED: 6,
} as const;

let courtAddresses: Record<number, Address> = {};

/** One shared queue: every write from this account goes through it, in order. */
const txQueue = new TxQueue();

async function main(): Promise<void> {
  console.log(`[watcher] reporting as ${account.address}`);

  await loadCourtAddresses();
  setInterval(() => void loadCourtAddresses(), 60_000);
  setInterval(() => void heartbeat(), 10_000);

  // Two independent loops. The feed loop is the money-maker and runs tight; the lifecycle sweep is
  // housekeeping and runs on a slower cadence.
  setInterval(() => void sweepFeed().catch(logError('feed')), 4_000);
  setInterval(() => void sweepVaults().catch(logError('vaults')), env.WATCHER_POLL_MS);

  void sweepFeed().catch(logError('feed'));
  void sweepVaults().catch(logError('vaults'));
}

// ────────────────────────── reporting signed violations ──────────────────────────

/**
 * Reports every unreported slashable intent in the public feed.
 *
 * Nothing here needs permission or inside knowledge: the feed is public, the rule check is public,
 * and the court re-derives the verdict itself. The watcher is just the first party to notice.
 */
async function sweepFeed(): Promise<void> {
  const res = await fetch(`${env.SERVER_URL}/feed/intents/list`);
  if (!res.ok) return;
  const { intents } = (await res.json()) as { intents: FeedIntent[] };

  for (const entry of intents) {
    if (entry.reported || !entry.slashable) continue;

    const court = courtAddresses[entry.chainId];
    if (!court) continue;

    const wallet = createWalletClient({
      account,
      chain: chainFor(entry.chainId),
      transport: http(rpcFor(entry.chainId)),
    });
    const publicClient = createPublicClient({
      chain: chainFor(entry.chainId),
      transport: http(rpcFor(entry.chainId)),
    });

    const intent = reviveIntent(entry.intent);
    const rule = RULES[entry.ruleId as RuleId];

    try {
      const txHash = await txQueue.run(() =>
        wallet.writeContract({
          address: court,
          abi: violationCourtAbi,
          functionName: 'reportSignedViolation',
          args: [intent as never, entry.signature],
          chain: chainFor(entry.chainId),
          account,
        }),
      );
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      console.log(
        `[watcher] reported ${entry.vault} nonce ${entry.nonce}: rule ${entry.ruleId} ${rule?.title} — tx ${txHash}`,
      );

      await markReported(entry, txHash);
    } catch (e) {
      if (isTerminalFailure(e)) {
        // Another reporter got there first, or the court disagrees a rule was broken. One slash per
        // nonce, so there is nothing left to claim.
        console.log(`[watcher] ${entry.vault} nonce ${entry.nonce} already resolved: ${shortError(e)}`);
        await markReported(entry, 'claimed-elsewhere');
      } else {
        // Transient — an RPC hiccup or a nonce race. Leave it unreported so the next sweep retries,
        // rather than writing off a bounty we are still entitled to.
        console.log(`[watcher] report of ${entry.vault} nonce ${entry.nonce} will retry: ${shortError(e)}`);
      }
    }
  }
}

// ──────────────────────────── lifecycle housekeeping ─────────────────────────────

/**
 * Keeps every vault moving toward a state where depositors can withdraw.
 *
 * Trip the breaker when NAV is through the floor, unwind what is frozen, compensate the shortfall
 * out of the bond, then settle. Each call is permissionless and idempotent — a revert means someone
 * else already did it, or the precondition is not met yet, and both are fine.
 */
async function sweepVaults(): Promise<void> {
  const res = await fetch(`${env.SERVER_URL}/vaults`);
  if (!res.ok) return;
  const { vaults } = (await res.json()) as { vaults: VaultRow[] };

  for (const v of vaults) {
    const court = courtAddresses[v.chainId];
    if (!court) continue;

    const wallet = createWalletClient({
      account, chain: chainFor(v.chainId), transport: http(rpcFor(v.chainId)),
    });
    const publicClient = createPublicClient({
      chain: chainFor(v.chainId), transport: http(rpcFor(v.chainId)),
    });

    const send = async (
      label: string,
      run: () => Promise<`0x${string}`>,
    ): Promise<boolean> => {
      try {
        const hash = await txQueue.run(run);
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`[watcher] ${label} ${v.name} (${v.address}) — tx ${hash}`);
        return true;
      } catch {
        // A revert here almost always means the precondition is not met yet, or someone else
        // already did it. Both are fine, and both are silent.
        return false;
      }
    };

    // Poke only when a time-based transition is actually pending — a WARNED cooldown to clear, or an
    // expiry to recognise. Poking every ACTIVE vault on every sweep would burn gas to write a NAV
    // snapshot the indexer already takes.
    const needsPoke =
      v.state === VaultState.WARNED ||
      (v.state === VaultState.ACTIVE && (await isPastExpiry(publicClient, v.address)));
    if (needsPoke) {
      await send('poked', () =>
        wallet.writeContract({
          address: v.address, abi: velanosVaultAbi, functionName: 'poke',
          chain: chainFor(v.chainId), account,
        }),
      );
    }

    if (v.state === VaultState.ACTIVE && BigInt(v.pricePerShareWad) < BigInt(v.floorWad)) {
      console.log(
        `[watcher] ${v.name} is through its floor: ${formatUnits(BigInt(v.pricePerShareWad), 18)} < ${formatUnits(BigInt(v.floorWad), 18)} per share — tripping the breaker`,
      );
      await send('tripped the drawdown breaker on', () =>
        wallet.writeContract({
          address: court, abi: violationCourtAbi, functionName: 'tripDrawdown',
          args: [v.address], chain: chainFor(v.chainId), account,
        }),
      );
      continue;
    }

    if (v.state === VaultState.FROZEN || v.state === VaultState.EXPIRED) {
      await send('unwound', () =>
        wallet.writeContract({
          address: v.address, abi: velanosVaultAbi, functionName: 'unwind',
          chain: chainFor(v.chainId), account,
        }),
      );
      continue;
    }

    if (v.state === VaultState.UNWINDING) {
      // Compensation before settlement: once the vault is SETTLED the shortfall is still payable,
      // but paying it first means depositors withdraw the repaired number rather than the raw one.
      await send('compensated the drawdown on', () =>
        wallet.writeContract({
          address: court, abi: violationCourtAbi, functionName: 'compensateDrawdown',
          args: [v.address], chain: chainFor(v.chainId), account,
        }),
      );
      await send('settled', () =>
        wallet.writeContract({
          address: v.address, abi: velanosVaultAbi, functionName: 'settle',
          chain: chainFor(v.chainId), account,
        }),
      );
      continue;
    }

    // An agent that stops answering after expiry is itself a breach, and the penalty is claimable.
    try {
      const late = (await publicClient.readContract({
        address: v.address, abi: velanosVaultAbi, functionName: 'isLateToSettle',
      })) as boolean;
      if (late) {
        await send('force-settled', () =>
          wallet.writeContract({
            address: court, abi: violationCourtAbi, functionName: 'forceSettle',
            args: [v.address], chain: chainFor(v.chainId), account,
          }),
        );
      }
    } catch {
      /* a settled vault reverts this read; nothing to do */
    }
  }
}

// ───────────────────────────────── plumbing ──────────────────────────────────────

async function markReported(entry: FeedIntent, txHash: string): Promise<void> {
  await fetch(`${env.SERVER_URL}/feed/intents/reported`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chainId: entry.chainId, vault: entry.vault, nonce: entry.nonce, txHash }),
  }).catch(() => undefined);
}

async function isPastExpiry(
  client: ReturnType<typeof createPublicClient>,
  vault: Address,
): Promise<boolean> {
  try {
    const mandate = (await client.readContract({
      address: vault, abi: velanosVaultAbi, functionName: 'mandate',
    })) as { expiry: bigint };
    return BigInt(Math.floor(Date.now() / 1000)) >= mandate.expiry;
  } catch {
    return false;
  }
}

async function loadCourtAddresses(): Promise<void> {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = join(import.meta.dirname, '..', '..', '..', 'packages', 'config', 'deployments');

  const next: Record<number, Address> = {};
  for (const chainId of [46630, 421614, 31337]) {
    try {
      const d = JSON.parse(readFileSync(join(dir, `${chainId}.json`), 'utf8')) as {
        contracts: Record<string, Address>;
      };
      if (d.contracts?.ViolationCourt) next[chainId] = d.contracts.ViolationCourt;
    } catch {
      /* not deployed */
    }
  }
  courtAddresses = next;
}

async function heartbeat(): Promise<void> {
  await fetch(`${env.SERVER_URL}/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ service: 'watcher', detail: account.address }),
  }).catch(() => undefined);
}

function reviveIntent(raw: Record<string, unknown>): TradeIntent {
  return {
    vault: raw.vault as Address,
    kind: Number(raw.kind) as TradeIntent['kind'],
    adapter: raw.adapter as Address,
    assetIn: raw.assetIn as Address,
    assetOut: raw.assetOut as Address,
    amountIn: BigInt(raw.amountIn as string),
    minOut: BigInt(raw.minOut as string),
    leverageBps: Number(raw.leverageBps),
    isLong: Boolean(raw.isLong),
    nonce: BigInt(raw.nonce as string),
    issuedAt: BigInt(raw.issuedAt as string),
    deadline: BigInt(raw.deadline as string),
    rationaleHash: raw.rationaleHash as `0x${string}`,
  };
}

function shortError(e: unknown): string {
  const msg = (e as Error).message ?? String(e);
  return msg.split('\n')[0]!.slice(0, 160);
}

function logError(label: string) {
  return (e: unknown) => console.error(`[watcher] ${label} sweep failed:`, shortError(e));
}

main().catch((e) => {
  console.error('[watcher] fatal:', e);
  process.exit(1);
});
