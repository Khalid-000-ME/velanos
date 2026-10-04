import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  http,
} from 'viem';
import {
  velanosVaultAbi,
  bondManagerAbi,
  chainById,
  contractAddress,
  policyGuardAbi,
  isSupportedChainId,
  rpcUrlFor,
  violationCourtAbi,
} from '@velanos/config';
import { checkStatic, checkStateful, explain } from './guard';
import { hashIntent, rationaleHash, signIntent } from './eip712';
import type {
  CheckResult,
  ExecStatus,
  Mandate,
  RuleId,
  TradeIntent,
  VaultSnapshot,
} from './types';

export interface VelanosClientOptions {
  chainId: number;
  publicClient?: PublicClient;
  walletClient?: WalletClient;
  /** Relay base URL, e.g. `http://localhost:4000`. Needed for `submitRelay`. */
  relayUrl?: string;
  rpcUrl?: string;
  /**
   * Chain definition, for a network the config package does not ship — a local anvil fork, or a
   * testnet added after this SDK was published. Without it the chain is resolved from
   * `@velanos/config`, which only knows the deployed public chains.
   */
  chain?: Chain;
  /**
   * Protocol addresses, when they do not come from the committed deployment files. Needed on a
   * local chain, where the address book is generated per run and is not part of the package.
   */
  addresses?: Partial<Record<'BondManager' | 'ViolationCourt' | 'PolicyGuard' | 'VaultFactory', Address>>;
}

export interface PreflightResult {
  ok: boolean;
  /** The rule the contract would report. 0 when the intent is clean. */
  ruleId: RuleId | 0;
  slashable: boolean;
  checks: CheckResult[];
  snapshot: VaultSnapshot;
  mandate: Mandate;
}

export interface BuildIntentArgs {
  vault: Address;
  kind: TradeIntent['kind'];
  adapter: Address;
  assetIn: Address;
  assetOut: Address;
  amountIn: bigint;
  nonce: bigint;
  minOut?: bigint;
  leverageBps?: number;
  isLong?: boolean;
  /** Seconds the intent stays valid. Capped at 300 by rule 107. */
  validitySeconds?: number;
  rationale?: string;
  now?: bigint;
}

/**
 * Everything an agent needs to participate in a vault: read the mandate, predict the verdict, sign,
 * and submit.
 *
 * `preflight` is the method that matters. An agent that calls it before signing cannot be slashed
 * for a static rule, because it will have seen the same verdict the contract is about to reach. An
 * agent that skips it is choosing to find out the expensive way — which is exactly what the rogue
 * profiles in the demo do.
 */
export class VelanosClient {
  readonly chainId: number;
  readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;
  private readonly relayUrl?: string;
  private readonly chain: Chain;
  private readonly addressOverrides: NonNullable<VelanosClientOptions['addresses']>;

  constructor(opts: VelanosClientOptions) {
    this.chainId = opts.chainId;
    this.chain = opts.chain ?? chainById(opts.chainId); // throws for an unknown chain unless `chain` is supplied
    this.addressOverrides = opts.addresses ?? {};
    this.publicClient =
      opts.publicClient ??
      (createPublicClient({
        chain: this.chain,
        transport: http(opts.rpcUrl ?? this.defaultRpcUrl()),
      }) as PublicClient);
    this.walletClient = opts.walletClient;
    this.relayUrl = opts.relayUrl;
  }

  private defaultRpcUrl(): string | undefined {
    if (isSupportedChainId(this.chainId)) return rpcUrlFor(this.chainId, process.env);
    return this.chain.rpcUrls.default.http[0];
  }

  /** Overrides first, then the committed address book. */
  private addressOf(name: 'BondManager' | 'ViolationCourt' | 'PolicyGuard' | 'VaultFactory'): Address {
    const override = this.addressOverrides[name];
    if (override) return override;
    if (!isSupportedChainId(this.chainId)) {
      throw new Error(
        `chain ${this.chainId} is not in the committed deployments; pass addresses.${name} explicitly`,
      );
    }
    return contractAddress(this.chainId, name);
  }

  // ─────────────────────────────────── reads ────────────────────────────────────

  async getMandate(vault: Address): Promise<Mandate> {
    const raw = await this.publicClient.readContract({
      address: vault,
      abi: velanosVaultAbi,
      functionName: 'mandate',
    });
    return raw as unknown as Mandate;
  }

  async getSnapshot(vault: Address, intent: TradeIntent): Promise<VaultSnapshot> {
    const raw = await this.publicClient.readContract({
      address: vault,
      abi: velanosVaultAbi,
      functionName: 'snapshot',
      args: [intent as never],
    });
    return raw as unknown as VaultSnapshot;
  }

  async getFrozenAt(vault: Address): Promise<bigint> {
    const raw = await this.publicClient.readContract({
      address: vault,
      abi: velanosVaultAbi,
      functionName: 'frozenAt',
    });
    return BigInt(raw as bigint);
  }

  async getVaultOverview(vault: Address) {
    const [state, nav, pps, hwm, floor, violations, strikes, settledAt] = await Promise.all([
      this.read(vault, 'state'),
      this.read(vault, 'navSettlement'),
      this.read(vault, 'pricePerShareWad'),
      this.read(vault, 'hwmPricePerShareWad'),
      this.read(vault, 'floorPricePerShareWad'),
      this.read(vault, 'staticViolationCount'),
      this.read(vault, 'strikesInWindow'),
      this.read(vault, 'settledAt'),
    ]);
    return {
      state: Number(state),
      navSettlement: BigInt(nav as bigint),
      pricePerShareWad: BigInt(pps as bigint),
      hwmPricePerShareWad: BigInt(hwm as bigint),
      floorPricePerShareWad: BigInt(floor as bigint),
      staticViolationCount: Number(violations),
      strikesInWindow: Number(strikes),
      settledAt: BigInt(settledAt as bigint),
    };
  }

  async getBond(vault: Address) {
    const [available, slashedTotal, releasableAt] = (await this.publicClient.readContract({
      address: this.addressOf('BondManager'),
      abi: bondManagerAbi,
      functionName: 'bondOf',
      args: [vault],
    })) as readonly [bigint, bigint, bigint];
    return { available, slashedTotal, releasableAt };
  }

  private read(vault: Address, fn: string) {
    return this.publicClient.readContract({
      address: vault,
      abi: velanosVaultAbi,
      functionName: fn as never,
    });
  }

  // ───────────────────────────────── building ───────────────────────────────────

  buildIntent(args: BuildIntentArgs): TradeIntent {
    const now = args.now ?? BigInt(Math.floor(Date.now() / 1000));
    // Clamped rather than passed through: a 400-second window is rule 107, and silently signing
    // one would make the SDK the cause of the slash.
    const validity = BigInt(Math.min(args.validitySeconds ?? 120, 300));

    return {
      vault: args.vault,
      kind: args.kind,
      adapter: args.adapter,
      assetIn: args.assetIn,
      assetOut: args.assetOut,
      amountIn: args.amountIn,
      minOut: args.minOut ?? 0n,
      leverageBps: args.leverageBps ?? 10_000,
      isLong: args.isLong ?? true,
      nonce: args.nonce,
      issuedAt: now,
      deadline: now + validity,
      rationaleHash: rationaleHash(args.rationale ?? ''),
    };
  }

  hashIntent(intent: TradeIntent): Hex {
    return hashIntent(intent, this.chainId);
  }

  /** Confirms the local digest matches what the vault computes, before anything is signed. */
  async verifyDigestAgainstChain(intent: TradeIntent): Promise<boolean> {
    const onChain = (await this.publicClient.readContract({
      address: intent.vault,
      abi: velanosVaultAbi,
      functionName: 'hashIntent',
      args: [intent as never],
    })) as Hex;
    return onChain.toLowerCase() === this.hashIntent(intent).toLowerCase();
  }

  // ───────────────────────────────── preflight ──────────────────────────────────

  /**
   * Predicts the contract's verdict, using live state and the same rule order.
   *
   * Static rules are checked first and separately because only they can cost the agent money. A
   * caller that gets `slashable: true` back and signs anyway has made a decision, not a mistake.
   */
  async preflight(intent: TradeIntent, nowTs?: bigint): Promise<PreflightResult> {
    const [mandate, snapshot, frozenAt] = await Promise.all([
      this.getMandate(intent.vault),
      this.getSnapshot(intent.vault, intent),
      this.getFrozenAt(intent.vault),
    ]);
    const now = nowTs ?? BigInt(Math.floor(Date.now() / 1000));

    const staticRule = checkStatic(intent, mandate, frozenAt);
    const ruleId = staticRule !== 0 ? staticRule : checkStateful(intent, mandate, snapshot, now);

    return {
      ok: ruleId === 0,
      ruleId,
      slashable: staticRule !== 0,
      checks: explain(intent, mandate, frozenAt, snapshot, now),
      snapshot,
      mandate,
    };
  }

  /** The same checklist the UI inspector renders, computed locally. */
  async explainIntent(intent: TradeIntent, nowTs?: bigint): Promise<CheckResult[]> {
    return (await this.preflight(intent, nowTs)).checks;
  }

  // ────────────────────────────────── signing ───────────────────────────────────

  async signIntent(intent: TradeIntent, account?: Account | Address): Promise<Hex> {
    const wallet = this.requireWallet();
    const acct = account ?? wallet.account;
    if (!acct) throw new Error('VelanosClient.signIntent needs an account');

    return signIntent({
      signTypedData: (args) =>
        wallet.signTypedData({ ...args, account: acct as never } as never) as Promise<Hex>,
      intent,
      chainId: this.chainId,
    });
  }

  // ───────────────────────────────── submitting ─────────────────────────────────

  /** Sends the intent straight to the vault. The signature is the authorisation, not the sender. */
  async submitDirect(intent: TradeIntent, sig: Hex): Promise<Hex> {
    const wallet = this.requireWallet();
    if (!wallet.account) throw new Error('VelanosClient.submitDirect needs an account');

    return wallet.writeContract({
      address: intent.vault,
      abi: velanosVaultAbi,
      functionName: 'execute',
      args: [intent as never, sig],
      chain: this.chain,
      account: wallet.account,
    });
  }

  /**
   * Hands the intent to the relay, which runs its own pre-flight.
   *
   * A relay that finds a static violation refuses to submit it and publishes it to the public feed
   * instead. The agent is still liable — it signed it — but no depositor funds were ever at risk.
   * That split between prevention and liability is the point of having a relay at all.
   */
  async submitRelay(
    intent: TradeIntent,
    sig: Hex,
  ): Promise<{ submitted: boolean; txHash?: Hex; ruleId?: RuleId | 0; published?: boolean }> {
    if (!this.relayUrl) throw new Error('VelanosClient needs a relayUrl to submit via relay');

    const res = await fetch(`${this.relayUrl}/intents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent: serialiseIntent(intent), sig }),
    });
    if (!res.ok) throw new Error(`relay rejected the request: ${res.status} ${await res.text()}`);
    return (await res.json()) as {
      submitted: boolean;
      txHash?: Hex;
      ruleId?: RuleId | 0;
      published?: boolean;
    };
  }

  /** Reports a signed static violation and collects the bounty. Used by the watcher. */
  async reportViolation(intent: TradeIntent, sig: Hex): Promise<Hex> {
    const wallet = this.requireWallet();
    if (!wallet.account) throw new Error('VelanosClient.reportViolation needs an account');

    return wallet.writeContract({
      address: this.addressOf('ViolationCourt'),
      abi: violationCourtAbi,
      functionName: 'reportSignedViolation',
      args: [intent as never, sig],
      chain: this.chain,
      account: wallet.account,
    });
  }

  /** Asks the deployed guard directly. Used by the differential test to catch mirror drift. */
  async checkStaticOnChain(intent: TradeIntent, mandate: Mandate, frozenAt: bigint): Promise<number> {
    const raw = await this.publicClient.readContract({
      address: this.addressOf('PolicyGuard'),
      abi: policyGuardAbi,
      functionName: 'checkStatic',
      args: [intent as never, mandate as never, frozenAt],
    });
    return Number(raw);
  }

  private requireWallet(): WalletClient {
    if (!this.walletClient) throw new Error('VelanosClient was constructed without a walletClient');
    return this.walletClient;
  }
}

/** JSON-safe form for the relay: bigints become decimal strings. */
export function serialiseIntent(intent: TradeIntent): Record<string, string | number | boolean> {
  return {
    vault: intent.vault,
    kind: Number(intent.kind),
    adapter: intent.adapter,
    assetIn: intent.assetIn,
    assetOut: intent.assetOut,
    amountIn: intent.amountIn.toString(),
    minOut: intent.minOut.toString(),
    leverageBps: Number(intent.leverageBps),
    isLong: intent.isLong,
    nonce: intent.nonce.toString(),
    issuedAt: intent.issuedAt.toString(),
    deadline: intent.deadline.toString(),
    rationaleHash: intent.rationaleHash,
  };
}

export type { ExecStatus };
