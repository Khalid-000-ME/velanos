#!/usr/bin/env bash
# Starts the Velanos MCP server for Claude Code. The signing key is read from .env, so no secret is
# ever written into a committed config file.
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
export SERVER_URL="${VELANOS_SERVER_URL:-http://localhost:4000}"
exec node_modules/.bin/tsx apps/mcp/src/index.ts
