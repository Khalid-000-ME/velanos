<div align="center">

# Aegis

### No agent should manage other people's money without staking its own.

**Bonded capital vaults for autonomous trading agents** · Robinhood Chain · Arbitrum · Paxos USDG · GMX

</div>

---

## The problem

An AI agent can trade continuously, read every filing, and never sleep. Nobody hands one a wallet.

The reason is not capability — it is recourse. Today you get two options, and neither works:

- **Give the agent authority.** It can do anything your key can do. One prompt injection, one decimals bug, one hallucinated ticker, and the money is gone.
- **Wrap it in a policy engine.** Bad actions get blocked, which is genuinely useful — but blocking costs the agent *nothing*. There is no reason for it to improve, and the one time your rules have a gap, you absorb the whole loss alone.

Reputation scores do not close this. A score describes what already happened. **It repays nobody.**

## The idea

Make the agent financially liable for how it uses your capital, and make the liability automatic.

| | |
|---|---|
| **Prevent** | Every agent action is an EIP-712 signed `TradeIntent`, checked against an immutable on-chain mandate before any funds move. The vault never makes an arbitrary call — it approves an exact amount to an allowlisted adapter, and nothing else. |
| **Prove** | A rule-breaking intent is never executed. But the agent's signature on it is cryptographic evidence of misconduct that anyone can verify — and it stays valid whether or not the trade ever reached the chain. |
| **Pay** | That evidence slashes the agent's pre-posted bond to depositors in the same transaction. A drawdown breaker additionally spends the bond restoring depositors to a promised loss floor. |

The bond is posted in the same asset you deposited. A payout needs no pricing, no oracle, and no claims committee.

### The part that makes it work

A blocked trade and a slashable offence are **different events**, and separating them is the whole design.

When the relay refuses to forward a non-compliant intent, no depositor funds were ever at risk. The agent still signed it. That signature goes to a public feed, and anyone can take it to the court and be paid for doing so.

So the protocol gets both properties that normally trade off against each other: **nothing bad executes, and the agent still pays.**

---

## What is covered, and what is not

**Covered**
- Trades outside the mandate — wrong asset, wrong venue, wrong instrument
- Oversized or over-leveraged orders
- Acting after a freeze or after expiry
- Losses beyond the drawdown floor, up to the size of the bond
- Failing to settle when the term ends

**Not covered**
- Losses *within* the agreed drawdown limit
- Strategy underperformance

A loss floor is only worth something if its edges are stated. Payouts are capped by the bond, and the fund screen shows the unbacked remainder **before** anyone deposits.

---

## Proof

Everything below is read back from chain state by an automated gate, not asserted in a slide.

### `pnpm demo:all` — 5/5 from a fresh chain

```
  PASS  s0   Good trade executes with every check green
  PASS  s1   Prompt injection is refused, published, reported and paid
  PASS  s2   Fat finger is slashed and the second breach freezes the vault
  PASS  s4   Revenge trader is rejected three times with the bond untouched
  PASS  s6   Market shock trips the breaker and the bond restores the floor
```

### The numbers, verified on chain

| Scenario | What the agent did | What the protocol did |
|---|---|---|
| **S1 · Prompt injection** | A poisoned headline told it to ignore its limits and buy a forbidden stock. It did. | Relay refused to submit. Signature published as evidence. A watcher reported it. Bond **300 → 250**, with **45 to depositors** and **5 to the reporter**. |
| **S2 · Fat finger** | A decimals bug multiplied a valid 250 order to 2,500. | Rule 103 slash. Second breach → vault **FROZEN** with no admin key involved. Bond **250 → 200**. |
| **S4 · Revenge trader** | After two losses, tried three times to add to a position already near its cap. | Three rejections, vault **WARNED**, cooling-off cleared itself. **Bond untouched at 300.** Zero violations recorded. |
| **S6 · Drawdown** | Nothing wrong. Built a fully compliant book, then the market fell. | NAV/share **0.8685 → through the 0.92 floor**. Breaker tripped, vault unwound, bond paid **57.565088 tUSDG** — and NAV/share landed on **0.920000000000000000 exactly**, shortfall zero. |

That last row is the headline claim, and it is arithmetic rather than marketing: the floor is a number the bond is spent reaching, to the wei.

### 148 contract tests, including the ones that matter

```
forge test   →   148 passed, 0 failed
```

- Every rule ID has a passing and a failing case, plus the **check-order** guarantees the UI and the court depend on
- Fuzzing proved a **stateful rule can never return a slashable verdict** — the formal version of "we punish misconduct, not volatility"
- Handler-based invariants over an adversarial agent that replays nonces, signs violations and shocks prices: *slashed never exceeds staked*, *no insider ever holds depositor shares*, *two breaches always mean frozen*
- A **differential test fuzzes the TypeScript rule mirror against the deployed Solidity guard** and compares verdicts intent by intent, so an agent can never be slashed for trusting its own SDK

---

## What makes this different

| Prior Arbitrum Open House winner | What it proved | What Aegis adds |
|---|---|---|
| **AlphaGrid** (1st) | Agents can *earn* capital by passing a rules-based challenge | Liability **after** funding — the bond pays when the agent breaks its mandate |
| **CanHav Research** (2nd) | Agents can score DeFi risk | Turns a risk score into an **enforced, paid-out consequence** |
| **ReineiraOS** (3rd) | Liquidity can back agent payment recourse | Recourse **for trading**, triggered by the agent's own signature |

> **AlphaGrid decides which agent gets capital. Aegis makes that agent financially liable for how it uses it.**

---

## Using the app

Four screens carry the whole story.

**1 · Fund a vault** — `/vaults/<address>/fund`
Leads with the worst case, not a projected return. The big figure is your loss floor and the bond standing behind it. Covered and not-covered are listed side by side, and the mandate is rendered in plain English generated from the on-chain struct.

**2 · Vault cockpit** — `/vaults/<address>`
NAV per share against its high-water mark and its floor, drawn as a band so a breach is an area rather than a crossing you have to squint at. Slashes and market shocks are marked on the time axis. The live intent stream shows what the agent is doing, colour-coded by outcome, with its stated reasoning expandable on every row.

**3 · Pre-flight inspector** — `/vaults/<address>/intents/<nonce>`
Any intent, with the **full ordered checklist the contract evaluated** — every rule, the actual value against the limit, the rule that decided the outcome highlighted. Recomputed live from chain state, not a cached copy. This is where the protocol stops being a claim and becomes auditable.

**4 · Incident replay** — `/incidents/<id>`
The signature moment. Auto-plays the causal chain: poisoned headline → the agent's own words → its signature → the guard's verdict → who reported it → the bond moving. Then an animated bar showing exactly where the money went.

Also: `/watch` is the public evidence locker where anyone can claim a bounty, `/operator` drives the agent and the test controls, `/docs` carries the full rule table and the deployed addresses.

### Every test control is labelled

A judge who cannot distinguish a market shock *we applied* from one the market produced has no reason to trust any other number on the screen. So staged inputs — price shocks, the poisoned news feed, agent profiles, replay mode — carry a **TEST CONTROL** badge, and the status bar permanently shows which integrations are running against test stand-ins.

Nothing in the operator console has protocol authority. There is no button anywhere that can freeze a vault, move depositor funds, or forgive a slash. Those are decided on-chain, by rules.

---

## Running it

```bash
pnpm i
cp .env.example .env            # fill in testnet keys

pnpm contracts:build            # forge build + generate typed ABIs
pnpm contracts:test             # 148 tests

pnpm contracts:deploy:rh        # deploy to Robinhood Chain testnet
pnpm demo:seed                  # register the agent, create and fund vaults A–E

pnpm dev                        # indexer, agent, watcher, web, MCP
pnpm demo:all                   # run the acceptance gate
```

Open `http://localhost:3000`.

The same deploy and seed scripts run against a local fork, so the full stack — contracts, indexer, agent, watcher, UI — can be exercised without waiting on a public testnet.

---

## Architecture

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

`packages/sdk` (`@aegis/agent-sdk`) and `apps/mcp` let any third-party agent join a vault: read the mandate, predict the verdict locally, sign, submit.

### Design decisions worth knowing

**`execute` never reverts on a rule failure.** Reverting would erase the evidence and leave only a failed transaction. Instead the rejection — and the signature that caused it — is written on-chain where anyone can verify it.

**`execute`, `unwind` and `settle` are callable by anyone.** The signature is the authorisation, not the sender. A frozen vault must be able to return to cash even if the operator has walked away, and depositors must not need our cooperation to be made whole.

**The rulebook is pure functions with no storage.** The vault, the SDK, the watcher and the UI inspector all reach the same verdict from the same inputs. Check *order* is specified rather than incidental, which is why a fat-finger buy always reports 103 and a hallucinated market always reports 101.

**Reputation prices the bond; it never loosens a check.** A clean settlement record lowers what an agent pays for access to outside capital, with discounts floored at half the base rate. That is the incentive that makes an operator accept liability at all.

**Vault code is fixed at creation.** No proxies. The creation code lives in a separate deployer purely to stay under the EIP-170 size limit, so a vault's logic can never be swapped out from under its depositors.

---

## Sponsor integrations

- **Robinhood Chain** (46630) — tokenised equities vaults; Stock Tokens via the faucet or deterministic test mocks
- **Paxos USDG** — the settlement asset throughout; the bond is posted in the same asset depositors use, which is what makes a payout unambiguous
- **GMX v2** — perpetuals vault on Arbitrum Sepolia, one dedicated adapter per vault so position accounting is never a shared balance
- **Arbitrum** — the protocol's home chain; cheap enough to check every single intent on-chain

---

## Threat model

| Threat | Mitigation |
|---|---|
| Agent drains the vault | No arbitrary calls. Typed allowlisted adapters, approvals exact and reset to zero |
| Signature replayed across vaults or chains | EIP-712 domain binds vault + chainId; `vault` field checked; one-shot nonces |
| Griefing via fake reports | Requires the agent's own signature, an unresolved nonce, and a rule the guard agrees was broken |
| Agent self-reports to farm its own bounty | Bounties exist **only** on the reporting path — reaching `execute` requires no discovery, so it pays nothing |
| Oracle manipulation | Role-gated test oracle, disclosed as such; stateful slippage check; Chainlink in production |
| Reentrancy via adapters or tokens | `nonReentrant`, CEI ordering, SafeERC20 |
| Guardian abuse | A guardian can only freeze. It cannot move funds |
| Mandate mutation | Immutable per vault. New terms require a new vault and a new bond |
| Bond insufficient for the shortfall | Payout capped and the gap stays visible; the UI shows the unbacked remainder before deposit |
| GMX keeper delay | Static checks happen at order creation; UI shows keeper status; mock adapter as fallback |

**Known limitations**, stated plainly: the oracle is a role-gated test oracle; the venue is an oracle-priced pool rather than a real DEX; perp NAV is simplified to one position per market; an operator reporting from an unrelated address it controls can recover the bounty share (bounded by the bounty rate, and violating is still strictly worse than not violating); no audit; testnet only.

---

## Roadmap

Uniswap adapter for Robinhood Chain mainnet · Chainlink price feeds · third-party underwriters sharing the first-loss layer · a shared reserve above individual bonds · ERC-8004 reputation feedback · Arbitrum One deployment.

**Business model:** vault management fee, performance fee above the high-water mark, and a bond-management fee on the capital agents post.

---

<div align="center">

**No agent should manage other people's money without staking its own.**

</div>
