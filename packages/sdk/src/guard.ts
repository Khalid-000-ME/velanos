import {
  type CheckResult,
  IntentKind,
  type Mandate,
  type RuleId,
  type TradeIntent,
  VaultKind,
  type VaultSnapshot,
  VaultState,
} from './types.js';

export const BPS = 10_000n;
export const WAD = 10n ** 18n;

/** An intent may stay valid for at most 5 minutes. Mirrors `PolicyGuard.MAX_INTENT_VALIDITY`. */
export const MAX_INTENT_VALIDITY = 300n;

/**
 * A faithful mirror of `PolicyGuard`, in TypeScript.
 *
 * The point of the mirror is that an honest agent can know the verdict before it signs. The relay
 * runs it to refuse forwarding a bad intent, the watcher runs it to spot a slashable one, and the
 * UI runs it to show a checklist — all without a round trip to a node.
 *
 * It is a mirror, not a second opinion. The contract decides; this predicts. A differential test
 * (`test/differential.test.ts`) fuzzes both implementations against each other so a divergence
 * fails in CI, because a mirror that silently drifts is worse than no mirror at all.
 */

// ──────────────────────────────── static rules ────────────────────────────────

/**
 * Rules the agent could have evaluated from the intent and the mandate alone.
 * Order: 108 → 102 → 101 → 104 → 103 → 107 → 105 → 106. First failure wins.
 */
export function checkStatic(intent: TradeIntent, mandate: Mandate, frozenAt: bigint): RuleId | 0 {
  if (!kindAllowed(intent.kind, mandate.kind)) return 108;
  if (!contains(mandate.allowedAdapters, intent.adapter)) return 102;
  if (!assetsAllowed(intent, mandate)) return 101;
  if (!leverageAllowed(intent, mandate)) return 104;
  if (sizeCapped(intent.kind) && intent.amountIn > mandate.maxTradeAmount) return 103;
  if (intent.deadline < intent.issuedAt || intent.deadline - intent.issuedAt > MAX_INTENT_VALIDITY) {
    return 107;
  }
  if (intent.issuedAt < mandate.start || intent.issuedAt >= mandate.expiry) return 105;
  if (frozenAt !== 0n && intent.issuedAt >= frozenAt) return 106;
  return 0;
}

// ─────────────────────────────── stateful rules ───────────────────────────────

/**
 * Rules that depend on live state. Order: 204 → 206 → 205 → 202 → 201 → 203.
 * Never slashable — these are the ones an honest agent trips.
 */
export function checkStateful(
  intent: TradeIntent,
  mandate: Mandate,
  snapshot: VaultSnapshot,
  nowTs: bigint,
): RuleId | 0 {
  if (nowTs > intent.deadline) return 204;
  if (snapshot.state !== VaultState.ACTIVE) return 206;
  if (snapshot.assetInBalance < intent.amountIn) return 205;
  if (slippageBreached(intent, mandate, snapshot)) return 202;
  if (exposureBreached(intent, mandate, snapshot)) return 201;
  if (dailyLossBreached(intent, mandate, snapshot)) return 203;
  return 0;
}

// ───────────────────────────────── explain ────────────────────────────────────

/**
 * Every rule evaluated with its actual value and limit, in the order the inspector renders them.
 * Unlike the check functions this does not stop at the first failure, so the screen can show a
 * full checklist rather than one red line.
 */
export function explain(
  intent: TradeIntent,
  mandate: Mandate,
  frozenAt: bigint,
  snapshot: VaultSnapshot,
  nowTs: bigint,
): CheckResult[] {
  const window =
    intent.deadline >= intent.issuedAt ? intent.deadline - intent.issuedAt : 2n ** 256n - 1n;

  return [
    row(108, kindAllowed(intent.kind, mandate.kind), BigInt(intent.kind), BigInt(mandate.kind)),
    row(
      102,
      contains(mandate.allowedAdapters, intent.adapter),
      0n,
      BigInt(mandate.allowedAdapters.length),
    ),
    row(101, assetsAllowed(intent, mandate), 0n, BigInt(mandate.allowedAssets.length)),
    row(104, leverageAllowed(intent, mandate), BigInt(intent.leverageBps), BigInt(mandate.maxLeverageBps)),
    row(
      103,
      !sizeCapped(intent.kind) || intent.amountIn <= mandate.maxTradeAmount,
      intent.amountIn,
      mandate.maxTradeAmount,
    ),
    row(107, window <= MAX_INTENT_VALIDITY, window, MAX_INTENT_VALIDITY),
    row(
      105,
      intent.issuedAt >= mandate.start && intent.issuedAt < mandate.expiry,
      intent.issuedAt,
      mandate.expiry,
    ),
    row(106, frozenAt === 0n || intent.issuedAt < frozenAt, intent.issuedAt, frozenAt),

    row(204, nowTs <= intent.deadline, nowTs, intent.deadline),
    row(
      206,
      snapshot.state === VaultState.ACTIVE,
      BigInt(snapshot.state),
      BigInt(VaultState.ACTIVE),
    ),
    row(205, snapshot.assetInBalance >= intent.amountIn, snapshot.assetInBalance, intent.amountIn),
    row(
      202,
      !slippageBreached(intent, mandate, snapshot),
      snapshot.quotedOut,
      slippageFloor(mandate, snapshot),
    ),
    row(
      201,
      !exposureBreached(intent, mandate, snapshot),
      exposureAfterBps(intent, snapshot),
      BigInt(mandate.maxAssetExposureBps),
    ),
    row(
      203,
      !dailyLossBreached(intent, mandate, snapshot),
      snapshot.pricePerShareWad,
      dailyLossFloorWad(mandate, snapshot),
    ),
  ];
}

// ─────────────────────────────── derived views ────────────────────────────────

/** NAV per share below which the bond is called on. Measured from the high-water mark. */
export function floorPricePerShareWad(hwmWad: bigint, maxDrawdownBps: number): bigint {
  return (hwmWad * (BPS - BigInt(maxDrawdownBps))) / BPS;
}

export function drawdownShortfall(
  pricePerShareWad: bigint,
  floorWad: bigint,
  totalSupply: bigint,
): bigint {
  if (pricePerShareWad >= floorWad) return 0n;
  return ((floorWad - pricePerShareWad) * totalSupply) / WAD;
}

export function exposureAfterBps(intent: TradeIntent, snapshot: VaultSnapshot): bigint {
  if (snapshot.navSettlement === 0n) return 0n;
  return ((snapshot.assetValueBefore + intent.amountIn) * BPS) / snapshot.navSettlement;
}

// ───────────────────────────────── internals ──────────────────────────────────

function row(ruleId: RuleId, passed: boolean, actual: bigint, limit: bigint): CheckResult {
  return { ruleId, passed, actual, limit };
}

function kindAllowed(kind: IntentKind, vaultKind: VaultKind): boolean {
  const isPerpIntent = kind === IntentKind.PERP_OPEN || kind === IntentKind.PERP_CLOSE;
  return isPerpIntent === (vaultKind === VaultKind.PERP);
}

/** Both legs are checked, so there is no route out of the asset set via an exotic "settlement" token. */
function assetsAllowed(intent: TradeIntent, mandate: Mandate): boolean {
  if (intent.kind === IntentKind.SPOT_BUY) {
    return (
      eq(intent.assetIn, mandate.settlementAsset) && contains(mandate.allowedAssets, intent.assetOut)
    );
  }
  if (intent.kind === IntentKind.SPOT_SELL) {
    return (
      eq(intent.assetOut, mandate.settlementAsset) && contains(mandate.allowedAssets, intent.assetIn)
    );
  }
  return (
    eq(intent.assetIn, mandate.settlementAsset) && contains(mandate.allowedAssets, intent.assetOut)
  );
}

function leverageAllowed(intent: TradeIntent, mandate: Mandate): boolean {
  if (mandate.kind === VaultKind.SPOT) return BigInt(intent.leverageBps) === BPS;
  return BigInt(intent.leverageBps) >= BPS && intent.leverageBps <= mandate.maxLeverageBps;
}

/** Only risk-increasing legs are capped: capping a sell would trap an agent trying to de-risk. */
function sizeCapped(kind: IntentKind): boolean {
  return kind === IntentKind.SPOT_BUY || kind === IntentKind.PERP_OPEN;
}

function increasesExposure(kind: IntentKind): boolean {
  return kind === IntentKind.SPOT_BUY || kind === IntentKind.PERP_OPEN;
}

function slippageFloor(mandate: Mandate, snapshot: VaultSnapshot): bigint {
  return (snapshot.oracleOut * (BPS - BigInt(mandate.maxSlippageBps))) / BPS;
}

function slippageBreached(
  intent: TradeIntent,
  mandate: Mandate,
  snapshot: VaultSnapshot,
): boolean {
  if (snapshot.oracleOut === 0n && intent.minOut === 0n) return false;
  if (intent.minOut !== 0n && snapshot.quotedOut < intent.minOut) return true;
  if (snapshot.oracleOut === 0n) return false;
  return snapshot.quotedOut < slippageFloor(mandate, snapshot);
}

function exposureBreached(
  intent: TradeIntent,
  mandate: Mandate,
  snapshot: VaultSnapshot,
): boolean {
  if (!increasesExposure(intent.kind)) return false;
  if (snapshot.navSettlement === 0n) return false;
  return exposureAfterBps(intent, snapshot) > BigInt(mandate.maxAssetExposureBps);
}

function dailyLossFloorWad(mandate: Mandate, snapshot: VaultSnapshot): bigint {
  return (snapshot.dayOpenPricePerShareWad * (BPS - BigInt(mandate.maxDailyLossBps))) / BPS;
}

/** A bad day stops new risk but never blocks de-risking. */
function dailyLossBreached(
  intent: TradeIntent,
  mandate: Mandate,
  snapshot: VaultSnapshot,
): boolean {
  if (!increasesExposure(intent.kind)) return false;
  if (snapshot.dayOpenPricePerShareWad === 0n) return false;
  return snapshot.pricePerShareWad < dailyLossFloorWad(mandate, snapshot);
}

function contains(set: readonly string[], needle: string): boolean {
  return set.some((a) => eq(a, needle));
}

function eq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
