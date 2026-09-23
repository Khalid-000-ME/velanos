import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { beforeAll, describe, expect, it } from 'vitest';
import { policyGuardAbi, aegisVaultAbi } from '@aegis/config';
import { checkStatic, checkStateful, explain } from '../src/guard.js';
import { hashIntent } from '../src/eip712.js';
import { IntentKind, type Mandate, type TradeIntent, VaultKind, VaultState } from '../src/types.js';

/**
 * The mirror is only useful if it cannot drift.
 *
 * This suite fuzzes the TypeScript rule engine against the **deployed** Solidity guard and
 * compares verdicts intent by intent. A silent divergence would be worse than having no local
 * pre-flight at all: an agent would trust a prediction that the chain is about to contradict, and
 * get slashed for following its own SDK.
 *
 * Requires a local chain with the protocol deployed:
 *
 *   anvil &
 *   cd contracts && forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url http://127.0.0.1:8545 --broadcast
 *
 * Skipped when no such chain is reachable, so `pnpm test` stays green without one.
 */
const RPC = process.env.ANVIL_RPC ?? 'http://127.0.0.1:8545';
const LOCAL_CHAIN_ID = 31337;

let client: PublicClient;
let guardAddress: Address | undefined;
let vaultAddress: Address | undefined;
let available = false;

async function loadLocalDeployment() {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = join(import.meta.dirname, '..', '..', 'config', 'deployments');
  try {
    const d = JSON.parse(readFileSync(join(root, `${LOCAL_CHAIN_ID}.json`), 'utf8'));
    guardAddress = d.contracts.PolicyGuard as Address;
    try {
      const seed = JSON.parse(readFileSync(join(root, `seed-${LOCAL_CHAIN_ID}.json`), 'utf8'));
      vaultAddress = seed.vaults.A as Address;
    } catch {
      /* the seed is optional; only the digest test needs a vault */
    }
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  if (!(await loadLocalDeployment())) return;
  client = createPublicClient({ transport: http(RPC) }) as PublicClient;
  try {
    const id = await client.getChainId();
    available = id === LOCAL_CHAIN_ID && Boolean(guardAddress);
  } catch {
    available = false;
  }
});

/** Mandate shaped exactly as the guard expects it as a calldata struct. */
function mandateFor(settlement: Address, assets: Address[], adapters: Address[]): Mandate {
  return {
    agentSigner: '0x000000000000000000000000000000000000A6e7',
    operator: '0x00000000000000000000000000000000000009e0',
    settlementAsset: settlement,
    kind: VaultKind.SPOT,
    allowedAssets: assets,
    allowedAdapters: adapters,
    maxAllocation: 1_000_000_000n,
    maxTradeAmount: 250_000_000n,
    maxAssetExposureBps: 4_000,
    maxSlippageBps: 100,
    maxLeverageBps: 10_000,
    maxDrawdownBps: 800,
    maxDailyLossBps: 300,
    start: 1_000n,
    expiry: 1_000_000n,
    bondRequired: 300_000_000n,
    perViolationPenalty: 50_000_000n,
    reporterBountyBps: 1_000,
    riskTier: 1,
    metadataURI: 'ipfs://mandate',
  };
}

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;

/** A spread of intents chosen to land on every static rule, plus plenty of clean ones. */
function intentCases(): TradeIntent[] {
  const settlement = A(0x5d6);
  const tsla = A(0x75a1);
  const adapter = A(0xada9);
  const base: TradeIntent = {
    vault: A(0x7a17),
    kind: IntentKind.SPOT_BUY,
    adapter,
    assetIn: settlement,
    assetOut: tsla,
    amountIn: 150_000_000n,
    minOut: 0n,
    leverageBps: 10_000,
    isLong: true,
    nonce: 1n,
    issuedAt: 2_000n,
    deadline: 2_060n,
    rationaleHash: `0x${'11'.repeat(32)}`,
  };

  const cases: TradeIntent[] = [base];
  // Deterministic pseudo-random sweep: a fixed seed keeps a failure reproducible.
  let seed = 42;
  const next = (mod: number) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
    return seed % mod;
  };

  for (let k = 0; k < 120; k++) {
    cases.push({
      ...base,
      kind: next(4) as TradeIntent['kind'],
      adapter: next(2) === 0 ? adapter : A(0xbad0),
      assetIn: next(3) === 0 ? tsla : settlement,
      assetOut: next(3) === 0 ? A(0x9177) : tsla,
      amountIn: BigInt(next(600)) * 1_000_000n,
      leverageBps: [10_000, 10_000, 10_000, 0, 20_000, 500_000][next(6)]!,
      nonce: BigInt(k + 2),
      issuedAt: BigInt([2_000, 500, 1_000_500, 999][next(4)]!),
      deadline: BigInt(2_000 + [60, 300, 301, 5_000, 0][next(5)]!),
    });
  }
  return cases;
}

describe('SDK rule mirror matches deployed Solidity', () => {
  it('agrees with PolicyGuard.checkStatic on every case', async () => {
    if (!available) {
      console.warn('skipping differential test: no local deployment reachable');
      return;
    }
    const mandate = mandateFor(A(0x5d6), [A(0x75a1), A(0xa727)], [A(0xada9)]);

    const mismatches: string[] = [];
    for (const intent of intentCases()) {
      const onChain = Number(
        await client.readContract({
          address: guardAddress!,
          abi: policyGuardAbi,
          functionName: 'checkStatic',
          args: [intent as never, mandate as never, 0n],
        }),
      );
      const local = checkStatic(intent, mandate, 0n);
      if (local !== onChain) {
        mismatches.push(
          `nonce ${intent.nonce}: solidity=${onChain} typescript=${local} ${JSON.stringify(intent, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  }, 120_000);

  it('agrees with PolicyGuard.explain row for row', async () => {
    if (!available) return;
    const mandate = mandateFor(A(0x5d6), [A(0x75a1), A(0xa727)], [A(0xada9)]);
    const snapshot = {
      state: VaultState.ACTIVE,
      navSettlement: 1_000_000_000n,
      pricePerShareWad: 10n ** 18n,
      dayOpenPricePerShareWad: 10n ** 18n,
      assetValueBefore: 250_000_000n,
      settlementBalance: 1_000_000_000n,
      assetInBalance: 1_000_000_000n,
      quotedOut: 100n * 10n ** 18n,
      oracleOut: 100n * 10n ** 18n,
    };

    for (const intent of intentCases().slice(0, 25)) {
      const rows = (await client.readContract({
        address: guardAddress!,
        abi: policyGuardAbi,
        functionName: 'explain',
        args: [intent as never, mandate as never, 0n, snapshot as never, 2_010n],
      })) as ReadonlyArray<{ ruleId: number; passed: boolean; actual: bigint; limit: bigint }>;

      const local = explain(intent, mandate, 0n, snapshot, 2_010n);
      expect(local.map((r) => r.ruleId)).toEqual(rows.map((r) => Number(r.ruleId)));
      expect(local.map((r) => r.passed)).toEqual(rows.map((r) => r.passed));
      expect(local.map((r) => r.actual)).toEqual(rows.map((r) => r.actual));
      expect(local.map((r) => r.limit)).toEqual(rows.map((r) => r.limit));
    }
  }, 120_000);

  it('agrees with PolicyGuard.checkStateful on live snapshots', async () => {
    if (!available) return;
    const mandate = mandateFor(A(0x5d6), [A(0x75a1), A(0xa727)], [A(0xada9)]);

    for (const assetValueBefore of [0n, 250_000_000n, 400_000_000n]) {
      for (const amountIn of [1_000_000n, 150_000_000n, 240_000_000n]) {
        const snapshot = {
          state: VaultState.ACTIVE,
          navSettlement: 1_000_000_000n,
          pricePerShareWad: 10n ** 18n,
          dayOpenPricePerShareWad: 10n ** 18n,
          assetValueBefore,
          settlementBalance: 1_000_000_000n,
          assetInBalance: 1_000_000_000n,
          quotedOut: 100n * 10n ** 18n,
          oracleOut: 100n * 10n ** 18n,
        };
        const intent = { ...intentCases()[0]!, amountIn };

        const onChain = Number(
          await client.readContract({
            address: guardAddress!,
            abi: policyGuardAbi,
            functionName: 'checkStateful',
            args: [intent as never, mandate as never, snapshot as never, 2_010n],
          }),
        );
        expect(checkStateful(intent, mandate, snapshot, 2_010n)).toBe(onChain);
      }
    }
  }, 120_000);

  /**
   * The committed test vector from the PRD: the SDK's EIP-712 digest must equal the vault's own
   * `hashIntent`. If this drifts, every signature the SDK produces stops verifying.
   */
  it('computes the same EIP-712 digest as the vault', async () => {
    if (!available || !vaultAddress) {
      console.warn('skipping digest test: no seeded vault on the local chain');
      return;
    }
    const intent: TradeIntent = { ...intentCases()[0]!, vault: vaultAddress };

    const onChain = (await client.readContract({
      address: vaultAddress,
      abi: aegisVaultAbi,
      functionName: 'hashIntent',
      args: [intent as never],
    })) as string;

    expect(hashIntent(intent, LOCAL_CHAIN_ID).toLowerCase()).toBe(onChain.toLowerCase());
  }, 60_000);
});
