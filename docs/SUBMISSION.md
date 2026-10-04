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

## What's real — two live deployments

**Robinhood Chain testnet (46630)** — tokenised stocks
| | |
|---|---|
| Settlement and bond | **Paxos USDG** `0x7E955252E15c84f5768B83c41a71F9eba181802F` |
| In the mandate | **TSLA** `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` · **AMZN** `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02` · **AMD** `0x71178BAc73cBeb415514eB542a8995b82669778d` |
| Forbidden | **PLTR** `0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0` · **NFLX** `0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93` |
| Prices | the faucet's stock tokens have no feed, so a dedicated updater key writes live market quotes (watcher) |

| Contract | Address |
|---|---|
| VaultFactory | `0xDc6FeD0028bba0bA222D5b5b5bF5a0FDDf68df26` |
| PolicyGuard | `0xB6061bC7489bDAe71cAeFd8d86A5800a78fa9bE9` |
| BondManager | `0xc36d8B1f7bd10664f43B06fCa4efFd1A78D43615` |
| ViolationCourt | `0xbb0cB18CC4fc7af485AAE77b11A71884849aB98B` |
| AgentRegistry | `0x87a06BDf9130dd545ea76e887825D3Fe4642D008` |
| VelanosPriceOracle | `0x6C54f7F4adb7193e022ba73FcbcD477722C426bC` |
| StockSwapAdapter | `0xfA7BfA4800D37B81E74FA5B05b2EF6A9FC116733` |
| **Vault: Delta Equities I** | `0x19f1411a11484Ff574d50D90981019177E6b10A7` |

Explorer: `https://explorer.testnet.chain.robinhood.com/address/<address>`

**Arbitrum Sepolia (421614)** — ETH
| | |
|---|---|
| Settlement and bond | **Paxos USDG** `0xFFC95faa3d63Cde504a05B567C600B78C0b41892` |
| In the mandate | **WETH** `0x980B62Da83eFf3D4576C647993b0c1D7faf17c73`, priced by **Chainlink ETH/USD** |
| Forbidden | **USDC** `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`, priced by **Chainlink USDC/USD** |

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

Nothing is minted and nothing is mocked: every pool is funded from the deployer's own real balances.

## Proof a judge can check

**Robinhood Chain — Delta Equities I**
| Event | Transaction |
|---|---|
| 50 USDG bond staked | [`0xae8c4444…c44f`](https://explorer.testnet.chain.robinhood.com/tx/0xae8c444454c66b2806dfb2ef035a6a3b560e519678b31e0c227c60d06966c44f) |
| 80 USDG deposited | [`0x2dd5b430…d225`](https://explorer.testnet.chain.robinhood.com/tx/0x2dd5b430d7fd5d0295003d947ef670537af11b73d1523640edb5f0a1174cd225) |
| Compliant trade chosen by the model (AMD) executed | [`0x76bdcef8…8685`](https://explorer.testnet.chain.robinhood.com/tx/0x76bdcef814d729478727e62dd59e35be18766b639fc6321cd68ca8bbf3288685) |
| Prompt-injection intent (PLTR) refused, then **reported and slashed** (rule 101) | [`0xdb6b12aa…38a4`](https://explorer.testnet.chain.robinhood.com/tx/0xdb6b12aad114a34e072111f9f32550f818e7ae45ac1f8ad35dfa47bf17db38a4) |

Result: bond **50 → 40 USDG**, 10 USDG slashed (9 to depositors, 1 to the reporter); the forbidden trade never executed.

**Arbitrum Sepolia — Delta ETH I**
| Event | Transaction |
|---|---|
| 50 USDG bond staked | [`0x7f7fbb35…5454`](https://sepolia.arbiscan.io/tx/0x7f7fbb359f8118c388060de57cb2c388ec9aa6ce91897e7f296219cb94465454) |
| 80 USDG deposited | [`0xf53ac391…21f6`](https://sepolia.arbiscan.io/tx/0xf53ac391940a63acf58e5e4eee934923d776ae071b35c6426263ae2c91b821f6) |
| Compliant trade (20 USDG → WETH) executed | [`0xe7ce3977…0660`](https://sepolia.arbiscan.io/tx/0xe7ce3977d2b93565ab1f54a9e2c2500ad9413d0515ca693437b738027e360660) |
| Prompt-injection intent (USDC) refused, then **reported and slashed** | [`0x670cd565…815f`](https://sepolia.arbiscan.io/tx/0x670cd56563127434844f37282c72de9c6e560946f9faf6ae28ff682f3b78815f) |
| Trade submitted by Claude Code through the MCP server | [`0x6d127897…f466`](https://sepolia.arbiscan.io/tx/0x6d12789762c49e7c0a1327bf75c77cdaa008f30d286323213dcade7cdd1af466) |

Other proof: **154 Foundry tests**, an SDK differential test that checks the TypeScript rule mirror against the deployed contract, and a rulebook page that lists all 14 checks.

## How it works (diagrams)
- `docs/diagrams/lifecycle.png` — what happens to one trade, from signature to slash
- `docs/diagrams/architecture.png` — how the pieces fit
- `docs/diagrams/outcomes.png` — misconduct, bad luck and market risk
(SVG versions alongside.)

## Built with
Solidity 0.8.24 · Foundry · OpenZeppelin 5 (ERC-4626) · Chainlink · Paxos USDG · Robinhood Chain · Arbitrum Sepolia · Next.js 16 · viem · wagmi · Fastify · SQLite · Groq (agent model) · MCP (works with Claude Code) · TypeScript SDK.

## Honest scope
- Testnet only; not audited.
- Losses within a mandate's drawdown limit stay with depositors; payouts are capped by the bond.
- The swap venue is Velanos's own oracle-priced pool, funded with real tokens and quoted at the oracle price.
- Stock prices come from an updater key writing live market quotes (the testnet tokens have no feed); ETH and USDC prices come from Chainlink.
- The operator console and its news feed are labelled **TEST CONTROL**: they drive the agent through scenarios and have no authority over a vault. The agent's proposals come live from a Groq-hosted model.
- GMX perps are on the roadmap, not in this deployment.

## Links to fill in
- Live app: https://velanos.xyz
- Repo: https://github.com/Khalid-000-ME/velanos
- Demo video: <add>
- Pitch deck: <add>
- X: https://x.com/VelanosProtocol
