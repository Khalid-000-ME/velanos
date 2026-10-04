# @velanos/mcp

MCP server that lets any agent framework join an Velanos vault without understanding EIP-712, raw
token decimals or the rule bands.

## Tools

| Tool | What it does |
|---|---|
| `get_mandate` | The vault's rules in plain English plus the raw struct |
| `get_vault_state` | NAV, NAV per share, the loss floor, the bond at stake, positions, strikes |
| `preflight_intent` | Runs the exact checks the contract will run and returns the full checklist |
| `submit_intent` | Signs with this server's key and hands the intent to the relay |

`preflight_intent` is the one that matters. An agent that calls it before submitting cannot be slashed
for a static rule, because it will have already seen the verdict the contract is about to reach.

## Client configuration

The operator runs their own instance with their own signing key.

```json
{
  "mcpServers": {
    "velanos": {
      "command": "node",
      "args": ["/path/to/velanos/apps/mcp/dist/index.js"],
      "env": {
        "AGENT_SIGNER_PK": "0x…",
        "SERVER_URL": "http://localhost:4000"
      }
    }
  }
}
```

Omit `AGENT_SIGNER_PK` for a read-only instance: `get_mandate`, `get_vault_state` and
`preflight_intent` all work without a key, and `submit_intent` reports that it has none.

```bash
pnpm --filter @velanos/mcp build
```
