import type { RuleId } from './types.js';

export interface RuleMeta {
  code: string;
  title: string;
  slashable: boolean;
  /** Which band the rule belongs to, which decides what happens when it fires. */
  band: 'static' | 'stateful' | 'validity';
  description: string;
}

/**
 * The single source of truth for rule copy.
 *
 * The UI, the incident replay, the docs page and the agent's log all read titles from here, so a
 * depositor reading "Asset not in mandate" on a receipt is reading the same string the inspector
 * showed and the same rule the contract enforced. Rewording a rule in one place and not another
 * is how a protocol ends up with a number nobody can explain.
 */
export const RULES: Record<RuleId, RuleMeta> = {
  // ── static: the agent could have checked these before signing, so signing one is misconduct.
  101: {
    code: 'ASSET_NOT_ALLOWED',
    title: 'Asset not in mandate',
    slashable: true,
    band: 'static',
    description:
      'The traded asset, or the asset being spent, is not one this vault is allowed to touch.',
  },
  102: {
    code: 'ADAPTER_NOT_ALLOWED',
    title: 'Venue not in mandate',
    slashable: true,
    band: 'static',
    description: 'The intent routes through a venue this vault never approved.',
  },
  103: {
    code: 'TRADE_SIZE_EXCEEDED',
    title: 'Trade larger than the per-trade cap',
    slashable: true,
    band: 'static',
    description:
      'A single buy or position open exceeded the mandate’s maximum trade size. Sells and closes are never capped.',
  },
  104: {
    code: 'LEVERAGE_EXCEEDED',
    title: 'Leverage above the mandate limit',
    slashable: true,
    band: 'static',
    description: 'Requested leverage is above the cap, or any leverage at all on a spot vault.',
  },
  105: {
    code: 'OUTSIDE_TERM',
    title: 'Signed outside the mandate term',
    slashable: true,
    band: 'static',
    description: 'The intent was signed before the mandate started or after it expired.',
  },
  106: {
    code: 'SIGNED_WHILE_FROZEN',
    title: 'Signed after the vault was frozen',
    slashable: true,
    band: 'static',
    description: 'The agent kept signing after trading had already been halted.',
  },
  107: {
    code: 'VALIDITY_TOO_LONG',
    title: 'Validity window too long',
    slashable: true,
    band: 'static',
    description:
      'An intent may stay valid for at most 5 minutes. A longer window lets an agent pre-sign now and fire under different conditions later.',
  },
  108: {
    code: 'KIND_NOT_ALLOWED',
    title: 'Wrong instrument for this vault',
    slashable: true,
    band: 'static',
    description: 'A perpetuals order on a spot vault, or the reverse.',
  },

  // ── stateful: an honest agent can trip these, so they block but never slash.
  201: {
    code: 'EXPOSURE_EXCEEDED',
    title: 'Position would breach the per-asset cap',
    slashable: false,
    band: 'stateful',
    description:
      'After this trade the vault would hold more of one asset than the mandate allows, as a share of NAV.',
  },
  202: {
    code: 'SLIPPAGE_EXCEEDED',
    title: 'Price worse than the slippage limit',
    slashable: false,
    band: 'stateful',
    description: 'The venue’s quote is further from the oracle’s fair value than the mandate permits.',
  },
  203: {
    code: 'DAILY_LOSS_EXCEEDED',
    title: 'Daily loss budget spent',
    slashable: false,
    band: 'stateful',
    description:
      'NAV per share is below the day’s opening value by more than the mandate allows, so new risk is paused. Selling stays open.',
  },
  204: {
    code: 'DEADLINE_PASSED',
    title: 'Intent expired before execution',
    slashable: false,
    band: 'stateful',
    description: 'The intent reached the vault after its own deadline.',
  },
  205: {
    code: 'INSUFFICIENT_BALANCE',
    title: 'Not enough balance',
    slashable: false,
    band: 'stateful',
    description: 'The vault does not hold enough of the asset being spent.',
  },
  206: {
    code: 'VAULT_NOT_ACTIVE',
    title: 'Vault is not accepting trades',
    slashable: false,
    band: 'stateful',
    description: 'The vault is awaiting its bond, in a cooling-off period, frozen or settled.',
  },
  207: {
    code: 'EXECUTION_FAILED',
    title: 'Venue rejected the order',
    slashable: false,
    band: 'stateful',
    description: 'The trade was permitted but the venue failed to fill it. Not the agent’s fault.',
  },

  // ── validity: not attributable to the agent at all, so nothing is recorded.
  301: {
    code: 'BAD_SIGNATURE',
    title: 'Signature does not match the agent key',
    slashable: false,
    band: 'validity',
    description: 'Ignored. The intent cannot be attributed to this agent.',
  },
  302: {
    code: 'NONCE_USED',
    title: 'Nonce already resolved',
    slashable: false,
    band: 'validity',
    description: 'Ignored. Each nonce is executed, rejected or slashed exactly once.',
  },
  303: {
    code: 'WRONG_VAULT_OR_CHAIN',
    title: 'Intent is for a different vault or chain',
    slashable: false,
    band: 'validity',
    description: 'Ignored. The EIP-712 domain binds every signature to one vault on one chain.',
  },
};

export const STATIC_RULE_ORDER: readonly RuleId[] = [108, 102, 101, 104, 103, 107, 105, 106];
export const STATEFUL_RULE_ORDER: readonly RuleId[] = [204, 206, 205, 202, 201, 203];

/** Row order of the pre-flight inspector checklist. Matches `PolicyGuard.explain`. */
export const EXPLAIN_ROW_ORDER: readonly RuleId[] = [...STATIC_RULE_ORDER, ...STATEFUL_RULE_ORDER];

export function ruleMeta(ruleId: RuleId | 0): RuleMeta | undefined {
  return ruleId === 0 ? undefined : RULES[ruleId];
}

export function isSlashable(ruleId: RuleId | 0): boolean {
  return ruleId !== 0 && RULES[ruleId].slashable;
}

/** Short human sentence for a toast or a feed row. */
export function ruleSummary(ruleId: RuleId | 0): string {
  if (ruleId === 0) return 'All checks passed';
  const meta = RULES[ruleId];
  return `${ruleId} ${meta.title}`;
}
