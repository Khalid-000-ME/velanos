# Pitch script — 4 minutes
Deck: https://claude.ai/artifact/1VyjPQq2d6jQf7RUk2kYv7 (private until you share it). Speaker notes are also in the deck.
Read at a calm pace; the timings add up to about 4:00 at a steady pace. If you are running long, drop slide 8 (the table) and say its one line in the close.

## 1. Cover  ~15s

Agents can trade around the clock. Nobody hands one a wallet — and the reason isn't capability. It's recourse. If it goes wrong, who pays? Velanos answers that: trading agents post a bond, and rule-breakers pay you. Our one-line pitch: a blocked trade still pays.

## 2. Problem  ~30s

Agents can trade around the clock, read every filing, never sleep. And still nobody hands one a wallet. The reason isn't capability, it's recourse. Today you get two options. Give the agent authority: one prompt injection and the money is gone. Or wrap it in guardrails: bad actions get blocked, but blocking costs the agent nothing, and the one time your rules have a gap, you eat the loss alone. A reputation score doesn't fix that. A score repays nobody.

## 3. Idea  ~30s

Velanos makes the agent financially liable, automatically. Three words. Prevent: every action is a signed intent, checked on-chain against an immutable mandate, and the vault can never make an arbitrary call. Prove: a blocked intent still carries the agent's signature, and that's cryptographic evidence anyone can verify. Pay: that evidence slashes the agent's own bond to depositors in the same transaction. The bond is in the same asset you deposited, so a payout needs no oracle and no claims committee.

## 4. Flow  ~35s

Here's one trade. The agent signs an intent. PolicyGuard runs fourteen checks on-chain against the mandate. If everything passes, it executes, through an allowlisted adapter, for an exact amount, nothing else. If a static rule fails, the trade is refused, it never executes, and that's where every guardrail stops. We don't. The agent's signature is published. Anyone can report it, and the court slashes the bond in the same transaction: ninety percent to depositors, ten percent to whoever reported it. A blocked trade still pays.

## 5. Fair  ~30s

A bond is only credible if it's fair. So we split rules by who's to blame. Misconduct: the agent signed something it could have checked against its own mandate, so it's slashed. Bad luck: a live limit, like price, exposure or daily loss, made the trade unsafe. The trade is rejected, and the bond is untouched. Market risk: no rule was broken, the market simply fell eight percent below the peak. The breaker trips, the vault unwinds, and the bond tops depositors back up to the floor. We punish misconduct, not volatility.

## 6. Proof  ~40s

We didn't mock this. It's live on Arbitrum Sepolia: Paxos USDG, WETH priced by Chainlink feeds. Our agent signed a trade for USDC, which its mandate forbids. The relay refused it, so nothing executed. But the signature went public, a watcher reported it, and the bond paid: fifty USDG down to forty. Ten slashed, nine to depositors, one to the reporter. That's a real transaction you can open on Arbiscan right now. And the contracts are backed by a hundred and fifty-four Foundry tests.

## 7. Mcp  ~25s

Any agent can plug in over MCP. Four tools. The one that matters is preflight_intent: it runs the exact fourteen checks the contract will run and tells the agent the verdict before it signs. An agent that pre-flights can never be slashed for a rule it could see. We'll show it live in a second, with Claude Code attached to the real vault.

## 8. Different  ~20s

Why this isn't another guardrail. Guardrails block. Reputation describes. Velanos is the only one where the agent pays for misconduct out of its own bond, depositors are paid automatically in the same transaction, the evidence is a signature anyone can verify, and it separates misconduct from bad luck, so honest agents aren't punished for volatility.

## 9. Close  ~15s

Velanos: bonded capital vaults for autonomous trading agents. Live on Arbitrum Sepolia, real USDG, real Chainlink prices, and an MCP server any agent can plug into today. No agent should manage your money without staking its own. Thank you. Now let me show you Claude Code attached to a live vault.

---
Total ≈ 635 words (~4.0 min at 160 wpm).
