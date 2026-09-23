# Aegis Prop — working rules

Bonded capital vaults for autonomous trading agents.
Spec: `AEGIS_PROP_PRD.md` (authoritative). Build order: PRD §17.

## Hard rules

```
- Addresses only from packages/config/deployments/<chainId>.json
- No fake on-chain data in UI; label every test control "TEST CONTROL"
- Solidity 0.8.24, Foundry, OpenZeppelin v5; no arbitrary call() from vaults
- TypeScript strict; viem v2; wagmi v2; zod for every external input
- Settlement amounts are raw bigint in the settlement token's decimals; never floats on-chain or in signing
- Every new contract function needs a Foundry test; every rule ID needs a positive and negative test
- Banned copy: insured, guaranteed returns, risk-free, principal protected
```

Use "loss floor backed by agent bond" instead of insurance language.

## Layout

| Path | What |
|---|---|
| `contracts/` | Foundry project — vaults, guard, bond, court, oracle, adapters |
| `packages/config` | chains, deployments JSON, asset metadata, generated ABIs |
| `packages/sdk` | `@aegis/agent-sdk` — EIP-712, rule mirror, client |
| `packages/ui` | design tokens + shared React components |
| `apps/web` | Next.js App Router frontend |
| `apps/server` | Fastify indexer + REST/SSE + relay + demo control |
| `apps/agent` | LLM proposer + signing harness |
| `apps/watcher` | reports violations, trips breakers, unwinds, settles |
| `apps/mcp` | MCP server for third-party agents |

## Invariants that must never regress

1. A nonce is never both executed and slashed.
2. Total slashed ≤ total staked.
3. No function lets agent / operator / guardian / reporter withdraw LP assets.
4. `execute` never reverts on a rule failure — rejections are on-chain events.
5. Static rules (1xx) are slashable; stateful (2xx) never are; validity (3xx) are ignored.
6. After `compensateDrawdown`, `pricePerShare >= floor` whenever bond available ≥ shortfall.

## Contract size budget

`VaultDeployer` carries `AegisVault`'s full creation code, so it sits ~300 bytes under the
EIP-170 limit. **Adding code to `AegisVault` can break deployment.** Check `forge build --sizes`
after touching the vault; if it no longer fits, move view or pure logic into `AegisVaultLib` (a
linked external library) rather than reaching for a proxy — vault code must stay immutable after
creation. `via_ir` makes the vault *bigger*, so it stays off.

## Before declaring a milestone done

```
cd contracts && forge test
pnpm typecheck
```
