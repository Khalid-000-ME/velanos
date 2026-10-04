# Deploying Velanos on velanos.xyz

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
- New **Web Service** from the repo. Root `apps/server`.
  - Build: `corepack enable && pnpm install --frozen-lockfile`
  - Start: `pnpm --filter @velanos/server start` (or `npx tsx src/index.ts` from `apps/server`)
  - Attach a **disk** mounted at `apps/server/data` (1 GB).
- Env: `RH_TESTNET_RPC`, `ARB_SEPOLIA_RPC`, `RELAY_PK`, `DEMO_ADMIN_TOKEN`, `PORT`, `USDG_MODE=official`, `STOCK_TOKEN_MODE=official`, `PERP_MODE=none`,
  `AGENT_URL=<private agent URL>`.
- Custom domain: `api.velanos.xyz` → Render gives a CNAME target. CORS must allow `https://velanos.xyz`.

## 3. Watcher and agent → Render
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
