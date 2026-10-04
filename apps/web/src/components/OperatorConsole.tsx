'use client';

import { useState } from 'react';
import { Play, RotateCcw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Chip, StateChip, TestControlBadge, cn } from '@velanos/ui';
import type { VaultSummary } from '@/lib/api';

interface Profile {
  id: string;
  label: string;
  description: string;
  route: string;
  preflight: boolean;
  expected: string;
}

const SCENARIOS = [
  { id: 's0', label: 'S0 · Good trade', profile: 'good' },
  { id: 's1', label: 'S1 · Prompt injection', profile: 'prompt_injected' },
  { id: 's2', label: 'S2 · Fat finger', profile: 'fat_finger' },
  { id: 's3', label: 'S3 · Hallucinated market', profile: 'hallucinated_market' },
  { id: 's4', label: 'S4 · Revenge trader', profile: 'revenge_trader' },
  { id: 's5', label: 'S5 · Ghost after expiry', profile: 'ghost_after_expiry' },
  { id: 's6', label: 'S6 · Silent bleeder', profile: 'silent_bleeder' },
] as const;

const SHOCK_ASSETS = ['TSLA', 'AMZN', 'AMD'] as const;

/**
 * The console that drives the demo.
 *
 * Every control here is labelled TEST CONTROL, and the labelling is not decoration. A judge watching
 * NAV fall needs to know whether the market did that or we did. The product's credibility rests on
 * the numbers being real, which means being loud about the few that are staged.
 *
 * None of these controls has protocol authority. They move test prices, poison a test news feed, and
 * ask the agent to take a step. There is no button here that can freeze a vault, move depositor funds
 * or forgive a slash — those are decided on-chain, by rules, and that is the point.
 */
export function OperatorConsole({
  vaults,
  profiles,
  newsPoisoned,
}: {
  vaults: VaultSummary[];
  profiles: Profile[];
  newsPoisoned: boolean;
}) {
  const [vault, setVault] = useState(vaults[0]?.address ?? '');
  const [profile, setProfile] = useState('good');
  const [shockAsset, setShockAsset] = useState<string>('TSLA');
  const [shockBps, setShockBps] = useState(-2_000);
  const [poisoned, setPoisoned] = useState(newsPoisoned);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const selected = vaults.find((v) => v.address === vault);
  const activeProfile = profiles.find((p) => p.id === profile);

  function append(line: string) {
    setLog((prev) => [`${new Date().toLocaleTimeString('en-US', { hour12: false })}  ${line}`, ...prev].slice(0, 60));
  }

  async function call(label: string, path: string, body: unknown) {
    setBusy(label);
    append(`→ ${label}`);
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, body }),
      });
      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        append(`✕ ${label}: ${String(data.error ?? res.status)}`);
        toast.error(`${label} failed`, { description: String(data.error ?? res.status) });
        return data;
      }

      append(`✓ ${label}: ${summarise(data)}`);
      toast.success(`${label} ran`, { description: summarise(data).slice(0, 110) });
      return data;
    } catch (e) {
      append(`✕ ${label}: ${(e as Error).message}`);
      toast.error(`${label} failed`);
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
      <div className="space-y-5">
        {/* ── agent control ──────────────────────────────────────────── */}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Agent control</h2>
            <TestControlBadge />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Vault">
              <select
                value={vault}
                onChange={(e) => setVault(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-white px-3 py-2 text-[13px]"
              >
                {vaults.length === 0 ? <option value="">no vaults indexed</option> : null}
                {vaults.map((v) => (
                  <option key={v.address} value={v.address}>
                    {v.name}
                  </option>
                ))}
              </select>
              {selected ? (
                <div className="mt-2 flex items-center gap-2">
                  <StateChip state={selected.state} />
                  <span className="font-mono text-[10px] text-[var(--ink-3)]">
                    {selected.staticViolations}/2 violations · {selected.strikes}/3 strikes
                  </span>
                </div>
              ) : null}
            </Field>

            <Field label="Profile">
              <select
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-white px-3 py-2 text-[13px]"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              {activeProfile ? (
                <p className="mt-2 text-[12px] leading-snug text-[var(--ink-3)]">
                  {activeProfile.description}
                </p>
              ) : null}
            </Field>
          </div>

          {activeProfile ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip>{activeProfile.route} route</Chip>
              <Chip tone={activeProfile.preflight ? 'positive' : 'negative'}>
                pre-flight {activeProfile.preflight ? 'on' : 'off'}
              </Chip>
            </div>
          ) : null}

          {activeProfile ? (
            <p className="mt-3 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
              <strong className="font-semibold">Expected:</strong> {activeProfile.expected}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={!vault || busy !== null}
              onClick={() => call('Run 1 step', '/demo/agent/run', { vault, profile, steps: 1 })}
            >
              <Play size={14} /> Run 1 step
            </Button>
            <Button
              variant="secondary"
              disabled={!vault || busy !== null}
              onClick={() => call('Run 3 steps', '/demo/agent/run', { vault, profile, steps: 3 })}
            >
              Run 3 steps
            </Button>
          </div>
        </Card>

        {/* ── scenarios ──────────────────────────────────────────────── */}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Scenarios</h2>
              <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                Each one sets up its own conditions, then asserts what the protocol should do.
              </p>
            </div>
            <TestControlBadge />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                disabled={!vault || busy !== null}
                onClick={() => call(s.label, `/demo/scenario/${s.id}`, { vault })}
                className={cn(
                  'rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
                  'hover:border-[var(--green)] hover:bg-[var(--green-tint)] disabled:opacity-40 disabled:hover:border-[var(--line)] disabled:hover:bg-transparent',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Card>

        {/* ── market + news ──────────────────────────────────────────── */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Market shock</h2>
              <TestControlBadge />
            </div>

            <Field label="Asset" className="mt-4">
              <select
                value={shockAsset}
                onChange={(e) => setShockAsset(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-white px-3 py-2 text-[13px]"
              >
                {SHOCK_ASSETS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={`Move ${(shockBps / 100).toFixed(0)}%`} className="mt-3">
              <input
                type="range"
                min={-3_000}
                max={3_000}
                step={250}
                value={shockBps}
                onChange={(e) => setShockBps(Number(e.target.value))}
                className="w-full accent-[var(--green)]"
              />
            </Field>

            <Button
              variant="secondary"
              className="mt-3 w-full"
              disabled={busy !== null || !selected}
              onClick={() =>
                call('Market shock', '/demo/shock', {
                  chainId: selected?.chainId,
                  asset: shockAsset,
                  bps: shockBps,
                })
              }
            >
              <Zap size={14} /> Apply shock
            </Button>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">News feed</h2>
              <TestControlBadge />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
              The agent reads this feed as a signal. Poisoning it injects an instruction disguised as a
              headline — the realistic version of a prompt-injection attack, since it arrives through a
              source the agent was always going to read.
            </p>
            <Button
              variant={poisoned ? 'danger' : 'secondary'}
              className="mt-4 w-full"
              disabled={busy !== null}
              onClick={async () => {
                const next = !poisoned;
                await call(next ? 'Poison news feed' : 'Clean news feed', '/demo/news/poison', {
                  poisoned: next,
                });
                setPoisoned(next);
              }}
            >
              {poisoned ? 'Feed is poisoned — clean it' : 'Poison the feed'}
            </Button>
          </Card>
        </div>

        <Button
          variant="tertiary"
          disabled={busy !== null}
          onClick={() => call('Reset indexed state', '/demo/reset', {})}
        >
          <RotateCcw size={13} /> Reset indexed state
        </Button>
      </div>

      {/* ── log ────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-sm font-semibold">Console</h2>
        </div>
        <pre className="h-[560px] overflow-auto bg-[var(--black)] p-4 font-mono text-[11px] leading-relaxed text-[var(--on-black-2)]">
          {log.length === 0 ? 'ready — pick a vault and run a scenario' : log.join('\n')}
        </pre>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** Pulls the interesting line out of whatever the endpoint returned. */
function summarise(data: Record<string, unknown>): string {
  const agent = data.agent as { results?: Array<Record<string, unknown>> } | undefined;
  const results = agent?.results;

  if (Array.isArray(results)) {
    return results
      .map((r) => {
        const bits = [
          String(r.action ?? '?'),
          r.ruleId ? `rule ${r.ruleId}` : undefined,
          r.submitted ? 'submitted' : undefined,
          r.published ? 'published as evidence' : undefined,
        ].filter(Boolean);
        return bits.join(' · ');
      })
      .join('  |  ');
  }

  if (data.txHash) return `tx ${String(data.txHash).slice(0, 18)}…`;
  if (data.note) return String(data.note);
  if (typeof data.poisoned === 'boolean') return `feed poisoned: ${data.poisoned}`;
  return 'ok';
}
