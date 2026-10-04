# Deploying Velanos on velanos.xyz

> **Demoing today?** The web app is already on Vercel and the back end runs on your laptop behind a
> tunnel. That path is [`VERCEL-TUNNEL.md`](VERCEL-TUNNEL.md) — this file is the full hosted setup.

The contracts are already live on Robinhood Chain testnet and Arbitrum Sepolia. What remains is hosting three things: the web app,
the API (relay + indexer), and two small workers.

| Part | Where | Why | Domain |
|---|---|---|---|
| **Web app** (`apps/web`, Next.js) | **Vercel** | Next.js is Vercel's home turf; zero config, previews, CDN | `velanos.xyz` and `www.velanos.xyz` |
| **API** (`apps/server`, Fastify + SQLite + SSE) | **Render** web service + 1 GB persistent disk | Long-lived process, an indexer loop and an SSE stream — not a fit for serverless | `api.velanos.xyz` |
| **Watcher** (`apps/watcher`) | **Render** background worker | Runs continuously, listens on no port | — |
| **Agent** (`apps/agent`) | **Render** web service (private) | Holds the agent key and calls Claude; only the API talks to it | — |
| **MCP server** (`apps/mcp`) | Runs on the **user's machine** (stdio) | An MCP server holds the signing key — it should never be shared | — |

SQLite needs the disk, so use Render's **Starter** plan or higher for the API (the free tier has no disk and
sleeps). Everything else can start on Starter too, to avoid cold starts during judging.

## 1. Web → Vercel
1. Import the repo, set **Root Directory** to `apps/web`, framework **Next.js**.
2. Environment variables:
   - `NEXT_PUBLIC_SERVER_URL=https://api.velanos.xyz`
   - `DEMO_ADMIN_TOKEN=<same value as the API>`  (used by the operator console route handlers)
3. Add domains `velanos.xyz` and `www.velanos.xyz`; at your registrar set the **A** record `76.76.21.21` for the apex
   and a **CNAME** `www → cname.vercel-dns.com` (Vercel shows the exact values to copy).

## 2. API → Render

The fastest route is the blueprint: **New → Blueprint**, point it at this repo, and Render reads
[`render.yaml`](../render.yaml) and creates all three back-end services with the right commands, disk and
health check. It then prompts for the secrets. Skip to step 4 if you use it.

To do it by hand instead — new **Web Service** from the repo, **Root Directory left blank** (the services
share code in `packages/`, so the build has to run from the repo root):
  - Build: `corepack pnpm install --frozen-lockfile`
  - Start: `corepack pnpm --filter @velanos/server start:prod`
  - Health check path: `/health`
  - Attach a **disk** mounted at `/opt/render/project/src/apps/server/data` (1 GB).

> Do **not** use `corepack enable`. It tries to symlink pnpm into `/usr/bin`, which is read-only on
> Render's builders, and the build fails with `EROFS: read-only file system`. `corepack pnpm` runs the
> version pinned in `package.json` without touching `/usr/bin`.
>
> The services run through `tsx` rather than a compiled `dist`, because the SDK's extensionless
> TypeScript imports do not resolve under plain `node`.
- Env: `RH_TESTNET_RPC`, `ARB_SEPOLIA_RPC`, `RELAY_PK`, `DEMO_ADMIN_TOKEN`, `SERVER_PORT=10000`, `USDG_MODE=official`, `STOCK_TOKEN_MODE=official`, `PERP_MODE=none`,
  `AGENT_URL=<private agent URL>`.
- Custom domain: `api.velanos.xyz` → Render gives a CNAME target. CORS must allow `https://velanos.xyz`.

## 3. Watcher and agent → Render
Both use the same build command as the API and start with
`corepack pnpm --filter @velanos/<app> start:prod`.

- **Background worker** `apps/watcher`: env `RH_TESTNET_RPC`, `ARB_SEPOLIA_RPC`, `WATCHER_PK`, `PRICE_UPDATER_PK` (keeps the stock prices fresh), `SERVER_URL=https://api.velanos.xyz`.
- **Private service** `apps/agent`: env `RH_TESTNET_RPC`, `ARB_SEPOLIA_RPC`, `AGENT_SIGNER_PK`, `AGENT_TX_PK`, `GROQ_API_KEY`, `LLM_PROVIDER=groq`, `LLM_MODEL=openai/gpt-oss-120b`, `LLM_MODE=live`, `SERVER_URL`.

## 4. Keys
Put the private keys in the host's secret store, never in the repo. Each role has its own key and needs a little
testnet ETH for gas on both chains (relay, watcher, agent-tx, price updater). Rotate any key that has ever appeared in a chat or a log.

## 5. Order and checks
1. Deploy the API; open `https://api.velanos.xyz/stats` — it should show the live vault and bond.
2. Deploy the watcher and agent.
3. Deploy the web app; the landing counters should match `/stats`.
4. MCP users set `VELANOS_SERVER_URL=https://api.velanos.xyz` and keep running it locally.

## Cheaper alternative
A single small VPS (or one Render service) running API + watcher + agent via `pm2` works fine for a hackathon, and the
web app stays on Vercel. It is one fewer thing to wire together if time is short.
