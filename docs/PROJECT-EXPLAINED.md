# Velanos — the project in five minutes

## One line
Trading agents post a bond before they touch your money. If they break a rule, the bond pays you — even when the trade never executed.

## The problem
- AI agents can trade 24/7, but nobody hands them a wallet, because there is no **recourse** if they go wrong (prompt injection, hallucinated ticker, decimals bug).
- Today's answers: give the agent full authority (dangerous), or wrap it in a policy engine. A policy engine **blocks** a bad action but costs the agent nothing — and when the rules have a gap, you eat the whole loss.

## The idea (say this slowly)
**Prevent → Prove → Pay.**
1. **Prevent** — every action is an EIP-712 *signed intent*, checked on-chain against an immutable *mandate* before money moves. Vaults can't make arbitrary calls.
2. **Prove** — a blocked intent is still *signed*. That signature is cryptographic evidence the agent authorised something forbidden. Anyone can submit it.
3. **Pay** — the evidence slashes the agent's pre-posted **bond** to depositors in the same transaction.

**The sentence judges remember:** *"Guardrails stop at blocked. Velanos keeps the signature as evidence — a blocked trade still pays."*

## The parts (what each word means)
| Term | Meaning |
|---|---|
| **Vault** | ERC-4626 vault holding depositors' USDG; the agent trades it under a mandate |
| **Mandate** | The vault's immutable rules: allowed assets, max trade size, leverage, term, loss floor |
| **Bond** | Agent operator's own USDG, staked before the vault accepts deposits |
| **Intent** | A signed trade proposal (EIP-712). Executed only if every check passes |
| **PolicyGuard** | On-chain contract that runs the checks and is mirrored in the SDK (differential-tested) |
| **Rules 1xx** | Static rules (wrong asset, oversize, leverage…). Agent could have checked → **slashable** |
| **Rules 2xx** | Live-state rules (price moved, balance, limits). Bad luck → **never slashable** |
| **Rules 3xx** | Validity (expired etc.) → ignored |
| **Court** | Permissionless contract: submit a signed violation, bond slashes, reporter earns a 10% bounty |
| **Loss floor / breaker** | If NAV/share falls 8% below high-water mark, trading halts and the bond tops depositors back up to the floor |
| **NAV** | Net asset value — what the vault is worth; NAV/share is the price of one vault share |
| **Relay (server)** | Receives signed intents, publishes them (also the refused ones) to a public feed, indexes the chain |
| **Watcher** | Bot that reports violations to the court, trips breakers, unwinds, settles |
| **Agent** | LLM that proposes trades and signs them (Claude) |
| **MCP server** | Lets any agent (e.g. Claude Code) plug in: `get_mandate`, `get_vault_state`, `preflight_intent`, `submit_intent` |
| **Evidence page** | Public list of signed-but-blocked intents; reporting one pays |

## Why it's different from "guardrails for agents"
| Typical hackathon project | Velanos |
|---|---|
| Blocks bad actions | Blocks **and** makes the agent liable for them |
| Agent pays nothing | Agent's bond is slashed to depositors, automatically |
| Reputation scores | Money, not a score — a score repays nobody |
| Loss is yours | Loss floor backed by the agent's own bond |
| Trusts the agent's logs | Signed intents — verifiable by anyone, no trust |
| Punishes volatility | Separates **misconduct** (slashed) from **bad luck** (never slashed) |

## The three outcomes (core demo)
- **Misconduct** (bought a stock outside the mandate): rejected + published + reported → bond −50, 45 to depositors, 5 bounty.
- **Bad luck** (price moved past a live limit): rejected, bond untouched.
- **Market risk** (NAV falls through the floor): breaker trips, unwind, bond tops depositors up to the floor.

## Likely judge questions
- **Can someone grief an honest agent with fake reports?** No — evidence is the agent's own signature; forged ones fail signature recovery. Honest agents that pre-flight can't be slashed for static rules.
- **What if the bond is too small?** Payouts are capped at the bond; the fund screen shows the unbacked remainder *before* you deposit.
- **Is the AI in control of the money?** No. The AI only proposes and signs. Contracts decide, the vault can't make arbitrary calls, nobody can withdraw LP assets.
- **Who enforces?** Anyone. The court is permissionless and pays a bounty.

## Stack
Solidity 0.8.24 + Foundry + OpenZeppelin 5 (148 tests) · Next.js 16 · viem/wagmi · Fastify + SQLite indexer · Claude Opus 5.5 agent · MCP server · Robinhood Chain testnet + Arbitrum Sepolia · Paxos USDG · GMX perps.
