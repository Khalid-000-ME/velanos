import { api, CHAIN_SHORT } from '@/lib/api';

/**
 * System status strip: which chains are indexed, how far behind, which services are alive, and which
 * integrations are running against test stand-ins.
 *
 * Permanently visible rather than tucked into a settings page. The product's claim is that every
 * number on screen came from a chain, and this is where that claim is auditable — including the
 * uncomfortable parts, like a mock perp adapter or a lagging indexer.
 */
export async function StatusBar() {
  const status = await api.chainStatus();

  if (!status) {
    return (
      <Bar>
        <span className="text-[var(--loss)]">Indexer unreachable — start it with pnpm dev</span>
      </Bar>
    );
  }

  const deployed = status.chains.filter((c) => c.deployed);
  const watcher = status.services.find((s) => s.service === 'watcher');
  const agent = status.services.find((s) => s.service === 'agent');

  return (
    <Bar>
      {deployed.length === 0 ? (
        <span className="text-[var(--ink-2)]">
          No chain deployed — run pnpm contracts:deploy:rh
        </span>
      ) : (
        deployed.map((c) => (
          <span key={c.chainId} className="flex items-center gap-1.5">
            <span className="text-[var(--ink-2)]">{CHAIN_SHORT[c.chainId] ?? c.chainId}</span>
            <span className="tabular-nums">{c.head?.toLocaleString() ?? '—'}</span>
            {c.blocksBehind !== null && c.blocksBehind > 5 ? (
              <span className="text-[var(--warn)]">+{c.blocksBehind}</span>
            ) : null}
          </span>
        ))
      )}

      <Dot />
      <Service label="Watcher" live={watcher?.live ?? false} />
      <Service label="Agent" live={agent?.live ?? false} />

      <Dot />
      {Object.values(status.modes).map((label) => (
        <span key={label}>{label}</span>
      ))}
    </Bar>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--line)] bg-[var(--bg-subtle)]">
      <div className="content-width flex h-[var(--status-h)] items-center gap-4 overflow-x-auto whitespace-nowrap font-mono text-[11px] tracking-[0.02em] text-[var(--ink-3)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

function Dot() {
  return <span className="text-[var(--line-strong)]">/</span>;
}

function Service({ label, live }: { label: string; live: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="size-1.5 rounded-full"
        style={{ background: live ? 'var(--green)' : 'var(--line-strong)' }}
        aria-hidden
      />
      {label}
    </span>
  );
}
