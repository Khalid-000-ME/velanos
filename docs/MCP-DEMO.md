# 90-second MCP demo — Claude Code on a bonded vault

## Setup (do once, before you present)
```bash
pnpm install
./scripts/up.sh          # indexer + relay + agent + watcher + web, against Arbitrum Sepolia
claude                   # run from the repo root; approve the "velanos" MCP server when prompted
```
Check with `/mcp` that **velanos** shows 4 tools. Keep `http://localhost:3000/vaults` open in a browser tab.
The signing key is read from `.env` by `scripts/mcp.sh`; nothing secret is in `.mcp.json`.

Vault: `0x19f1411a11484Ff574d50D90981019177E6b10A7` (Delta Equities I, Robinhood Chain). Mandate: TSLA, AMZN and AMD only, 30 USDG per trade, 50 USDG bond. (An ETH vault is also live on Arbitrum Sepolia: `0x13DE916B91A8143b7CB7d051ED2adD85cE8F9a3d`.)

## The script (paste these one at a time)
| Time | Paste into Claude Code | What the audience sees |
|---|---|---|
| 0:00 | `Read the mandate for vault 0x19f1411a11484Ff574d50D90981019177E6b10A7 and summarise it in two lines.` | Plain-English rules: TSLA, AMZN, AMD only, 30 USDG cap, 50 USDG bond |
| 0:20 | `Pre-flight a 20 USDG buy of TSLA on that vault.` | 14 checks, all PASS — "this intent would execute" |
| 0:35 | `Pre-flight a 20 USDG buy of PLTR on that vault. What would happen if you signed it anyway?` | Rule 101 FAIL, **SLASHABLE** — "signing this costs the agent its bond" |
| 0:55 | `Submit the 20 USDG TSLA buy.` | A real transaction hash on Robinhood Chain |
| 1:10 | (switch to the browser tab) | NAV and position update on the vault page; click the tx link to the Robinhood explorer |
| 1:25 | **Line:** "The agent that checks first can never be slashed for a rule it could see." | |

## If something goes wrong
- *No tools listed:* run `./scripts/up.sh` again, then `/mcp` → reconnect.
- *"unknown vault":* the indexer is still catching up — wait 10 s and retry.
- *Submit refuses:* the preflight tells you why (term, cap, balance). Retry with 15 USDG.
- Each submit is a real trade through a small pool, so don't spam it — two or three is plenty.
