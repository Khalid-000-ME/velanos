# Deploying Velanos for free

Blueprints, background workers, private services and persistent disks are all paid features on Render.
The free tier gives you **web services only**, so the architecture splits like this:

| Part | Where | Cost |
|---|---|---|
| **Web app** (`apps/web`) | Vercel, Hobby | free |
| **API** — indexer + relay (`apps/server`) | Render, Free web service | free |
| **Agent** (`apps/agent`) and **watcher** (`apps/watcher`) | your laptop, only while demoing | free |

That is enough for everything a judge looks at. The site reads the chain, so the vaults, NAV, bonds,
evidence feed and incident replays all work with the API alone — the slash transactions are already
on-chain and the indexer finds them. The agent and watcher only exist to create *new* activity, which
you do live from your machine.

---

## 1. API → Render (free web service)

**New → Web Service** → connect the repo → fill in:

| Field | Value |
|---|---|
| Root Directory | *(leave blank — the services share code in `packages/`)* |
| Runtime | Node |
| Build Command | `corepack pnpm install --frozen-lockfile` |
| Start Command | `corepack pnpm --filter @velanos/server start:prod` |
| Instance Type | Free |
| Health Check Path | `/health` |

> Do **not** use `corepack enable`. It symlinks into `/usr/bin`, which Render mounts read-only, and the
> build fails with `EROFS: read-only file system`. `corepack pnpm` runs the pinned version without it.

Environment variables:

| Name | Value |
|---|---|
| `SERVER_PORT` | `10000` |
| `USDG_MODE` | `official` |
| `STOCK_TOKEN_MODE` | `official` |
| `PERP_MODE` | `none` |
| `LLM_MODE` | `live` |
| `RH_TESTNET_RPC` | `https://rpc.testnet.chain.robinhood.com` |
| `ARB_SEPOLIA_RPC` | `https://sepolia-rollup.arbitrum.io/rpc` |
| `LOG_BATCH_BLOCKS` | `10000` |
| `RELAY_PK` | from your `.env` |
| `DEMO_ADMIN_TOKEN` | from your `.env` |

`LOG_BATCH_BLOCKS` matters: there is no disk on the free tier, so every restart re-indexes from the
deploy block. At the default of 2,000 blocks per tick that takes a few minutes; at 10,000 it is well
under a minute. Drop it back to 2,000 if the RPC starts refusing the range.

Check it:

```bash
curl -s https://<your-service>.onrender.com/stats
```

Wait for `"vaultCount":2`. An empty result in the first minute is the indexer still catching up.

## 2. Web app → Vercel (Hobby)

Import the repo, **Root Directory `apps/web`**, framework Next.js. Environment variables, Production:

| Name | Value |
|---|---|
| `VELANOS_API_URL` | `https://<your-service>.onrender.com` |
| `DEMO_ADMIN_TOKEN` | the same value as on Render |

Leave `NEXT_PUBLIC_SERVER_URL` unset — the browser calls this app's own origin and a proxy reaches the
API server-side, which is what keeps CORS out of the picture.

Add the domains `velanos.xyz` and `www.velanos.xyz` under **Settings → Domains** and follow the DNS
records Vercel shows. Redeploy after changing any environment variable: they only apply to a new build.

Check it:

```bash
curl -s https://velanos.xyz/api/velanos/stats
```

## 3. Keep the free service awake

A free Render service sleeps after 15 minutes of no traffic, and the next visitor waits roughly 50
seconds. Before judging, point a free uptime pinger at the health endpoint every 10 minutes:

- <https://cron-job.org> or <https://uptimerobot.com>, both free
- URL: `https://<your-service>.onrender.com/health`

Or just open the site yourself a minute before you present.

## 4. Running the agent and watcher during the demo

Keep these on your laptop. They need no inbound connection — they call the API, not the other way
round:

```bash
# point them at the hosted API instead of localhost
export SERVER_URL=https://<your-service>.onrender.com
(cd apps/agent && corepack pnpm start:prod) &
(cd apps/watcher && corepack pnpm start:prod) &
```

The watcher reports violations and keeps stock prices fresh; the agent proposes and signs trades. The
operator console on the live site will say the agent is unreachable unless you also expose it, which is
fine — drive scenarios from your machine.

The MCP demo is local too, and should stay that way: an MCP server holds a signing key. To point it at
the hosted API, run `VELANOS_SERVER_URL=https://<your-service>.onrender.com claude`.

---

## If you later want the fully hosted version

[`../render.yaml`](../render.yaml) describes all three services — API, agent as a private service, and
watcher as a background worker, with a 1 GB disk and private-network URLs. It needs a paid Render plan
(Starter) and the Blueprint feature. Nothing in the code changes.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `EROFS: read-only file system, unlink '/usr/bin/pnpm'` | `corepack enable` in the build command. Use `corepack pnpm install --frozen-lockfile`. |
| Build cannot resolve `@velanos/config` | Root Directory is set to `apps/server`. Leave it blank. |
| `/stats` returns `vaultCount: 0` | Still indexing, or the RPC is rejecting the `getLogs` range. Lower `LOG_BATCH_BLOCKS`. |
| Site loads but no vaults | `VELANOS_API_URL` missing or wrong on Vercel, or you did not redeploy. |
| Site returns HTML where JSON is expected | `NEXT_PUBLIC_SERVER_URL` is set on Vercel. Remove it and redeploy. |
| First visit takes ~50s | The free service was asleep. Set up the pinger in step 3. |
