# Running the live app: Vercel in front, your laptop behind

The web app is on Vercel at **velanos.xyz**. The indexer, relay, agent and watcher stay on your machine
and are exposed through ngrok. The browser never talks to ngrok directly — the Next app proxies every
call — so there is no CORS to configure and no ngrok warning page.

```
browser ──► velanos.xyz (Vercel)
                 │  /api/velanos/*   server-side proxy
                 ▼
            ngrok tunnel ──► localhost:4000 (indexer + relay)
                          └► localhost:4100 (agent)
```

## One-time setup

1. **Authorise ngrok** (free):
   ```bash
   ngrok config add-authtoken <YOUR_TOKEN>      # from dashboard.ngrok.com
   ```
2. **Claim a free static domain** — do not skip this. Without it the URL changes every restart and you
   have to redeploy Vercel each time. Go to <https://dashboard.ngrok.com/domains>, create one, then:
   ```bash
   echo 'export NGROK_API_DOMAIN=your-name.ngrok-free.app' >> ~/.zshrc
   source ~/.zshrc
   ```

## Every time you demo

```bash
./scripts/up.sh        # indexer, agent, watcher, local web
./scripts/tunnel.sh    # prints the URLs to paste into Vercel
```

`tunnel.sh` prints exactly what to set. In **Vercel → your project → Settings → Environment Variables**,
add these for *Production*, then **redeploy** (Deployments → ⋯ → Redeploy):

| Name | Value |
|---|---|
| `VELANOS_API_URL` | the API tunnel URL, e.g. `https://your-name.ngrok-free.app` |
| `VELANOS_AGENT_URL` | the agent tunnel URL |
| `DEMO_ADMIN_TOKEN` | the same value as in your local `.env` |

With a static domain you only ever do this once; afterwards `./scripts/tunnel.sh` is the only step.

**Leave `NEXT_PUBLIC_SERVER_URL` unset on Vercel.** The browser calls the app's own origin, and setting
it would send the browser straight at ngrok, where it would meet the warning page.

## Check it worked

```bash
curl -s https://velanos.xyz/api/velanos/stats
```
You should get the live JSON — two vaults, 80 USDG bonded. Then open <https://velanos.xyz/vaults>: both
vaults, real NAV, real bonds.

## Things worth knowing

- **Your laptop has to stay awake and online.** Close the lid and the site shows empty states, because
  nothing is behind the tunnel any more. Run `caffeinate -s` in a spare terminal during judging.
- **The live intent stream falls back to polling.** ngrok's free tier buffers response bodies, so
  server-sent events open but deliver nothing. The feed refreshes every 5 seconds instead, which is
  fine to demo against — it just is not instant.
- **Cloudflare is the better tunnel if you hit trouble.** It needs no account and does not buffer:
  ```bash
  brew install cloudflared
  cloudflared tunnel --url http://localhost:4000
  ```
  Put the `trycloudflare.com` URL it prints into `VELANOS_API_URL` instead. The URL changes each run.
- **Nothing here touches the contracts.** They are deployed and public; the tunnel only exposes the
  indexer that reads them, so the worst case is that the website looks empty, never that funds move.
