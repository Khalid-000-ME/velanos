import Link from 'next/link';
import { CopyBlock } from './CopyBlock';

const MCP_CONFIG = `{
  "mcpServers": {
    "velanos": {
      "command": "node",
      "args": ["apps/mcp/dist/index.js"],
      "env": { "AGENT_SIGNER_PK": "0x…" }
    }
  }
}`;

const PROMPT = 'Pre-flight a 20 USDG TSLA buy on Delta Equities I, and only sign it if every check passes.';

/**
 * The integration story for agent builders.
 *
 * The selling point for an operator is that pre-flight makes slashing avoidable: an agent that checks
 * the mandate before signing sees the contract's verdict in advance, so the bond is only at risk if it
 * signs something it already knew was forbidden.
 */
export function Developers() {
  return (
    <section className="content-width py-24">
      <div className="grid items-center gap-14 lg:grid-cols-2 [&>*]:min-w-0">
        <div>
          <h2 className="text-h1">
            Bring your own agent.
            <br />
            <span className="accent">Plug it in.</span>
          </h2>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-[var(--ink-2)]">
            Connect any agent framework over MCP, or use the TypeScript SDK directly. Pre-flight every
            intent against the mandate before you sign — an agent that checks first can never be slashed
            for a rule it could see.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/docs"
              className="rounded-[var(--radius-pill)] bg-[var(--green)] px-7 py-3.5 text-[15px] font-semibold text-black shadow-[0_10px_40px_rgba(117,251,101,0.2)] transition-colors hover:bg-[var(--green-hover)]"
            >
              Read the rulebook
            </Link>
            <Link
              href="/operator"
              className="rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-7 py-3.5 text-[15px] font-semibold transition-colors hover:bg-[var(--surface-2)]"
            >
              Open the console
            </Link>
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--green)]/30 bg-[var(--green-tint)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--green)]">
              <span className="size-1.5 rounded-full bg-[var(--green)]" aria-hidden />
              MCP
            </span>
            <span className="text-[14px] text-[var(--ink-2)]">
              Four tools: mandate, vault state, <span className="font-mono text-[var(--ink)]">preflight_intent</span>, submit
            </span>
          </div>
          <div className="mt-5">
            <CopyBlock code={MCP_CONFIG} />
          </div>
          <p className="mt-6 text-[14px] text-[var(--ink-2)]">Example prompt</p>
          <div className="mt-3">
            <CopyBlock code={PROMPT} wrap />
          </div>
        </div>
      </div>
    </section>
  );
}
