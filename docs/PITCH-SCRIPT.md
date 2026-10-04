# Pitch script — 3 minutes 40

Deck: https://claude.ai/artifact/1VyjPQq2d6jQf7RUk2kYv7 (private until you share it).

**How to deliver it.** Short sentences. Stop at the full stops — the pauses are doing the work. Three lines
are the ones that have to land, so slow down and let each one sit:

- *"A score is a number. It doesn't pay you back."*
- *"Nothing executed, and the agent still paid."*
- *"We punish misconduct. We don't punish volatility."*

Don't read the slides out. The slide holds the number; you tell the story around it.
If you are running long, cut slide 8 and say its one line on the way into the close.

---

## 0:00 · Cover

Agents can trade twenty-four hours a day. Nobody gives one a wallet. Not because they can't trade — because when it goes wrong, nobody pays. That's what we fixed. The agent posts a bond. Break a rule, and that bond pays you.

## 0:12 · The problem

Right now you get two choices. Hand the agent your keys — one prompt injection and it's gone. Or wrap it in guardrails. Guardrails block the bad trade. Fine. But blocking costs the agent nothing, so it has no reason to get better. And the day your rules have a gap, you eat the loss alone. People say: use reputation scores. A score is a number. It doesn't pay you back.

## 0:42 · The idea

So we made the agent liable. Three words. Prevent — every trade is signed and checked on-chain against rules it cannot change. Prove — we block it, but we keep the signature, and that signature is proof it tried. Pay — anyone submits that proof and the bond moves to depositors. Same transaction. No claim form, no committee.

## 1:10 · How it works

Here's one trade. The agent signs. Fourteen checks run on-chain. Pass, it executes. Fail — and this is the part nobody else does — we refuse the trade, but we publish the signature. Anyone can pick that up and get paid to report it. The bond moves. Nothing executed, and the agent still paid. That's the whole pitch. A blocked trade still pays.

## 1:42 · Why it is fair

A bond only works if it's fair. So we split the rules three ways. Broke a rule it could have checked itself? Slashed. Got caught by a live limit — the price moved, it hit an exposure cap? Rejected, bond untouched. Market just fell through the floor? The breaker trips and the bond tops depositors back up. We punish misconduct. We don't punish volatility.

## 2:10 · Proof

This is live. Robinhood Chain and Arbitrum. Real Paxos USDG, real tokenised Tesla, Amazon and AMD. We poisoned the news feed. The model read it and signed a trade for Palantir — not in its mandate. The relay refused. Nothing executed. A watcher reported the signature, and the bond went from fifty to forty. Nine USDG to depositors, one to whoever reported it. That transaction is on the explorer right now. Go open it.

## 2:42 · For builders

Any agent plugs in. Four tools over MCP. The one that matters is pre-flight — it runs the same fourteen checks before the agent signs. Check first, and you can never be slashed for a rule you could see. I'll show you that live with Claude Code in a second.

## 3:04 · Why we win

Guardrails block. Reputation describes. We're the only one where the agent actually pays, the depositor gets paid automatically in the same transaction, and the evidence is a signature anyone can verify.

## 3:22 · Close

No agent should manage your money without staking its own. Velanos. Live on two chains, real money, and any agent can plug in today. Thank you — let me show you the live demo.

---

≈ 487 words. At a steady pace with real pauses that is about 3:40, leaving time for the live demo.
