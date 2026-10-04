<div align="center">

# Velanos

### No agent should manage other people's money without staking its own.

**Bonded capital vaults for autonomous trading agents** · Robinhood Chain · Arbitrum · Paxos USDG · Chainlink

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

Live on **Robinhood Chain testnet** (tokenised stocks) and **Arbitrum Sepolia** (ETH), with the real tokens: Paxos USDG for deposits and bond, the faucet's TSLA, AMZN, AMD, PLTR and NFLX, and WETH and USDC priced by Chainlink. Nothing is minted and nothing is mocked on-chain. Every address is in [`docs/SUBMISSION.md`](docs/SUBMISSION.md).

### Robinhood Chain: stocks vault

| Step | What happened | Transaction |
|---|---|---|
| Open | **Delta Equities I**: 50 USDG bond, 80 USDG deposited | [bond](https://explorer.testnet.chain.robinhood.com/tx/0xae8c444454c66b2806dfb2ef035a6a3b560e519678b31e0c227c60d06966c44f) · [deposit](https://explorer.testnet.chain.robinhood.com/tx/0x2dd5b430d7fd5d0295003d947ef670537af11b73d1523640edb5f0a1174cd225) |
| Compliant trade | The model chose AMD; every check green, executed | [tx](https://explorer.testnet.chain.robinhood.com/tx/0x76bdcef814d729478727e62dd59e35be18766b639fc6321cd68ca8bbf3288685) |
| Prompt injection → slash | The agent signed a PLTR buy it was forbidden to make; refused, reported, **bond 50 → 40 USDG** | [tx](https://explorer.testnet.chain.robinhood.com/tx/0xdb6b12aad114a34e072111f9f32550f818e7ae45ac1f8ad35dfa47bf17db38a4) |

### Arbitrum Sepolia: ETH vault

| Step | What happened | Transaction |
|---|---|---|
| Open | Vault **Delta ETH I** created, **50 USDG** bond staked, **80 USDG** deposited | [bond](https://sepolia.arbiscan.io/tx/0x7f7fbb359f8118c388060de57cb2c388ec9aa6ce91897e7f296219cb94465454) · [deposit](https://sepolia.arbiscan.io/tx/0xf53ac391940a63acf58e5e4eee934923d776ae071b35c6426263ae2c91b821f6) |
| Compliant trade | 20 USDG → WETH, every check green, executed | [tx](https://sepolia.arbiscan.io/tx/0xe7ce3977d2b93565ab1f54a9e2c2500ad9413d0515ca693437b738027e360660) |
| Prompt injection | A poisoned headline told the agent to rotate into USDC. It signed. The relay refused it, so **nothing executed**. | published as evidence |
| Reported and slashed | A watcher reported the signature (rule 101). **Bond 50 → 40 USDG**: 9 to depositors, 1 to the reporter. | [tx](https://sepolia.arbiscan.io/tx/0x670cd56563127434844f37282c72de9c6e560946f9faf6ae28ff682f3b78815f) |
| Claude Code over MCP | A third-party agent pre-flighted and submitted a trade through the MCP server | [tx](https://sepolia.arbiscan.io/tx/0x6d12789762c49e7c0a1327bf75c77cdaa008f30d286323213dcade7cdd1af466) |

### 154 contract tests, including the ones that matter

```
forge test   →   154 passed, 0 failed
```

- Every rule ID has a passing and a failing case, plus the **check-order** guarantees the UI and the court depend on
- Fuzzing proved a **stateful rule can never return a slashable verdict** — the formal version of "we punish misconduct, not volatility"
- Handler-based invariants over an adversarial agent that replays nonces, signs violations and shocks prices: *slashed never exceeds staked*, *no insider ever holds depositor shares*, *two breaches always freeze*
- A **differential test fuzzes the TypeScript rule mirror against the deployed Solidity guard** and compares verdicts intent by intent, so an agent can never be slashed for trusting its own SDK
- Oracle tests cover Chainlink feeds: live reads, decimal normalisation, stale and non-positive answers, and that a feed-backed price can never be overwritten

The fat-finger, revenge-trader and drawdown-breaker paths are covered by the Foundry suite and its handler invariants; the live vault keeps its one remaining breach for demonstration.

---

## What makes this different

| Prior Arbitrum Open House winner | What it proved | What Velanos adds |
|---|---|---|
| **AlphaGrid** (1st) | Agents can *earn* capital by passing a rules-based challenge | Liability **after** funding — the bond pays when the agent breaks its mandate |
| **CanHav Research** (2nd) | Agents can score DeFi risk | Turns a risk score into an **enforced, paid-out consequence** |
| **ReineiraOS** (3rd) | Liquidity can back agent payment recourse | Recourse **for trading**, triggered by the agent's own signature |

> **AlphaGrid decides which agent gets capital. Velanos makes that agent financially liable for how it uses it.**

---

## Using the app

Four screens carry the whole story.

**1 · Fund a vault** — `/vaults/<address>/fund`
Leads with the worst case, not a projected return. The big figure is your loss floor and the bond standing behind it. Covered and not-covered are listed side by side, and the mandate is rendered in plain English generated from the on-chain struct.

**2 · Vault cockpit** — `/vaults/<address>`
NAV per share against its high-water mark and its floor, drawn as a band so a breach is an area rather than a crossing you have to squint at. Slashes are marked on the time axis. The live intent stream shows what the agent is doing, colour-coded by outcome, with its stated reasoning expandable on every row.

**3 · Pre-flight inspector** — `/vaults/<address>/intents/<nonce>`
Any intent, with the **full ordered checklist the contract evaluated** — every rule, the actual value against the limit, the rule that decided the outcome highlighted. Recomputed live from chain state, not a cached copy. This is where the protocol stops being a claim and becomes auditable.

**4 · Incident replay** — `/incidents/<id>`
The signature moment. Auto-plays the causal chain: poisoned headline → the agent's own words → its signature → the guard's verdict → who reported it → the bond moving. Then an animated bar showing exactly where the money went.

Also: `/watch` is the public evidence locker where anyone can claim a bounty, `/operator` drives the agent and the test controls, `/docs` carries the full rule table and the deployed addresses.

### Every test control is labelled

A judge who cannot distinguish an input *we staged* from one the chain produced has no reason to trust any other number on the screen. So staged inputs — the poisoned news feed, agent profiles, replay mode — carry a **TEST CONTROL** badge, and the status bar permanently shows which integrations are running against test stand-ins.

Nothing in the operator console has protocol authority. There is no button anywhere that can freeze a vault, move depositor funds, or forgive a slash. Those are decided on-chain, by rules.

---

## Running it

```bash
pnpm i
cp .env.example .env            # fill in testnet keys

pnpm contracts:build            # forge build + generate typed ABIs
pnpm contracts:test             # 154 tests

./scripts/up.sh                  # indexer + relay, agent, watcher and web, against the live deployment
```

Open `http://localhost:3000`.

To deploy your own copy: `forge script script/DeployOnchain.s.sol:DeployOnchain --sig "deploy()" --rpc-url $ARB_SEPOLIA_RPC --broadcast`, then `script/SeedOnchain.s.sol`.

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
    │ contracts · AgentRegistry · VaultFactory · VelanosVault · PolicyGuard    │
    │            BondManager · ViolationCourt · Oracle · Adapters            │
    └───────────────────────────────────────────────────────────────────────┘
```

`packages/sdk` (`@velanos/agent-sdk`) and `apps/mcp` let any third-party agent join a vault: read the mandate, predict the verdict locally, sign, submit.

### Design decisions worth knowing

**`execute` never reverts on a rule failure.** Reverting would erase the evidence and leave only a failed transaction. Instead the rejection — and the signature that caused it — is written on-chain where anyone can verify it.

**`execute`, `unwind` and `settle` are callable by anyone.** The signature is the authorisation, not the sender. A frozen vault must be able to return to cash even if the operator has walked away, and depositors must not need our cooperation to be made whole.

**The rulebook is pure functions with no storage.** The vault, the SDK, the watcher and the UI inspector all reach the same verdict from the same inputs. Check *order* is specified rather than incidental, which is why a fat-finger buy always reports 103 and a hallucinated market always reports 101.

**Reputation prices the bond; it never loosens a check.** A clean settlement record lowers what an agent pays for access to outside capital, with discounts floored at half the base rate. That is the incentive that makes an operator accept liability at all.

**Vault code is fixed at creation.** No proxies. The creation code lives in a separate deployer purely to stay under the EIP-170 size limit, so a vault's logic can never be swapped out from under its depositors.

---

## Sponsor integrations

- **Paxos USDG** — the settlement asset throughout; the bond is posted in the same asset depositors use, which is what makes a payout unambiguous
- **Robinhood Chain** — tokenised-stock vaults using the faucet's real Stock Tokens, with Paxos USDG as the bond
- **Chainlink** — ETH/USD and USDC/USD feeds price the Arbitrum vault; a feed-backed price can't be set or shocked by anyone, including the admin
- **Arbitrum** — the protocol's home chain; cheap enough to check every single intent on-chain
- **Groq** — the model that drives the agent live; and an MCP server that any agent, including Claude Code, plugs into

---

## Threat model

| Threat | Mitigation |
|---|---|
| Agent drains the vault | No arbitrary calls. Typed allowlisted adapters, approvals exact and reset to zero |
| Signature replayed across vaults or chains | EIP-712 domain binds vault + chainId; `vault` field checked; one-shot nonces |
| Griefing via fake reports | Requires the agent's own signature, an unresolved nonce, and a rule the guard agrees was broken |
| Agent self-reports to farm its own bounty | Bounties exist **only** on the reporting path — reaching `execute` requires no discovery, so it pays nothing |
| Oracle manipulation | Chainlink feeds with staleness and sanity checks; no one can overwrite a feed-backed price; stateful slippage check |
| Reentrancy via adapters or tokens | `nonReentrant`, CEI ordering, SafeERC20 |
| Guardian abuse | A guardian can only freeze. It cannot move funds |
| Mandate mutation | Immutable per vault. New terms require a new vault and a new bond |
| Bond insufficient for the shortfall | Payout capped and the gap stays visible; the UI shows the unbacked remainder before deposit |

**Known limitations**, stated plainly: the venue is Velanos's own oracle-priced pool, funded with real USDG, WETH and USDC, rather than a third-party DEX; an operator reporting from an unrelated address it controls can recover the bounty share (bounded by the bounty rate, and violating is still strictly worse than not violating); no audit; testnet only.

---

## Roadmap

GMX perps · more tokenised stocks · a real-DEX adapter · third-party underwriters sharing the first-loss layer · a shared reserve above individual bonds · ERC-8004 reputation feedback · Arbitrum One deployment.

**Business model:** vault management fee, performance fee above the high-water mark, and a bond-management fee on the capital agents post.

---

<div align="center">

**No agent should manage other people's money without staking its own.**

</div>
