# Architecture

## Components

```
            ┌──────────────────── apps/web · Next.js App Router ───────────────────┐
            │ Discover · Agent · Fund · Cockpit · Inspector · Replay · Watch · Ops  │
            └──────────────▲──────────────────────────────────▲────────────────────┘
                 REST + SSE │                                  │ wagmi · wallet tx
            ┌───────────────┴────────────────┐                 │
            │ apps/server · Fastify          │                 │
            │  indexer · relay · public feed  │                 │
            └──────▲──────────────▲──────────┘                 │
                   │              │                            │
        ┌──────────┴───┐  ┌───────┴────────┐                   │
        │ apps/agent   │  │ apps/watcher   │                   │
        │ LLM proposer │  │ reports, keeps  │                   │
        │ + signing    │  │ vaults moving   │                   │
        └──────┬───────┘  └───────┬────────┘                   │
               │ signed intents   │ permissionless tx           │
    ┌──────────▼──────────────────▼───────────────────────────▼─────────────┐
    │ contracts · AgentRegistry · VaultFactory · AegisVault · PolicyGuard    │
    │            BondManager · ViolationCourt · Oracle · Adapters            │
    └───────────────────────────────────────────────────────────────────────┘
```

## Contracts

| Contract | Responsibility |
|---|---|
| `AegisTypes.sol` | Mandate, TradeIntent, snapshot structs, and the three rule bands |
| `PolicyGuard` | The whole rulebook as pure functions. No storage |
| `AegisVault` | ERC-4626 over the settlement asset. Verifies, checks, trades, unwinds, settles |
| `AegisVaultLib` | The vault's view arithmetic, as a linked external library |
| `VaultDeployer` | Holds the vault's creation code so the factory stays under EIP-170 |
| `VaultFactory` | Creates vaults and is the registry of which addresses are real |
| `BondManager` | Custody for the agent's capital: stake, slash, release |
| `ViolationCourt` | Turns evidence into payment. Four permissionless paths |
| `AgentRegistry` | Identity, track record, and the bond schedule derived from it |
| `AegisPriceOracle` | Role-gated USD prices with a shock function, marked TEST CONTROL |
| `adapters/*` | The only way funds leave a vault. Typed, allowlisted |
| `testenv/*` | tUSDG, stock tokens, and the deterministic oracle-priced pool |

## The intent lifecycle

1. The agent reads the mandate, vault state and signals.
2. The model proposes an action and explains itself.
3. Deterministic code maps the proposal to a `TradeIntent` with raw amounts in on-chain decimals, and
   commits to the rationale by hashing it.
4. The SDK pre-flights the intent locally against the same rules the contract will apply.
5. The agent signs with EIP-712.
6. Submission is either **relay** (the server pre-flights and either submits or publishes to the public
   feed) or **direct** (the agent calls `execute` itself).
7. `execute` checks validity, static rules, then stateful rules, then trades. It never reverts on a rule
   failure — every rejection is an on-chain event.

## Why these boundaries

**The server holds no authority.** It can pay gas for an intent the agent already signed. Everything it
serves is derived from chain state and rebuildable by deleting its database.

**The agent process holds one key and no privileges.** It is the only component with the signing key, and
the protocol gives it nothing: it can sign intents, and the vault decides what happens to them.

**The watcher is unprivileged and paid.** Every action it takes is one anyone could take. A protocol that
needs us to run it has an operator; one that pays anyone to run it keeps working after we stop watching.

**The rulebook is stateless.** The vault, the SDK, the watcher and the UI inspector all reach the same
verdict from the same inputs. A differential test fuzzes the TypeScript mirror against the deployed
Solidity guard so the two cannot drift.

## Data flow for a slash

```
poisoned signal → model proposal → rationale posted → intent built in raw units
   → local pre-flight (fails: rule 101, slashable)
   → signed anyway (rogue profile has pre-flight off)
   → relay pre-flights, refuses to submit, publishes signature to the public feed
   → watcher reads the feed, re-derives the rule, calls reportSignedViolation
   → court verifies the signature, checks the nonce, re-runs checkStatic
   → vault marks the nonce slashed, increments the violation count, freezes at two
   → bond manager moves the penalty: 90% to the vault, 10% to the reporter
   → indexer assembles the incident; UI animates the replay
```

Note what did **not** happen: no depositor funds moved, and the agent still paid.
