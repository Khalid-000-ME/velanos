import { EmptyState, SectionHeading } from '@aegis/ui';
import { WatchFeed } from '@/components/WatchFeed';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * The public evidence locker.
 *
 * Every intent listed here was signed by an agent, breaks a static rule, and was never submitted —
 * so no depositor funds were ever at risk from it. The agent is still liable, and anyone holding a
 * wallet can collect for saying so. That separation between prevention and liability is the single
 * idea this screen exists to make concrete.
 */
export default async function WatchPage() {
  const feed = await api.feed();
  const entries = feed?.intents ?? [];

  const unreported = entries.filter((e) => !e.reported);
  const claimed = entries.filter((e) => e.reported);

  return (
    <div className="content-width pt-8">
      <div className="rounded-[var(--radius-lg)] bg-[var(--black)] px-6 py-8 text-[var(--on-black)] sm:px-10">
        <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.02em]">
          A blocked trade is still evidence
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--on-black-2)]">
          These intents were signed by an agent and refused by the relay, so nothing was executed and
          no depositor lost a cent. The signature on each one still proves the agent authorised an
          action its mandate forbids — and reporting it pays.
        </p>
        <p className="mt-4 font-mono text-xs text-[var(--green)]">
          {unreported.length} unclaimed · {claimed.length} already reported
        </p>
      </div>

      <section className="mt-8">
        <SectionHeading
          title="Unclaimed evidence"
          sub="Report one and the bond pays you a share of the penalty."
        />
        {unreported.length === 0 ? (
          <EmptyState
            title="Nothing unclaimed"
            hint="Run the prompt-injection scenario from the operator console to publish a fresh one."
          />
        ) : (
          <WatchFeed entries={unreported} />
        )}
      </section>

      {claimed.length > 0 ? (
        <section className="mt-10">
          <SectionHeading title="Already reported" sub="The bond has paid out on these." />
          <WatchFeed entries={claimed} />
        </section>
      ) : null}
    </div>
  );
}
