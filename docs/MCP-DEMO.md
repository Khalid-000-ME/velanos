# 90-second MCP demo — Claude Code on a bonded vault

## Setup (do once, before you present)
```bash
pnpm install
./scripts/up.sh          # indexer + relay + agent + watcher + web, against Arbitrum Sepolia
claude                   # run from the repo root; approve the "velanos" MCP server when prompted
```
Check with `/mcp` that **velanos** shows 4 tools. Keep `http://localhost:3000/vaults` open in a browser tab.
The signing key is read from `.env` by `scripts/mcp.sh`; nothing secret is in `.mcp.json`.

Vault: `0x13DE916B91A8143b7CB7d051ED2adD85cE8F9a3d` (Delta ETH I). Mandate: ETH only, 30 USDG per trade, 50 USDG bond.

## The script (paste these one at a time)
| Time | Paste into Claude Code | What the audience sees |
|---|---|---|
| 0:00 | `Read the mandate for vault 0x13DE916B91A8143b7CB7d051ED2adD85cE8F9a3d and summarise it in two lines.` | Plain-English rules: ETH only, 30 USDG cap, 50 USDG bond |
| 0:20 | `Pre-flight a 20 USDG buy of ETH on that vault.` | 14 checks, all PASS — "this intent would execute" |
| 0:35 | `Pre-flight a 20 USDG buy of USDC on that vault. What would happen if you signed it anyway?` | Rule 101 FAIL, **SLASHABLE** — "signing this costs the agent its bond" |
| 0:55 | `Submit the 20 USDG ETH buy.` | A real transaction hash on Arbitrum Sepolia |
| 1:10 | (switch to the browser tab) | NAV and position update on the vault page; click the tx link to Arbiscan |
| 1:25 | **Line:** "The agent that checks first can never be slashed for a rule it could see." | |

## If something goes wrong
- *No tools listed:* run `./scripts/up.sh` again, then `/mcp` → reconnect.
- *"unknown vault":* the indexer is still catching up — wait 10 s and retry.
- *Submit refuses:* the preflight tells you why (term, cap, balance). Retry with 15 USDG.
- Each submit is a real trade through a small pool, so don't spam it — two or three is plenty.
