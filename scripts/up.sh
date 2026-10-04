#!/usr/bin/env bash
# Starts the indexer/relay, agent, watcher and web app against the live Arbitrum Sepolia deployment.
# Keys and RPCs come from .env. Logs go to .logs/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
[ -f .env ] || { echo "missing .env (copy .env.example and fill in the keys)"; exit 1; }
"$ROOT/scripts/down.sh" >/dev/null 2>&1 || true
mkdir -p .logs
set -a; . ./.env; set +a
for s in server agent watcher; do (cd apps/$s && nohup npx tsx src/index.ts > "$ROOT/.logs/$s.log" 2>&1 &); done
(cd apps/web && NEXT_PUBLIC_SERVER_URL=http://localhost:4000 nohup npx next dev --port 3000 > "$ROOT/.logs/web.log" 2>&1 &)
printf 'waiting for the indexer'
for _ in $(seq 1 60); do curl -sf localhost:4000/stats >/dev/null && break; printf .; sleep 1; done
echo; curl -s localhost:4000/stats; echo
echo "app: http://localhost:3000"
