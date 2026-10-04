# Threat model

Velanos holds depositor capital and hands trading authority to a program. This document states
what we defend against, how, and where the defences stop.

## Trust assumptions

| Party | What it can do | What it cannot do |
|---|---|---|
| **Agent signer** | Sign `TradeIntent`s | Move funds, change the mandate, withdraw depositor assets, avoid a slash |
| **Operator** | Create a vault, stake and (after settlement + cooldown) release the bond | Trade, change a live mandate, recover a slashed penalty, withdraw depositor assets |
| **Guardian** | Freeze a vault | Move funds, unfreeze, slash, settle |
| **Relay / server** | Pay gas to submit an intent the agent already signed | Authorise anything. It has no privileged role in any contract |
| **Watcher** | Report violations, trip the breaker, unwind, compensate, settle | Anything a stranger could not also do |
| **Depositor** | Deposit, withdraw within the stated caps | Direct the agent |

The protocol has no admin key that can move depositor funds or forgive a slash. The only privileged
role anywhere is `PRICE_UPDATER_ROLE` on the test oracle, which is disclosed in the UI and is replaced
by Chainlink in production.

## Threats and mitigations

### Agent drains the vault
**Mitigation.** The vault makes no arbitrary `call`. It approves an exact amount to an adapter named
in the mandate's allowlist, invokes a typed interface, and resets the approval to zero. The set of
things an agent can do with depositor money is fixed when the vault is created.

**Invariant.** `invariant_insidersNeverHoldDepositorShares` — vault shares are the only claim on
depositor assets, and no insider ever holds one.

### Signature replay across vaults or chains
**Mitigation.** The EIP-712 domain binds `chainId` and the vault address, so the same mandate, nonce
and key produce a different digest on a different vault. `execute` additionally checks `i.vault ==
address(this)`. Each nonce resolves exactly once.

**Test.** `test_execute_signatureFromAnotherVaultIsIgnored`, `test_hashIntent_differsAcrossVaults`.

### Griefing an honest agent with fake reports
**Mitigation.** `reportSignedViolation` requires the agent's own signature over the intent, an
unresolved nonce, and a static rule the guard independently agrees was broken. A caller cannot
fabricate any of the three.

Stateful rejections are never reportable, so an agent cannot be punished for live-state conditions it
could not predict.

### Agent self-reports to farm its own bounty
**Mitigation.** Bounties exist **only** on the reporting path. Reaching `execute` requires no
discovery — the vault caught the breach unaided — so that path pays nothing and the full penalty goes
to depositors.

**Why not an address check.** Excluding `agentSigner` and `operator` is not sufficient: an operator can
submit from a third address it controls. No allowlist can enumerate an attacker's keys, so the
incentive is removed rather than the addresses blocked.

**Residual risk.** An operator reporting a published intent from an unrelated address still keeps the
bounty share, reducing its effective penalty by `reporterBountyBps`. Bounded, and self-reporting
remains strictly worse for the agent than not violating the mandate.

### Oracle manipulation
**Mitigation.** Prices are role-gated and the role holder is disclosed. The stateful slippage rule
compares the venue's quote against the oracle rather than trusting either alone. Stale prices are
treated as a stateful failure.

**Residual risk.** The test oracle is a trusted input. This is the largest deliberate simplification in
the system and is stated in the UI, the docs page and this file. Production replaces it with Chainlink
feeds; nothing else changes, because prices are only ever read through one interface.

### Reentrancy via adapters or tokens
**Mitigation.** `nonReentrant` on every state-changing entry point, CEI ordering, `SafeERC20`
throughout, `forceApprove` reset to zero after every adapter call. Adapter failures are caught and
recorded as rule 207 rather than reverting the transaction.

### Guardian abuse
**Mitigation.** `freeze` is the guardian's only power. A frozen vault can still be unwound and settled
by anyone, so a malicious guardian can stop trading but cannot trap funds.

### Mandate mutation
**Mitigation.** The mandate is written once in the constructor and hashed. There is no setter. New
terms require a new vault and a new bond.

### Bond insufficient for the shortfall
**Mitigation.** `slash` pays `min(amount, available)` rather than reverting — a bond that cannot cover
the full penalty must still pay what it has, or depositors get nothing and the agent gets an escape
hatch. The gap stays visible in the difference between the event's `amount` and `paid`.

**Disclosure.** The fund screen computes the worst-case shortfall against the bond and names the
unbacked remainder before anyone deposits.

### Agent stops responding
**Mitigation.** `forceSettle` freezes the vault and takes a penalty once the term has lapsed plus a
grace period. Walking away is itself a breach.

### Venue or keeper unavailability
**Mitigation.** GMX keeper delays are visible in the UI, and static checks happen at order creation, so
the static-violation scenarios never depend on a fill. A mock perp adapter with identical NAV semantics
is available when GMX is unreliable, and the active mode is shown in the status bar.

### Indexer compromise or failure
**Mitigation.** The indexer is a cache. Every figure it serves is derived from chain state and
rebuildable by deleting the database. It holds no authority, and the inspector recomputes rule
verdicts from live chain state rather than trusting stored values.

## Known limitations

1. **Test oracle.** Role-gated price setter, not a feed.
2. **Test venue.** `OracleSwapPool` is deterministic by design so the drawdown arithmetic is checkable;
   it is not a real DEX.
3. **Simplified perp NAV.** One position per market, valued as collateral plus unrealised PnL.
4. **Bounty leak on self-reporting.** Bounded by `reporterBountyBps`, described above.
5. **`VaultDeployer` size headroom.** ~300 bytes under EIP-170. Adding code to `VelanosVault` can break
   deployment; the fix is to move view logic into the linked library, never to a proxy.
6. **No audit.** Testnet only.
