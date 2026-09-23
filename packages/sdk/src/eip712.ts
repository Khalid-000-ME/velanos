import {
  type Address,
  type Hex,
  type TypedDataDomain,
  hashTypedData,
  keccak256,
  recoverTypedDataAddress,
  stringToHex,
} from 'viem';
import type { TradeIntent } from './types';

/**
 * The EIP-712 type, byte-identical to `AegisVaultLib.TRADE_INTENT_TYPEHASH`.
 *
 * Field order and types are load-bearing: change one and every signature this SDK produces stops
 * verifying on-chain. There is a test that recomputes the digest against a live vault's
 * `hashIntent` precisely so that drift fails in CI rather than in a demo.
 */
export const TRADE_INTENT_TYPES = {
  TradeIntent: [
    { name: 'vault', type: 'address' },
    { name: 'kind', type: 'uint8' },
    { name: 'adapter', type: 'address' },
    { name: 'assetIn', type: 'address' },
    { name: 'assetOut', type: 'address' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'minOut', type: 'uint256' },
    { name: 'leverageBps', type: 'uint32' },
    { name: 'isLong', type: 'bool' },
    { name: 'nonce', type: 'uint256' },
    { name: 'issuedAt', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
    { name: 'rationaleHash', type: 'bytes32' },
  ],
} as const;

export const TRADE_INTENT_TYPE_STRING =
  'TradeIntent(address vault,uint8 kind,address adapter,address assetIn,address assetOut,uint256 amountIn,uint256 minOut,uint32 leverageBps,bool isLong,uint256 nonce,uint64 issuedAt,uint64 deadline,bytes32 rationaleHash)';

export const EIP712_DOMAIN_NAME = 'AegisProp';
export const EIP712_DOMAIN_VERSION = '1';

/**
 * Binds a signature to one vault on one chain.
 *
 * This is what makes a stolen signature inert: the same mandate, the same nonce and the same agent
 * key produce a different digest on a different vault, so an intent cannot be lifted from one
 * vault and replayed into another.
 */
export function domainFor(vault: Address, chainId: number): TypedDataDomain {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract: vault,
  };
}

/** The message object viem signs. `kind` is widened to number for the uint8 encoding. */
export function toTypedMessage(intent: TradeIntent) {
  return {
    vault: intent.vault,
    kind: Number(intent.kind),
    adapter: intent.adapter,
    assetIn: intent.assetIn,
    assetOut: intent.assetOut,
    amountIn: intent.amountIn,
    minOut: intent.minOut,
    leverageBps: Number(intent.leverageBps),
    isLong: intent.isLong,
    nonce: intent.nonce,
    issuedAt: intent.issuedAt,
    deadline: intent.deadline,
    rationaleHash: intent.rationaleHash,
  } as const;
}

/** The digest the agent signs, computed locally. Must equal `AegisVault.hashIntent`. */
export function hashIntent(intent: TradeIntent, chainId: number): Hex {
  return hashTypedData({
    domain: domainFor(intent.vault, chainId),
    types: TRADE_INTENT_TYPES,
    primaryType: 'TradeIntent',
    message: toTypedMessage(intent),
  });
}

export async function recoverIntentSigner(
  intent: TradeIntent,
  signature: Hex,
  chainId: number,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain: domainFor(intent.vault, chainId),
    types: TRADE_INTENT_TYPES,
    primaryType: 'TradeIntent',
    message: toTypedMessage(intent),
    signature,
  });
}

/**
 * Commits to the agent's own explanation of a trade.
 *
 * The hash goes on-chain with the signature; the text is stored off-chain. That pairing is what
 * lets an incident replay quote the agent's reasoning and prove it is the reasoning that came with
 * this exact signature, rather than something written afterwards.
 */
export function rationaleHash(rationale: string): Hex {
  return keccak256(stringToHex(rationale));
}

export interface SignIntentArgs {
  /** Anything with viem's `signTypedData`: a wallet client, a local account client, a browser wallet. */
  signTypedData: (args: {
    domain: TypedDataDomain;
    types: typeof TRADE_INTENT_TYPES;
    primaryType: 'TradeIntent';
    message: ReturnType<typeof toTypedMessage>;
    account?: Address;
  }) => Promise<Hex>;
  intent: TradeIntent;
  chainId: number;
  account?: Address;
}

export async function signIntent({
  signTypedData,
  intent,
  chainId,
  account,
}: SignIntentArgs): Promise<Hex> {
  return signTypedData({
    domain: domainFor(intent.vault, chainId),
    types: TRADE_INTENT_TYPES,
    primaryType: 'TradeIntent',
    message: toTypedMessage(intent),
    ...(account ? { account } : {}),
  });
}
