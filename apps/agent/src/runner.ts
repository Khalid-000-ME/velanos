import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  defineChain,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import {
  velanosVaultAbi,
  chainById,
  isSupportedChainId,
  robinhoodTestnet,
} from '@velanos/config';
import {
  VelanosClient,
  RULES,
  serialiseIntent,
  signIntent,
  type Mandate,
  type TradeIntent,
} from '@velanos/agent-sdk';
import { env, rpcFor } from './env';
import { propose } from './llm';
import { buildIntent, UnmappableProposal, type AssetBook } from './harness';
import { PROFILES, SILENT_BLEEDER_STEPS, profileFor, type Profile } from './profiles';

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

export interface StepResult {
  ok: boolean;
  action: string;
  profile: string;
  nonce?: string;
  ruleId?: number;
  rule?: string;
  slashable?: boolean;
  txHash?: string;
  route?: string;
  submitted?: boolean;
  published?: boolean;
  rationale?: string;
  note?: string;
}

/**
 * One agent, one vault, one tick at a time.
 *
 * The sequence is always the same and the order is the product: read state, ask the model, map to
 * raw units in code, pre-flight against the mandate, sign, submit. The model's influence ends at
 * step two. Nothing downstream of it trusts its arithmetic, its asset names or its judgement about
 * what is permitted.
 */
export class AgentRunner {
  private readonly signer = privateKeyToAccount(env.AGENT_SIGNER_PK as `0x${string}`);
  private nonceCursor = BigInt(Date.now());

  lastResult: StepResult | undefined;
  lastProfile: string = 'good';

  get signerAddress(): Address {
    return this.signer.address;
  }

  /** Runs `steps` ticks. The silent bleeder walks a fixed buy sequence instead. */
  async run(vault: Address, profileId: string, steps = 1): Promise<StepResult[]> {
    const profile = profileFor(profileId);
    this.lastProfile = profile.id;

    await this.setNewsPoisoned(profile.poisonNews);

    const results: StepResult[] = [];
    if (profile.id === 'silent_bleeder') {
      for (const step of SILENT_BLEEDER_STEPS) {
        results.push(await this.step(vault, profile, { asset: step.asset, sizeUsd: step.sizeUsd }));
      }
      return results;
    }

    for (let k = 0; k < steps; k++) {
      results.push(await this.step(vault, profile));
      if (steps > 1) await sleep(1_500);
    }
    return results;
  }

  private async step(
    vault: Address,
    profile: Profile,
    override?: { asset: string; sizeUsd: number },
  ): Promise<StepResult> {
    const ctx = await this.loadContext(vault);
    const signals = await this.loadSignals();

    // ── propose
    let record;
    try {
      record = await propose({
        mandateEnglish: ctx.mandateEnglish,
        state: ctx.stateSummary,
        signals,
        profile: profile.id,
        fixture: profile.fixture ?? profile.id,
      });
    } catch (e) {
      return this.remember({ ok: false, action: 'none', profile: profile.id, note: `proposal failed: ${(e as Error).message}` });
    }

    let proposal = record.proposal;
    if (override) proposal = { ...proposal, action: 'BUY', asset: override.asset, sizeUsd: override.sizeUsd };
    if (profile.mutate) proposal = profile.mutate(proposal);
    proposal = { ...proposal, asset: this.resolveRole(proposal.asset, ctx) };

    if (proposal.action === 'HOLD') {
      return this.remember({
        ok: true,
        action: 'HOLD',
        profile: profile.id,
        rationale: proposal.rationale,
        note: 'agent chose to hold',
      });
    }

    // The rationale is posted before the intent is signed, so the hash on-chain always resolves to
    // text that already exists. Posting it afterwards would leave a window where an incident replay
    // can show a commitment with nothing behind it.
    await this.postRationale(record.promptExcerpt, proposal.rationale, record.model, profile.id);

    // ── map to raw units
    let intent: TradeIntent;
    try {
      intent = buildIntent({
        vault,
        mandate: ctx.mandate,
        proposal,
        assets: ctx.assets,
        settlementDecimals: ctx.settlementDecimals,
        adapter: ctx.adapter,
        nonce: this.nextNonce(),
        ...(profile.signAfterExpiry ? { issuedAt: ctx.mandate.expiry + 60n } : {}),
      });
    } catch (e) {
      if (e instanceof UnmappableProposal) {
        return this.remember({ ok: false, action: proposal.action, profile: profile.id, note: e.message });
      }
      throw e;
    }

    // ── pre-flight
    const preflight = await ctx.client.preflight(intent);
    if (profile.preflight && !preflight.ok) {
      return this.remember({
        ok: false,
        action: proposal.action,
        profile: profile.id,
        nonce: intent.nonce.toString(),
        ruleId: preflight.ruleId,
        rule: preflight.ruleId === 0 ? undefined : RULES[preflight.ruleId].title,
        slashable: preflight.slashable,
        rationale: proposal.rationale,
        note: 'pre-flight failed; the agent declined to sign. Nothing was submitted and nothing was slashed.',
      });
    }

    // ── sign
    const sig = await signIntent({
      signTypedData: (a) => this.signer.signTypedData(a as never),
      intent,
      chainId: ctx.chainId,
    });

    // ── submit
    if (profile.route === 'relay') {
      const res = await fetch(`${env.SERVER_URL}/intents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent: serialiseIntent(intent), sig, profile: profile.id }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      return this.remember({
        ok: res.ok,
        action: proposal.action,
        profile: profile.id,
        nonce: intent.nonce.toString(),
        route: 'relay',
        submitted: Boolean(body.submitted),
        published: Boolean(body.published),
        ruleId: body.ruleId as number | undefined,
        rule: typeof body.ruleId === 'number' && body.ruleId !== 0 ? RULES[body.ruleId as 101].title : undefined,
        slashable: Boolean(body.slashable),
        txHash: body.txHash as string | undefined,
        rationale: proposal.rationale,
        note: body.reason as string | undefined,
      });
    }

    if (!env.AGENT_TX_PK) {
      return this.remember({
        ok: false,
        action: proposal.action,
        profile: profile.id,
        note: 'route=direct needs AGENT_TX_PK so the agent can pay its own gas',
      });
    }

    const wallet = createWalletClient({
      account: privateKeyToAccount(env.AGENT_TX_PK as `0x${string}`),
      chain: chainFor(ctx.chainId),
      transport: http(rpcFor(ctx.chainId)),
    });

    const txHash = await wallet.writeContract({
      address: vault,
      abi: velanosVaultAbi,
      functionName: 'execute',
      args: [intent as never, sig],
      chain: chainFor(ctx.chainId),
      account: wallet.account,
    });

    return this.remember({
      ok: true,
      action: proposal.action,
      profile: profile.id,
      nonce: intent.nonce.toString(),
      route: 'direct',
      submitted: true,
      txHash,
      rationale: proposal.rationale,
      note: 'submitted directly to the vault; the outcome is whatever the guard decided on-chain',
    });
  }

  // ───────────────────────────────── context ──────────────────────────────────

  /** Maps the `$ALLOWED` / `$FORBIDDEN` placeholders in a profile to tickers of this vault's universe. */
  private resolveRole(asset: string, ctx: { mandate: Mandate; assets: AssetBook }): string {
    if (asset !== '$ALLOWED' && asset !== '$FORBIDDEN') return asset;
    const inMandate = new Set(ctx.mandate.allowedAssets.map((a) => a.toLowerCase()));
    const wanted = asset === '$ALLOWED';
    const tickers = Object.entries(ctx.assets)
      .filter(([t, a]) => t !== 'USDG' && inMandate.has(a.address.toLowerCase()) === wanted)
      .map(([t]) => t);
    if (tickers.length === 0) throw new Error(`no ${wanted ? 'allowed' : 'forbidden'} asset to use for this vault`);
    return tickers[0] as string;
  }

  private async loadContext(vault: Address) {
    const res = await fetch(`${env.SERVER_URL}/vaults/${vault}`);
    if (!res.ok) throw new Error(`server does not know vault ${vault}`);
    const v = (await res.json()) as {
      chainId: number;
      mandate: Record<string, unknown>;
      mandateEnglish: string[];
      settlementSymbol: string;
      settlementDecimals: number;
      nav: string;
      pricePerShareWad: string;
      floorWad: string;
      hwmWad: string;
      state: number;
      strikes: number;
      bondAvailable: string;
      positions: Array<{ symbol: string; amount: string; asset: string }>;
    };

    const chainId = v.chainId;
    // The chain and the protocol addresses are both passed explicitly so the agent works against a
    // local anvil fork as well as the public testnets — the committed address book only covers the
    // latter, and a demo that cannot be rehearsed locally is a demo that gets rehearsed on camera.
    const addresses = await this.loadProtocolAddresses(chainId);
    const client = new VelanosClient({
      chainId,
      chain: chainFor(chainId),
      addresses,
      ...(rpcFor(chainId) ? { rpcUrl: rpcFor(chainId) as string } : {}),
      relayUrl: env.SERVER_URL,
    });

    const mandate = (await client.getMandate(vault)) as Mandate;
    const assets = await this.loadAssetBook(chainId);

    const dec = v.settlementDecimals;
    const stateSummary = [
      `Vault NAV: ${formatUnits(BigInt(v.nav), dec)} ${v.settlementSymbol}`,
      `NAV per share: ${formatUnits(BigInt(v.pricePerShareWad), 18)}`,
      `High-water mark: ${formatUnits(BigInt(v.hwmWad), 18)}`,
      `Loss floor: ${formatUnits(BigInt(v.floorWad), 18)} per share`,
      `Your bond at stake: ${formatUnits(BigInt(v.bondAvailable), dec)} ${v.settlementSymbol}`,
      `Vault state code: ${v.state}; stateful strikes in window: ${v.strikes}/3`,
      v.positions.length > 0
        ? `Current holdings: ${v.positions.map((p) => `${p.symbol} ${p.amount}`).join(', ')}`
        : 'Current holdings: none',
    ].join('\n');

    return {
      chainId,
      client,
      mandate,
      mandateEnglish: v.mandateEnglish,
      settlementDecimals: dec,
      assets,
      adapter: mandate.allowedAdapters[0] as Address,
      stateSummary,
    };
  }

  private async loadProtocolAddresses(chainId: number) {
    const d = await this.readDeployment(chainId);
    return {
      BondManager: d?.contracts.BondManager,
      ViolationCourt: d?.contracts.ViolationCourt,
      PolicyGuard: d?.contracts.PolicyGuard,
      VaultFactory: d?.contracts.VaultFactory,
    };
  }

  private async readDeployment(chainId: number) {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const path = join(
      import.meta.dirname, '..', '..', '..', 'packages', 'config', 'deployments', `${chainId}.json`,
    );
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as {
        contracts: Record<string, Address>;
        assets: Record<string, { address: Address; decimals: number; symbol: string }>;
      };
    } catch {
      return undefined;
    }
  }

  /** Tickers to addresses, read from the generated address book. No address literal lives here. */
  private async loadAssetBook(chainId: number): Promise<AssetBook> {
    const book: AssetBook = {};
    const d = await this.readDeployment(chainId);
    if (!d) return book;
    for (const [ticker, entry] of Object.entries(d.assets)) book[ticker.toUpperCase()] = entry;
    return book;
  }

  private async loadSignals(): Promise<string> {
    try {
      const res = await fetch(`${env.SERVER_URL}/feeds/news`);
      const feed = (await res.json()) as { headlines: Array<{ source: string; headline: string }> };
      return feed.headlines.map((h) => `- [${h.source}] ${h.headline}`).join('\n');
    } catch {
      return '- (no signals available)';
    }
  }

  private async postRationale(
    promptExcerpt: string,
    text: string,
    model: string,
    profile: string,
  ): Promise<void> {
    const { rationaleHash } = await import('@velanos/agent-sdk');
    await fetch(`${env.SERVER_URL}/rationales`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hash: rationaleHash(text), text, model, profile, promptExcerpt }),
    }).catch(() => undefined);
  }

  private async setNewsPoisoned(poisoned: boolean): Promise<void> {
    await fetch(`${env.SERVER_URL}/demo/news/poison`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-demo-token': env.DEMO_ADMIN_TOKEN },
      body: JSON.stringify({ poisoned }),
    }).catch(() => undefined);
  }

  /** Time-seeded so repeated demo runs against the same vault never collide on a nonce. */
  private nextNonce(): bigint {
    this.nonceCursor += 1n;
    return this.nonceCursor;
  }

  private remember(result: StepResult): StepResult {
    this.lastResult = result;
    const bits = [
      result.profile,
      result.action,
      result.ruleId ? `rule ${result.ruleId}` : undefined,
      result.txHash ? `tx ${result.txHash.slice(0, 10)}…` : undefined,
      result.note,
    ].filter(Boolean);
    console.log(`[agent] ${bits.join(' · ')}`);
    return result;
  }
}

export { PROFILES };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
