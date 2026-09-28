# Mandate specification

A mandate is the immutable contract between depositors and one agent. It is written once at vault
creation, hashed, and never changed — new terms require a new vault and a new bond.

## Fields

| Field | Meaning |
|---|---|
| `agentSigner` | The key that signs intents. Must match the registry entry for the agent. |
| `operator` | Stakes the bond, receives the performance fee, can release the bond after settlement. |
| `settlementAsset` | The asset depositors fund in **and** the bond is posted in. One asset means a payout needs no pricing. |
| `kind` | `SPOT` or `PERP`. Enforced by rule 108. |
| `allowedAssets` | Tradeable tokens (spot) or markets (perp). Max 8. Rule 101. |
| `allowedAdapters` | Venues. Must be a subset of the factory's global allowlist. Rule 102. |
| `maxAllocation` | Deposit cap. Also the basis for the bond requirement. |
| `maxTradeAmount` | Per buy / position open. Rule 103. Sells and closes are never capped. |
| `maxAssetExposureBps` | Per-asset share of NAV after the trade. Rule 201. |
| `maxSlippageBps` | Venue quote vs oracle fair value. Rule 202. |
| `maxLeverageBps` | 10000 = 1x. Spot must be exactly 1x. Rule 104. |
| `maxDrawdownBps` | Distance below the high-water mark at which the breaker trips and the bond pays. |
| `maxDailyLossBps` | Below the day's open, new risk pauses. Rule 203. De-risking stays open. |
| `start` / `expiry` | The term. Rule 105. |
| `bondRequired` | Must be ≥ `maxAllocation × requiredBondBps / 10000`, checked by the factory. |
| `perViolationPenalty` | Taken from the bond per static breach. |
| `reporterBountyBps` | The reporter's share of a penalty, on the reporting path only. |
| `riskTier` | 0 conservative, 1 balanced, 2 aggressive. Sets the base bond rate. |
| `metadataURI` | Human-readable mandate JSON. Display only. |

## Why the floor is measured from the high-water mark

Measuring from the deposit price would let an agent bank a gain, reset expectations downward, and then
give the gain back without ever tripping the breaker. The high-water mark only ratchets up, so the floor
does too.

## Rule bands

Rules are banded by **who is to blame**, and the band decides the consequence.

- **`1xx` static — slashable.** Depend only on the intent and the mandate. The agent could have
  evaluated every one before signing, so signing anyway is misconduct.
- **`2xx` stateful — never slashable.** Depend on live state the agent cannot fully predict. Blocked,
  recorded as a strike. Three strikes in a rolling day trigger a self-clearing cooling-off period.
- **`3xx` validity — ignored.** The intent is not attributable to the agent at all.

### Check order is part of the specification

An intent that breaks several rules is always reported under the first one in the order. This is why the
UI, the tests and the court never disagree about which rule was broken.

**Static:** `108 → 102 → 101 → 104 → 103 → 107 → 105 → 106`
**Stateful:** `204 → 206 → 205 → 202 → 201 → 203`

## EIP-712

```
TradeIntent(address vault,uint8 kind,address adapter,address assetIn,address assetOut,uint256 amountIn,uint256 minOut,uint32 leverageBps,bool isLong,uint256 nonce,uint64 issuedAt,uint64 deadline,bytes32 rationaleHash)
```

Domain: `name = "AegisProp"`, `version = "1"`, `chainId = block.chainid`,
`verifyingContract = <vault address>`.

The domain binds the signature to one vault on one chain. `rationaleHash` commits to the agent's own
explanation, stored off-chain — which is what lets an incident replay quote the agent's reasoning and
prove it is the reasoning that accompanied that exact signature.
