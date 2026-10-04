#!/usr/bin/env bash
# Exposes the local back end so a deployed web app (Vercel) can reach it.
#
# One ngrok process serves both tunnels, so there is a single agent session and a single dashboard.
# A static domain is strongly preferred: a random URL changes on every restart and every change means
# redeploying Vercel. Claim one free domain at https://dashboard.ngrok.com/domains and set:
#
#   export NGROK_API_DOMAIN=your-name.ngrok-free.app
#
# Then:  ./scripts/up.sh && ./scripts/tunnel.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
mkdir -p .logs

command -v ngrok >/dev/null || { echo "ngrok is not installed: brew install ngrok"; exit 1; }
# --config replaces the default file rather than adding to it, so the agent's own config (which holds
# the authtoken) has to be passed alongside ours.
DEFAULT_CFG="$(ngrok config check 2>/dev/null | sed -n 's/.*at //p')"
if [ -z "${DEFAULT_CFG:-}" ] || ! grep -q authtoken "$DEFAULT_CFG" 2>/dev/null; then
  cat <<'MSG'
ngrok has no authtoken yet. It is free and takes a minute:

  1. Sign up:  https://dashboard.ngrok.com/signup
  2. Copy your token from https://dashboard.ngrok.com/get-started/your-authtoken
  3. Run:      ngrok config add-authtoken <YOUR_TOKEN>
  4. Claim a free static domain at https://dashboard.ngrok.com/domains
               export NGROK_API_DOMAIN=your-name.ngrok-free.app

Then run this script again.
MSG
  exit 1
fi
curl -sf localhost:4000/health >/dev/null || { echo "the API is not running on :4000 — run ./scripts/up.sh first"; exit 1; }

CFG="$ROOT/.logs/ngrok.yml"
{
  echo "version: 3"
  echo "agent:"
  echo "  log: stdout"
  echo "endpoints:"
  echo "  - name: api"
  echo "    upstream:"
  echo "      url: 4000"
  if [ -n "${NGROK_API_DOMAIN:-}" ]; then echo "    url: https://${NGROK_API_DOMAIN}"; fi
  echo "  - name: agent"
  echo "    upstream:"
  echo "      url: 4100"
  if [ -n "${NGROK_AGENT_DOMAIN:-}" ]; then echo "    url: https://${NGROK_AGENT_DOMAIN}"; fi
} > "$CFG"

pkill -f "ngrok start" 2>/dev/null || true
sleep 1
ngrok start --all --config "$DEFAULT_CFG" --config "$CFG" > "$ROOT/.logs/ngrok.log" 2>&1 &

printf 'waiting for the tunnels'
for _ in $(seq 1 40); do
  if curl -sf localhost:4040/api/tunnels >/dev/null 2>&1; then break; fi
  printf .; sleep 1
done
echo

python3 - <<'PY'
import json, urllib.request, sys
try:
    data = json.load(urllib.request.urlopen('http://localhost:4040/api/tunnels', timeout=5))
except Exception as e:
    sys.exit(f'could not read the ngrok dashboard: {e}')
urls = {t.get('name'): t['public_url'] for t in data.get('tunnels', []) if t['public_url'].startswith('https')}
api, agent = urls.get('api'), urls.get('agent')
if not api:
    sys.exit('no https tunnel for the API — check .logs/ngrok.log')
print()
print('  Tunnels are up.\n')
print(f'  API    {api}')
if agent: print(f'  Agent  {agent}')
print(f'\n  Set these in Vercel (Project → Settings → Environment Variables), then redeploy:\n')
print(f'    VELANOS_API_URL     {api}')
if agent: print(f'    VELANOS_AGENT_URL   {agent}')
print(f'    DEMO_ADMIN_TOKEN    (the same value as your local .env)')
print('\n  Check it:  curl -s %s/stats\n' % api)
PY
