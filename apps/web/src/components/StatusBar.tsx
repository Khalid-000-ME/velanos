import { api, CHAIN_LABELS } from '@/lib/api';

/**
 * The thin bar under the header: which chains are indexed, how far behind, which services are
 * alive, and which integrations are running against test stand-ins.
 *
 * Permanently visible rather than tucked into a settings page. The product's claim is that every
 * number on screen came from a chain, and this is where that claim is auditable — including the
 * uncomfortable parts, like a mock perp adapter or a lagging indexer.
 */
export async function StatusBar() {
  const status = await api.chainStatus();

  if (!status) {
    return (
      <div className="border-b border-[var(--line)] bg-[var(--bg-subtle)]">
        <div className="content-width flex h-[var(--status-h)] items-center">
          <span className="font-mono text-[11px] text-[var(--loss)]">
            indexer unreachable — start it with pnpm dev
          </span>
        </div>
      </div>
    );
  }

  const deployed = status.chains.filter((c) => c.deployed);
  const watcher = status.services.find((s) => s.service === 'watcher');
  const agent = status.services.find((s) => s.service === 'agent');

  return (
    <div className="border-b border-[var(--line)] bg-[var(--bg-subtle)]">
      <div className="content-width flex h-[var(--status-h)] items-center gap-4 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-[var(--ink-3)]">
        {deployed.length === 0 ? (
          <span className="text-[var(--ink-2)]">no chain deployed yet — run pnpm contracts:deploy:rh</span>
        ) : (
          deployed.map((c) => (
            <span key={c.chainId} className="flex items-center gap-1.5">
              <span className="text-[var(--ink-2)]">{CHAIN_LABELS[c.chainId] ?? c.chainId}</span>
              <span>block {c.head?.toLocaleString() ?? '—'}</span>
              {c.blocksBehind !== null && c.blocksBehind > 5 ? (
                <span className="text-[var(--warn)]">({c.blocksBehind} behind)</span>
              ) : null}
            </span>
          ))
        )}

        <Divider />
        <Service label="Watcher" live={watcher?.live ?? false} />
        <Service label="Agent" live={agent?.live ?? false} />

        <Divider />
        {Object.values(status.modes).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function Divider() {
  return <span className="text-[var(--line-strong)]">·</span>;
}

function Service({ label, live }: { label: string; live: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="size-1.5 rounded-full"
        style={{ background: live ? 'var(--green)' : 'var(--line-strong)' }}
        aria-hidden
      />
      {label} {live ? 'live' : 'offline'}
    </span>
  );
}
