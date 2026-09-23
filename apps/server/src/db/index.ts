import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { env } from '../env';
import * as schema from './schema';

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

const sqlite = new Database(env.DATABASE_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export { schema };

/**
 * Creates the tables on first run.
 *
 * Plain DDL rather than a migration chain: the database is a cache of on-chain state, so the
 * recovery procedure for any schema problem is to delete the file and let the indexer replay from
 * `deployedAtBlock`. Carrying migrations for data that is rebuildable in seconds would be ceremony.
 */
export function migrate(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chain_cursors (
      chain_id INTEGER PRIMARY KEY, last_block INTEGER NOT NULL, updated_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS agents (
      chain_id INTEGER NOT NULL, agent_id INTEGER NOT NULL, operator TEXT NOT NULL,
      signer TEXT NOT NULL, name TEXT NOT NULL, metadata_uri TEXT NOT NULL DEFAULT '',
      erc8004_id TEXT NOT NULL DEFAULT '0', clean_seasons INTEGER NOT NULL DEFAULT 0,
      slash_count INTEGER NOT NULL DEFAULT 0, registered_at INTEGER NOT NULL,
      PRIMARY KEY (chain_id, agent_id));
    CREATE INDEX IF NOT EXISTS agents_by_signer ON agents(signer);

    CREATE TABLE IF NOT EXISTS vaults (
      chain_id INTEGER NOT NULL, address TEXT NOT NULL, agent_id INTEGER NOT NULL,
      name TEXT NOT NULL, symbol TEXT NOT NULL DEFAULT '', kind INTEGER NOT NULL,
      mandate_hash TEXT NOT NULL, perp_adapter TEXT,
      settlement_asset TEXT NOT NULL DEFAULT '', settlement_symbol TEXT NOT NULL DEFAULT '',
      settlement_decimals INTEGER NOT NULL DEFAULT 6, mandate_json TEXT NOT NULL DEFAULT '{}',
      state INTEGER NOT NULL DEFAULT 0, freeze_reason INTEGER NOT NULL DEFAULT 0,
      frozen_at INTEGER NOT NULL DEFAULT 0, settled_at INTEGER NOT NULL DEFAULT 0,
      nav TEXT NOT NULL DEFAULT '0', price_per_share_wad TEXT NOT NULL DEFAULT '0',
      hwm_wad TEXT NOT NULL DEFAULT '0', floor_wad TEXT NOT NULL DEFAULT '0',
      bond_available TEXT NOT NULL DEFAULT '0', bond_slashed TEXT NOT NULL DEFAULT '0',
      bond_staked TEXT NOT NULL DEFAULT '0', static_violations INTEGER NOT NULL DEFAULT 0,
      strikes INTEGER NOT NULL DEFAULT 0, created_at_block INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chain_id, address));
    CREATE INDEX IF NOT EXISTS vaults_by_agent ON vaults(chain_id, agent_id);
    CREATE INDEX IF NOT EXISTS vaults_by_state ON vaults(state);

    CREATE TABLE IF NOT EXISTS intents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chain_id INTEGER NOT NULL, vault TEXT NOT NULL,
      nonce TEXT NOT NULL, status TEXT NOT NULL, rule_id INTEGER, slashed INTEGER NOT NULL DEFAULT 0,
      kind INTEGER, asset_in TEXT, asset_out TEXT, asset_symbol TEXT, amount_in TEXT, amount_out TEXT,
      rationale_hash TEXT, tx_hash TEXT, block_number INTEGER, ts INTEGER NOT NULL,
      route TEXT NOT NULL DEFAULT 'direct', intent_json TEXT, signature TEXT);
    CREATE INDEX IF NOT EXISTS intents_by_vault ON intents(chain_id, vault, ts);
    CREATE UNIQUE INDEX IF NOT EXISTS intents_unique_nonce ON intents(chain_id, vault, nonce);

    CREATE TABLE IF NOT EXISTS rationales (
      hash TEXT PRIMARY KEY, text TEXT NOT NULL, model TEXT NOT NULL DEFAULT '',
      profile TEXT NOT NULL DEFAULT '', prompt_excerpt TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS slashes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chain_id INTEGER NOT NULL, vault TEXT NOT NULL,
      nonce TEXT, rule_id INTEGER, reporter TEXT, penalty_paid TEXT NOT NULL DEFAULT '0',
      bounty_paid TEXT NOT NULL DEFAULT '0', kind INTEGER NOT NULL DEFAULT 0,
      tx_hash TEXT, ts INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS slashes_by_vault ON slashes(chain_id, vault);

    CREATE TABLE IF NOT EXISTS nav_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chain_id INTEGER NOT NULL, vault TEXT NOT NULL,
      nav TEXT NOT NULL, price_per_share_wad TEXT NOT NULL, hwm_wad TEXT NOT NULL,
      floor_wad TEXT NOT NULL, ts INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS nav_by_vault_ts ON nav_points(chain_id, vault, ts);

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chain_id INTEGER NOT NULL, vault TEXT NOT NULL,
      title TEXT NOT NULL, category TEXT NOT NULL, rule_id INTEGER,
      total_paid_to_depositors TEXT NOT NULL DEFAULT '0',
      total_paid_to_reporter TEXT NOT NULL DEFAULT '0',
      steps_json TEXT NOT NULL DEFAULT '[]', opened_at INTEGER NOT NULL, closed_at INTEGER);
    CREATE INDEX IF NOT EXISTS incidents_by_vault ON incidents(chain_id, vault);

    CREATE TABLE IF NOT EXISTS positions (
      chain_id INTEGER NOT NULL, vault TEXT NOT NULL, asset TEXT NOT NULL,
      symbol TEXT NOT NULL DEFAULT '', amount TEXT NOT NULL DEFAULT '0',
      value_settlement TEXT NOT NULL DEFAULT '0', exposure_bps INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL, PRIMARY KEY (chain_id, vault, asset));

    CREATE TABLE IF NOT EXISTS feed_intents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chain_id INTEGER NOT NULL, vault TEXT NOT NULL,
      nonce TEXT NOT NULL, intent_json TEXT NOT NULL, signature TEXT NOT NULL,
      rule_id INTEGER NOT NULL, slashable INTEGER NOT NULL DEFAULT 1,
      reported_tx_hash TEXT, ts INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS feed_unique ON feed_intents(chain_id, vault, nonce);

    CREATE TABLE IF NOT EXISTS heartbeats (
      service TEXT PRIMARY KEY, ts INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '');

    CREATE TABLE IF NOT EXISTS market_shocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chain_id INTEGER NOT NULL, asset TEXT NOT NULL,
      symbol TEXT NOT NULL DEFAULT '', bps INTEGER NOT NULL,
      from_usd8 TEXT NOT NULL DEFAULT '0', to_usd8 TEXT NOT NULL DEFAULT '0',
      tx_hash TEXT, ts INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS shocks_by_ts ON market_shocks(ts);
  `);
}

/** Wipes indexed state so the indexer replays from scratch. Used by `POST /demo/reset`. */
export function resetIndexedState(): void {
  sqlite.exec(`
    DELETE FROM chain_cursors; DELETE FROM agents; DELETE FROM vaults; DELETE FROM intents;
    DELETE FROM slashes; DELETE FROM nav_points; DELETE FROM incidents; DELETE FROM positions;
    DELETE FROM feed_intents; DELETE FROM market_shocks;
  `);
}
