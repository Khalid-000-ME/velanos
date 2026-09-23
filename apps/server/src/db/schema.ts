import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Indexed protocol state.
 *
 * Everything here is derived from on-chain logs and can be rebuilt by deleting the file and
 * letting the indexer replay. Nothing in this database is authoritative — the chain is — which is
 * why the UI can show it without ever becoming a second source of truth for a number a depositor
 * is relying on.
 *
 * Token amounts are stored as decimal strings, not integers: SQLite integers are 64-bit and a
 * uint256 is not, and silently truncating a balance would be worse than refusing to store it.
 */

export const chainCursors = sqliteTable('chain_cursors', {
  chainId: integer('chain_id').primaryKey(),
  lastBlock: integer('last_block').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const agents = sqliteTable(
  'agents',
  {
    chainId: integer('chain_id').notNull(),
    agentId: integer('agent_id').notNull(),
    operator: text('operator').notNull(),
    signer: text('signer').notNull(),
    name: text('name').notNull(),
    metadataURI: text('metadata_uri').notNull().default(''),
    erc8004Id: text('erc8004_id').notNull().default('0'),
    cleanSeasons: integer('clean_seasons').notNull().default(0),
    slashCount: integer('slash_count').notNull().default(0),
    registeredAt: integer('registered_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chainId, t.agentId] }),
    bySigner: index('agents_by_signer').on(t.signer),
  }),
);

export const vaults = sqliteTable(
  'vaults',
  {
    chainId: integer('chain_id').notNull(),
    address: text('address').notNull(),
    agentId: integer('agent_id').notNull(),
    name: text('name').notNull(),
    symbol: text('symbol').notNull().default(''),
    kind: integer('kind').notNull(),
    mandateHash: text('mandate_hash').notNull(),
    perpAdapter: text('perp_adapter'),
    settlementAsset: text('settlement_asset').notNull().default(''),
    settlementSymbol: text('settlement_symbol').notNull().default(''),
    settlementDecimals: integer('settlement_decimals').notNull().default(6),
    /** Mandate JSON, amounts as decimal strings. */
    mandateJson: text('mandate_json').notNull().default('{}'),
    state: integer('state').notNull().default(0),
    freezeReason: integer('freeze_reason').notNull().default(0),
    frozenAt: integer('frozen_at').notNull().default(0),
    settledAt: integer('settled_at').notNull().default(0),
    nav: text('nav').notNull().default('0'),
    pricePerShareWad: text('price_per_share_wad').notNull().default('0'),
    hwmWad: text('hwm_wad').notNull().default('0'),
    floorWad: text('floor_wad').notNull().default('0'),
    bondAvailable: text('bond_available').notNull().default('0'),
    bondSlashed: text('bond_slashed').notNull().default('0'),
    bondStaked: text('bond_staked').notNull().default('0'),
    staticViolations: integer('static_violations').notNull().default(0),
    strikes: integer('strikes').notNull().default(0),
    createdAtBlock: integer('created_at_block').notNull().default(0),
    updatedAt: integer('updated_at').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chainId, t.address] }),
    byAgent: index('vaults_by_agent').on(t.chainId, t.agentId),
    byState: index('vaults_by_state').on(t.state),
  }),
);

export const intents = sqliteTable(
  'intents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chainId: integer('chain_id').notNull(),
    vault: text('vault').notNull(),
    nonce: text('nonce').notNull(),
    /** 'executed' | 'rejected' | 'slashed' | 'ignored' | 'published' */
    status: text('status').notNull(),
    ruleId: integer('rule_id'),
    slashed: integer('slashed', { mode: 'boolean' }).notNull().default(false),
    kind: integer('kind'),
    assetIn: text('asset_in'),
    assetOut: text('asset_out'),
    assetSymbol: text('asset_symbol'),
    amountIn: text('amount_in'),
    amountOut: text('amount_out'),
    rationaleHash: text('rationale_hash'),
    txHash: text('tx_hash'),
    blockNumber: integer('block_number'),
    ts: integer('ts').notNull(),
    /** 'relay' | 'direct' | 'feed' */
    route: text('route').notNull().default('direct'),
    /** Full signed intent, so the inspector can recompute the checklist and the digest. */
    intentJson: text('intent_json'),
    signature: text('signature'),
  },
  (t) => ({
    byVault: index('intents_by_vault').on(t.chainId, t.vault, t.ts),
    uniqueNonce: uniqueIndex('intents_unique_nonce').on(t.chainId, t.vault, t.nonce),
  }),
);

export const rationales = sqliteTable('rationales', {
  hash: text('hash').primaryKey(),
  text: text('text').notNull(),
  model: text('model').notNull().default(''),
  profile: text('profile').notNull().default(''),
  promptExcerpt: text('prompt_excerpt').notNull().default(''),
  createdAt: integer('created_at').notNull(),
});

export const slashes = sqliteTable(
  'slashes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chainId: integer('chain_id').notNull(),
    vault: text('vault').notNull(),
    nonce: text('nonce'),
    ruleId: integer('rule_id'),
    reporter: text('reporter'),
    penaltyPaid: text('penalty_paid').notNull().default('0'),
    bountyPaid: text('bounty_paid').notNull().default('0'),
    /** 0 penalty, 1 drawdown top-up, 2 late penalty */
    kind: integer('kind').notNull().default(0),
    txHash: text('tx_hash'),
    ts: integer('ts').notNull(),
  },
  (t) => ({ byVault: index('slashes_by_vault').on(t.chainId, t.vault) }),
);

export const navPoints = sqliteTable(
  'nav_points',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chainId: integer('chain_id').notNull(),
    vault: text('vault').notNull(),
    nav: text('nav').notNull(),
    pricePerShareWad: text('price_per_share_wad').notNull(),
    hwmWad: text('hwm_wad').notNull(),
    floorWad: text('floor_wad').notNull(),
    ts: integer('ts').notNull(),
  },
  (t) => ({ byVaultTs: index('nav_by_vault_ts').on(t.chainId, t.vault, t.ts) }),
);

/**
 * An incident groups the events of one failure into a replayable story.
 *
 * Created on the first slash, freeze or drawdown trip for a vault, then appended to. The ordered
 * steps are what the replay screen animates: poisoned headline, LLM proposal, signature, guard
 * verdict, report, slash, credit. Reconstructing that sequence from raw logs at render time would
 * be slow and ambiguous, so it is assembled once at index time.
 */
export const incidents = sqliteTable(
  'incidents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chainId: integer('chain_id').notNull(),
    vault: text('vault').notNull(),
    title: text('title').notNull(),
    /** 'static_violation' | 'drawdown' | 'late_settlement' */
    category: text('category').notNull(),
    ruleId: integer('rule_id'),
    totalPaidToDepositors: text('total_paid_to_depositors').notNull().default('0'),
    totalPaidToReporter: text('total_paid_to_reporter').notNull().default('0'),
    /** Ordered step array as JSON. */
    stepsJson: text('steps_json').notNull().default('[]'),
    openedAt: integer('opened_at').notNull(),
    closedAt: integer('closed_at'),
  },
  (t) => ({ byVault: index('incidents_by_vault').on(t.chainId, t.vault) }),
);

export const positions = sqliteTable(
  'positions',
  {
    chainId: integer('chain_id').notNull(),
    vault: text('vault').notNull(),
    asset: text('asset').notNull(),
    symbol: text('symbol').notNull().default(''),
    amount: text('amount').notNull().default('0'),
    valueSettlement: text('value_settlement').notNull().default('0'),
    exposureBps: integer('exposure_bps').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.chainId, t.vault, t.asset] }) }),
);

/**
 * Signed intents the relay refused to submit.
 *
 * This table is the public evidence locker. An intent here never moved a cent of depositor money,
 * and is still enough to slash the agent that signed it — which is the whole reason prevention and
 * liability can be separated.
 */
export const feedIntents = sqliteTable(
  'feed_intents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chainId: integer('chain_id').notNull(),
    vault: text('vault').notNull(),
    nonce: text('nonce').notNull(),
    intentJson: text('intent_json').notNull(),
    signature: text('signature').notNull(),
    ruleId: integer('rule_id').notNull(),
    slashable: integer('slashable', { mode: 'boolean' }).notNull().default(true),
    reportedTxHash: text('reported_tx_hash'),
    ts: integer('ts').notNull(),
  },
  (t) => ({ uniq: uniqueIndex('feed_unique').on(t.chainId, t.vault, t.nonce) }),
);

export const heartbeats = sqliteTable('heartbeats', {
  service: text('service').primaryKey(),
  ts: integer('ts').notNull(),
  detail: text('detail').notNull().default(''),
});

export const marketShocks = sqliteTable(
  'market_shocks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chainId: integer('chain_id').notNull(),
    asset: text('asset').notNull(),
    symbol: text('symbol').notNull().default(''),
    bps: integer('bps').notNull(),
    fromUsd8: text('from_usd8').notNull().default('0'),
    toUsd8: text('to_usd8').notNull().default('0'),
    txHash: text('tx_hash'),
    ts: integer('ts').notNull(),
  },
  (t) => ({ byTs: index('shocks_by_ts').on(t.ts) }),
);
