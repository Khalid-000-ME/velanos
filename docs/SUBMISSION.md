# Velanos — submission pack

Copy-paste ready. Everything below is true of the live deployment.

## Name
**Velanos**

## Taglines (pick one)
- **A blocked trade still pays.**
- Trading agents post a bond. Rule-breakers pay you.
- No agent should manage your money without staking its own.
- Guardrails stop at "blocked". Velanos keeps the signature as evidence.

## One-liner
Bonded capital vaults for autonomous trading agents: every trade is checked on-chain, and a signed rule-break slashes the agent's own USDG bond straight to depositors — even when the trade never executes.

## Short description (≈50 words)
AI agents can trade around the clock, but nobody hands one a wallet because there is no recourse. Velanos makes the agent liable. Every action is a signed intent checked on-chain against an immutable mandate. A forbidden intent is blocked, yet its signature is evidence that slashes the agent's pre-posted bond to depositors.

## Problem
Agents get either full authority (one prompt injection and the money is gone) or a policy engine that blocks bad actions but costs the agent nothing — and when the rules have a gap, you absorb the loss. Reputation scores repay nobody.

## Solution — Prevent, Prove, Pay
1. **Prevent** — EIP-712 signed intents, 14 on-chain checks against an immutable mandate, no arbitrary calls from the vault.
2. **Prove** — a blocked intent still carries the agent's signature: cryptographic evidence anyone can verify.
3. **Pay** — that evidence slashes the agent's bond to depositors in the same transaction; a drawdown breaker spends the bond restoring depositors to a promised loss floor.

## What makes it different
- **Blocked ≠ forgiven.** Prevention and liability are decoupled — a refused trade still costs the agent its bond.
- **Misconduct vs bad luck.** Static rules (1xx) slash; live-state rules (2xx) never do. We punish misconduct, not volatility.
- **Permissionless enforcement.** Anyone can report a violation and earn a 10% bounty. No committee, no oracle for payouts.
- **Bond in the deposited asset.** Paid in USDG, so a payout needs no pricing.
- **Drop-in for any agent.** An MCP server and TypeScript SDK; `preflight_intent` makes an agent un-slashable for any rule it could have seen.

## What's real (Arbitrum Sepolia, chain 421614)
| | |
|---|---|
| Settlement and bond | **Paxos USDG** `0xFFC95faa3d63Cde504a05B567C600B78C0b41892` |
| Traded asset (in mandate) | **WETH** `0x980B62Da83eFf3D4576C647993b0c1D7faf17c73`, priced by **Chainlink ETH/USD** |
| Forbidden asset | **USDC** `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`, priced by **Chainlink USDC/USD** |
| Nothing minted, nothing mocked | pools are funded from the deployer's own real balances |

| Contract | Address |
|---|---|
| VaultFactory | `0x232d130A4308b3b995491ee7b2129c98A02eAae8` |
| PolicyGuard | `0xacFb0dC77101a45757FCE54BC6cb3923a71dBDF9` |
| BondManager | `0x2BedD45CB914C39c75440c6Aeb16C0003A07b0c5` |
| ViolationCourt | `0x1614857E261bc26Ca0a716a127303078267284b6` |
| AgentRegistry | `0x1D6025BCFDCFC61f58A16A20365aD462786D6f47` |
| VelanosPriceOracle | `0x190431a6F749f1aEa9858cD6b0e3a7492Cb66048` |
| StockSwapAdapter | `0x44c6058B4df8468A96FA66276d8429016b7Fe0d4` |
| **Vault: Delta ETH I** | `0x13DE916B91A8143b7CB7d051ED2adD85cE8F9a3d` |

Explorer: `https://sepolia.arbiscan.io/address/<address>`

## Proof a judge can check
| Event | Transaction |
|---|---|
| Agent registered | [`0x1bf3d134…4864`](https://sepolia.arbiscan.io/tx/0x1bf3d134793f70b05eddfe96be49fd87890df7c425b62118328975b772314864) |
| Vault created | [`0xe4ad4735…2b9c`](https://sepolia.arbiscan.io/tx/0xe4ad4735a8f225dbabb91d011fbe388b11f5784294dcaf80b3effe16d2c92b9c) |
| 50 USDG bond staked | [`0x7f7fbb35…5454`](https://sepolia.arbiscan.io/tx/0x7f7fbb359f8118c388060de57cb2c388ec9aa6ce91897e7f296219cb94465454) |
| 80 USDG deposited | [`0xf53ac391…21f6`](https://sepolia.arbiscan.io/tx/0xf53ac391940a63acf58e5e4eee934923d776ae071b35c6426263ae2c91b821f6) |
| Compliant trade executed (20 USDG → WETH) | [`0xe7ce3977…0660`](https://sepolia.arbiscan.io/tx/0xe7ce3977d2b93565ab1f54a9e2c2500ad9413d0515ca693437b738027e360660) |
| Prompt-injection intent refused, then **reported and slashed** (rule 101) | [`0x670cd565…815f`](https://sepolia.arbiscan.io/tx/0x670cd56563127434844f37282c72de9c6e560946f9faf6ae28ff682f3b78815f) |
| Trade submitted by Claude Code through the MCP server | [`0x6d127897…f466`](https://sepolia.arbiscan.io/tx/0x6d12789762c49e7c0a1327bf75c77cdaa008f30d286323213dcade7cdd1af466) |

Result: the bond went **50 → 40 USDG**, **10 USDG** was slashed (9 to depositors, 1 to the reporter), and the intent
never executed. The refused trade was an attempt to buy USDC, which the mandate forbids.

Other proof: **154 Foundry tests**, an SDK differential test that checks the TypeScript rule mirror against the deployed
contract, and a rulebook page that lists all 14 checks.

## How it works (diagrams)
- `docs/diagrams/lifecycle.png` — what happens to one trade, from signature to slash
- `docs/diagrams/architecture.png` — how the pieces fit
- `docs/diagrams/outcomes.png` — misconduct, bad luck and market risk
(SVG versions alongside.)

## Built with
Solidity 0.8.24 · Foundry · OpenZeppelin 5 (ERC-4626) · Chainlink · Paxos USDG · Arbitrum Sepolia · Next.js 16 · viem · wagmi · Fastify · SQLite · Claude (agent + MCP) · TypeScript SDK.

## Honest scope
- Testnet only; not audited.
- Losses within a mandate's drawdown limit stay with depositors; payouts are capped by the bond.
- The swap venue is Velanos's own oracle-priced pool, funded with real USDG, WETH and USDC and quoted at the Chainlink price.
- The operator console and its news feed are labelled **TEST CONTROL**: they drive the agent through scenarios and have no authority over a vault.
- The agent's replies in the console are recorded model output unless `LLM_MODE=live` with an Anthropic key.
- Robinhood Chain stock tokens and GMX perps are on the roadmap, not in this deployment.

## Links to fill in
- Live app: https://velanos.xyz
- Repo: https://github.com/Khalid-000-ME/velanos
- Demo video: <add>
- Pitch deck: <add>
- X: https://x.com/VelanosProtocol
