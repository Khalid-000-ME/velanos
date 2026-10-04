import { EmptyState, Eyebrow } from '@velanos/ui';
import { OperatorConsole } from '@/components/OperatorConsole';
import { api, serverUrl } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** The agent service publishes its own profile list, so the console never duplicates the definitions. */
async function agentProfiles() {
  try {
    const res = await fetch(`${serverUrl.replace('4000', '4100')}/status`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      profiles: Array<{
        id: string;
        label: string;
        description: string;
        route: string;
        preflight: boolean;
        expected: string;
      }>;
    };
    return data.profiles ?? [];
  } catch {
    return [];
  }
}

export default async function OperatorPage() {
  const [vaultsRes, profiles, news] = await Promise.all([api.vaults(), agentProfiles(), api.news()]);
  const vaults = vaultsRes?.vaults ?? [];

  return (
    <div className="content-width py-10">
      <Eyebrow>Console</Eyebrow>
      <h1 className="text-h1 mt-3">Operator console</h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--ink-3)]">
        Drives the agent, the test oracle and the news feed. Every control here is a test control and
        is labelled as one — none of them has any authority over a vault. Freezing, slashing and
        settling are decided on-chain by rules, which is exactly the claim the demo is making.
      </p>

      <div className="mt-10">
        {vaults.length === 0 ? (
          <EmptyState
            title="No vaults indexed"
            hint="Run pnpm demo:seed, then start the indexer with pnpm dev."
          />
        ) : profiles.length === 0 ? (
          <EmptyState
            title="The agent service is not reachable"
            hint="Start it with pnpm dev — the console reads its profile list from the agent itself."
          />
        ) : (
          <OperatorConsole
            vaults={vaults}
            profiles={profiles}
            newsPoisoned={news?.poisoned ?? false}
          />
        )}
      </div>
    </div>
  );
}
