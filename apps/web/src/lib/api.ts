/**
 * Typed access to the indexer API.
 *
 * Read paths run on the server so the browser never needs chain RPC to render a page, and the demo
 * stays fast on a conference network. Writes go through the wallet, not through here — the server
 * has no authority over a vault and this module is not a way to get any.
 */
/**
 * Where the indexer API lives, as seen from this app's server.
 *
 * `VELANOS_API_URL` is read per request, so a tunnel URL can be changed in the host's settings without
 * rebuilding the client bundle. `NEXT_PUBLIC_SERVER_URL` stays supported for local work.
 */
export function apiBase(): string {
  return (
    process.env.VELANOS_API_URL ?? process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000'
  ).replace(/\/$/, '');
}

/** ngrok answers a browser-looking request with an interstitial unless this header is present. */
export function apiHeaders(): Record<string, string> {
  return { 'ngrok-skip-browser-warning': 'true', 'user-agent': 'velanos-web' };
}

/** The agent harness, which the operator console asks for its status. */
export function agentBase(): string {
  return (process.env.VELANOS_AGENT_URL ?? 'http://localhost:4100').replace(/\/$/, '');
}

/**
 * What the browser calls. Always this app's own origin: the proxy behind it reaches the API, so a
 * tunnelled backend needs no CORS and never shows its interstitial to an EventSource.
 */
export const browserApi = '/api/velanos';

const BASE = apiBase();

export const serverUrl = BASE;

export interface VaultSummary {
  chainId: number;
  address: string;
  agentId: number;
  name: string;
  symbol: string;
  kind: number;
  mandateHash: string;
  perpAdapter: string | null;
  settlementSymbol: string;
  settlementDecimals: number;
  state: number;
  freezeReason: number;
  frozenAt: number;
  settledAt: number;
  nav: string;
  pricePerShareWad: string;
  hwmWad: string;
  floorWad: string;
  bondAvailable: string;
  bondSlashed: string;
  bondStaked: string;
  staticViolations: number;
  strikes: number;
  updatedAt: number;
}

export interface MandateJson {
  agentSigner: string;
  operator: string;
  settlementAsset: string;
  kind: number;
  allowedAssets: string[];
  allowedAdapters: string[];
  maxAllocation: string;
  maxTradeAmount: string;
  maxAssetExposureBps: number;
  maxSlippageBps: number;
  maxLeverageBps: number;
  maxDrawdownBps: number;
  maxDailyLossBps: number;
  start: string;
  expiry: string;
  bondRequired: string;
  perViolationPenalty: string;
  reporterBountyBps: number;
  riskTier: number;
  metadataURI: string;
}

export interface VaultDetail extends VaultSummary {
  agent: AgentRow | null;
  mandate: MandateJson;
  mandateEnglish: string[];
  positions: Array<{
    asset: string;
    symbol: string;
    amount: string;
    valueSettlement: string;
    exposureBps: number;
  }>;
}

export interface AgentRow {
  chainId: number;
  agentId: number;
  operator: string;
  signer: string;
  name: string;
  metadataURI: string;
  erc8004Id: string;
  cleanSeasons: number;
  slashCount: number;
  registeredAt: number;
}

export interface AgentWithStats extends AgentRow {
  vaultCount: number;
  bondLocked: string;
  bondSlashed: string;
  chains: number[];
  vaults: VaultSummary[];
}

export interface IntentRow {
  id: number;
  chainId: number;
  vault: string;
  nonce: string;
  status: 'executed' | 'rejected' | 'slashed' | 'ignored' | 'published';
  ruleId: number | null;
  slashed: boolean;
  kind: number | null;
  assetIn: string | null;
  assetOut: string | null;
  assetSymbol: string | null;
  amountIn: string | null;
  amountOut: string | null;
  rationaleHash: string | null;
  txHash: string | null;
  ts: number;
  route: string;
  rationale: string | null;
  model: string | null;
  profile: string | null;
  txUrl: string | null;
}

export interface RuleMeta {
  code: string;
  title: string;
  slashable: boolean;
  band: 'static' | 'stateful' | 'validity';
  description: string;
}

export interface CheckRow {
  ruleId: number;
  passed: boolean;
  actual: string;
  limit: string;
  rule?: RuleMeta;
}

export interface IntentDetail {
  chainId: number;
  vault: string;
  nonce: string;
  intent: Record<string, string | number | boolean>;
  signature: string | null;
  signer: string;
  digest: string;
  status: string;
  ruleId: number | null;
  rule: RuleMeta | null;
  slashed: boolean;
  txHash: string | null;
  txUrl: string | null;
  amountOut: string | null;
  rationale: { text: string; model: string; profile: string } | null;
  checks: CheckRow[];
  slash: {
    penaltyPaid: string;
    bountyPaid: string;
    reporter: string | null;
    txUrl: string | null;
  } | null;
}

export interface IncidentStep {
  type: string;
  ts: number;
  label: string;
  txHash?: string;
  txUrl?: string | null;
  data?: Record<string, unknown>;
}

export interface IncidentDetail {
  id: number;
  chainId: number;
  vault: string;
  vaultName: string;
  settlementSymbol: string;
  settlementDecimals: number;
  title: string;
  category: 'static_violation' | 'drawdown' | 'late_settlement';
  ruleId: number | null;
  rule: RuleMeta | null;
  totalPaidToDepositors: string;
  totalPaidToReporter: string;
  steps: IncidentStep[];
  openedAt: number;
  closedAt: number | null;
}

export interface IncidentSummary {
  id: number;
  chainId: number;
  vault: string;
  title: string;
  category: string;
  ruleId: number | null;
  rule: RuleMeta | null;
  totalPaidToDepositors: string;
  totalPaidToReporter: string;
  stepCount: number;
  openedAt: number;
  closedAt: number | null;
}

export interface ChainStatus {
  chains: Array<{
    chainId: number;
    label: string;
    deployed: boolean;
    head: number | null;
    indexedBlock: number | null;
    blocksBehind: number | null;
    mode: { usdg: string; stocks: string | null; perp: string | null } | null;
    contracts: Record<string, string> | null;
    assets: Record<string, { address: string; symbol: string; decimals: number }> | null;
  }>;
  modes: Record<string, string>;
  services: Array<{ service: string; ts: number; detail: string; live: boolean }>;
  llmMode: string;
}

export interface Stats {
  totalBonded: string;
  totalSlashedToDepositors: string;
  violationsBlocked: number;
  vaultCount: number;
  activeVaults: number;
}

export interface FeedEntry {
  id: number;
  chainId: number;
  vault: string;
  /** ViolationCourt on this chain, read from the deployment file by the indexer. */
  courtAddress: string | null;
  nonce: string;
  intent: Record<string, string | number | boolean>;
  signature: `0x${string}`;
  ruleId: number;
  rule: RuleMeta;
  slashable: boolean;
  reported: boolean;
  reportedTxUrl: string | null;
  ts: number;
}

export interface NavSeries {
  points: Array<{
    ts: number;
    nav: string;
    pricePerShareWad: string;
    hwmWad: string;
    floorWad: string;
  }>;
  markers: {
    slashes: Array<{ ts: number; amount: string; kind: number; txHash: string | null }>;
    shocks: Array<{ ts: number; symbol: string; bps: number; txHash: string | null }>;
  };
}

/**
 * Fetches JSON, returning `null` rather than throwing when the indexer is unreachable.
 *
 * Every screen is designed to render a labelled empty state in that case. A judge opening the app
 * before the stack is warm should see "the indexer is not running", not a stack trace.
 */
async function get<T>(path: string, revalidate = 0): Promise<T | null> {
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      headers: apiHeaders(),
      // Chain state is live; a cached NAV is a wrong NAV.
      next: revalidate > 0 ? { revalidate } : undefined,
      cache: revalidate > 0 ? undefined : 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const api = {
  chainStatus: () => get<ChainStatus>('/chains/status'),
  stats: () => get<Stats>('/stats'),
  vaults: () => get<{ vaults: VaultSummary[] }>('/vaults'),
  vault: (address: string) => get<VaultDetail>(`/vaults/${address}`),
  vaultNav: (address: string, range = '24h') =>
    get<NavSeries>(`/vaults/${address}/nav?range=${range}`),
  vaultIntents: (address: string, limit = 50) =>
    get<{ intents: IntentRow[] }>(`/vaults/${address}/intents?limit=${limit}`),
  agents: () => get<{ agents: AgentWithStats[] }>('/agents'),
  agent: (id: string) =>
    get<{
      agent: AgentRow;
      allChains: AgentRow[];
      vaults: VaultSummary[];
      violations: Array<{
        chainId: number;
        vault: string;
        ruleId: number | null;
        penaltyPaid: string;
        bountyPaid: string;
        reporter: string | null;
        ts: number;
        txUrl: string | null;
      }>;
    }>(`/agents/${id}`),
  intent: (chainId: number, vault: string, nonce: string) =>
    get<IntentDetail>(`/intents/${chainId}/${vault}/${nonce}`),
  incidents: (vault?: string) =>
    get<{ incidents: IncidentSummary[] }>(`/incidents${vault ? `?vault=${vault}` : ''}`),
  incident: (id: string) => get<IncidentDetail>(`/incidents/${id}`),
  feed: () => get<{ intents: FeedEntry[] }>('/feed/intents/list'),
  news: () => get<{ poisoned: boolean; headlines: Array<{ source: string; headline: string }> }>('/feeds/news'),
  seeds: () => get<{ seeds: Array<{ chainId: number; seed: { agentId: number; vaults: Record<string, string> } }> }>('/demo/seed'),
};

export function explorerTxUrl(chainId: number, hash: string): string {
  const bases: Record<number, string> = {
    46630: 'https://explorer.testnet.chain.robinhood.com',
    421614: 'https://sepolia.arbiscan.io',
  };
  const base = bases[chainId];
  return base ? `${base}/tx/${hash}` : '';
}

export function explorerAddressUrl(chainId: number, address: string): string {
  const bases: Record<number, string> = {
    46630: 'https://explorer.testnet.chain.robinhood.com',
    421614: 'https://sepolia.arbiscan.io',
  };
  const base = bases[chainId];
  return base ? `${base}/address/${address}` : '';
}

export const CHAIN_LABELS: Record<number, string> = {
  46630: 'Robinhood Chain testnet',
  421614: 'Arbitrum Sepolia',
};

export const CHAIN_SHORT: Record<number, string> = {
  46630: 'Robinhood',
  421614: 'Arbitrum',
};
