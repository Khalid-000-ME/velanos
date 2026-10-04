import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CopyBlock } from '@/components/landing/CopyBlock';

export const metadata: Metadata = {
  title: 'Connect an agent — Velanos',
  description: 'Plug Claude Code into a live Velanos vault over MCP in under a minute.',
};

/**
 * The page we point a judge at mid-demo: every command is one click to copy, in the order they are
 * run. The prompts are written to be pasted into an agent verbatim.
 */
const VAULT = '0x19f1411a11484Ff574d50D90981019177E6b10A7';

const STEPS = [
  {
    n: '01',
    title: 'Start the stack',
    body: 'Brings up the indexer, the agent harness and the watcher against the live chains.',
    code: 'git clone https://github.com/Khalid-000-ME/velanos\ncd velanos && pnpm install\n./scripts/up.sh',
  },
  {
    n: '02',
    title: 'Open Claude Code in the repo',
    body: 'Run it from the repo root so it picks up .mcp.json, then approve the “velanos” server. Check /mcp lists four tools.',
    code: 'claude',
  },
];

const PROMPTS = [
  {
    label: 'Read the rules',
    says: 'The mandate in plain English: three assets, a 30 USDG per-trade cap, a 50 USDG bond.',
    code: `Read the mandate for vault ${VAULT} and summarise it in two lines.`,
  },
  {
    label: 'Pre-flight a legal trade',
    says: 'All fourteen on-chain checks pass. This intent would execute.',
    code: `Pre-flight a 15 USDG buy of TSLA on vault ${VAULT}.`,
  },
  {
    label: 'Pre-flight a forbidden trade',
    says: 'Rule 101, asset not in mandate — SLASHABLE. Signing it costs the agent its bond.',
    code: `Pre-flight a 15 USDG buy of PLTR on vault ${VAULT}. What happens if you sign it anyway?`,
  },
  {
    label: 'Submit the legal trade',
    says: 'A real transaction on Robinhood Chain testnet, signed by the agent and checked on-chain.',
    code: `Submit the 15 USDG TSLA buy on vault ${VAULT}.`,
  },
];

export default function ConnectPage() {
  return (
    <div className="content-width py-20">
      <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[var(--green)]">
        Live demo
      </p>
      <h1 className="text-h1 mt-4 max-w-3xl">Plug your agent into a real vault.</h1>
      <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-[var(--ink-2)]">
        Four tools over MCP. Works with Claude Code, or any agent framework that speaks it. The vault
        below is live on Robinhood Chain testnet with a real 50 USDG bond behind it.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link
          href={`/vaults/${VAULT}`}
          className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--green)] px-6 py-3 text-[15px] font-semibold text-black transition-colors hover:bg-[var(--green-hover)]"
        >
          Watch the vault <ArrowRight size={15} />
        </Link>
        <a
          href={`https://explorer.testnet.chain.robinhood.com/address/${VAULT}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-[var(--radius-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-6 py-3 text-[15px] font-semibold transition-colors hover:bg-[var(--surface-2)]"
        >
          Open it on the explorer
        </a>
      </div>

      <section className="mt-16">
        <h2 className="text-[26px] font-semibold">Set up — about a minute</h2>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-7"
            >
              <p className="font-mono text-[13px] text-[var(--green)]">{s.n}</p>
              <h3 className="mt-3 text-[19px] font-semibold">{s.title}</h3>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed text-[var(--ink-2)]">{s.body}</p>
              <div className="mt-5">
                <CopyBlock code={s.code} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-[26px] font-semibold">Then paste these, in order</h2>
        <p className="mt-2 text-[15px] text-[var(--ink-2)]">
          Each one is a prompt for the agent, not a shell command.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          {PROMPTS.map((p, i) => (
            <div
              key={p.label}
              className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-7"
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-[13px] text-[var(--green)]">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-[19px] font-semibold">{p.label}</h3>
              </div>
              <div className="mt-4">
                <CopyBlock code={p.code} wrap />
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-3)]">
                <span className="text-[var(--ink-2)]">What you should see — </span>
                {p.says}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-[var(--radius-lg)] border border-[var(--loss)]/30 bg-[var(--loss-tint)] p-7">
        <h2 className="text-[19px] font-semibold text-[var(--loss)]">Pre-flight PLTR. Never submit it.</h2>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--ink-2)]">
          This vault already carries one breach. Submitting a forbidden trade would be its second, which
          freezes the vault and unwinds it to USDG — on-chain, permanently. Pre-flighting it is free and
          shows the same verdict, which is the part worth watching.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="text-[26px] font-semibold">The four tools</h2>
        <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]">
          {[
            ['get_mandate', 'The vault’s rules in plain English, plus the raw struct.'],
            ['get_vault_state', 'NAV, NAV per share, the loss floor, the bond at stake, positions.'],
            ['preflight_intent', 'Runs the exact checks the contract will run, before anything is signed.'],
            ['submit_intent', 'Signs with the operator’s own key and hands it to the relay.'],
          ].map(([name, desc], i) => (
            <div
              key={name}
              className={`flex flex-col gap-1 bg-[var(--surface)] p-6 sm:flex-row sm:items-baseline sm:gap-8 ${i > 0 ? 'border-t border-[var(--line)]' : ''}`}
            >
              <p
                className={`font-mono text-[15px] sm:w-[220px] ${name === 'preflight_intent' ? 'font-semibold text-[var(--green)]' : ''}`}
              >
                {name}
              </p>
              <p className="text-[15px] leading-relaxed text-[var(--ink-2)]">{desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[15px] text-[var(--ink-2)]">
          An agent that calls <span className="font-mono text-[var(--green)]">preflight_intent</span> first
          can never be slashed for a rule it could have seen.
        </p>
      </section>
    </div>
  );
}
