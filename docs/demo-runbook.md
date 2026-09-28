# Demo runbook

## Before recording

```bash
pnpm i
pnpm contracts:build && pnpm contracts:test      # expect 148 passing
pnpm contracts:deploy:rh
pnpm demo:seed                                   # vaults A–E, fresh addresses
pnpm dev
pnpm demo:all                                    # gate must be green before you record
```

`LLM_MODE=replay` for recording — fixtures make every take identical. Switch to `live` for Q&A, where
the point is that a real model is driving.

Vault E expires three minutes after seeding, so run the post-expiry scenario promptly or reseed.

## Three-minute script

| Time | Screen | Beat |
|---|---|---|
| 0:00–0:15 | Discover | "Agents can trade around the clock. Nobody hands one a wallet. If it goes rogue, who pays?" Live counters: total bonded, total slashed, violations blocked. |
| 0:15–0:40 | Fund vault A | The worst-case card. "Your loss is capped at 8% — backed by 300 tUSDG of the agent's own money." Deposit. |
| 0:40–0:55 | Operator → S0, then cockpit | Green intent with the agent's reasoning. Open the inspector: every check green, actual against limit. |
| 0:55–1:40 | Operator → poison feed → S1 | Red row, slash toast. Open the incident replay and let it auto-play: poisoned headline → the agent's words → its signature → verdict → report → money moving. Then S2 — vault turns FROZEN live. |
| 1:40–1:55 | S4 on vault C | Three amber rejections, WARNED, bond still 300. "We punish misconduct, not volatility." |
| 1:55–2:35 | S6 on vault D | Compliant book, apply the shock, floor crossed, breaker trips, unwind, bond tops depositors back to the floor. Show the explorer transaction. |
| 2:35–3:00 | Perps slash + close | S3 on Arbitrum, SDK/MCP slide, tagline. |

## Reliability

- Pre-fund every key and check balances before recording; a failed transaction mid-take is unrecoverable.
- Keep a separate fresh seed for live judging, so the recorded run and the live run never share nonces.
- `POST /demo/reset` clears indexed state; reseeding produces new vault addresses so the demo repeats cleanly.
- If GMX keepers are lagging, set `PERP_MODE=mock`. The status bar says so, and the perps static-violation
  scenario never depended on a fill.
