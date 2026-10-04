import { EmptyState, Eyebrow, Metric, MetricCell, MetricStrip, SectionHeading } from '@velanos/ui';
import { WatchFeed } from '@/components/WatchFeed';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Evidence' };

/**
 * The public evidence locker.
 *
 * Every intent listed here was signed by an agent, breaks a static rule, and was never submitted — so
 * no depositor funds were ever at risk from it. The agent is still liable, and anyone with a wallet can
 * collect for saying so. Making that separation concrete is the entire reason this screen exists.
 */
export default async function WatchPage() {
  const feed = await api.feed();
  const entries = feed?.intents ?? [];

  const unreported = entries.filter((e) => !e.reported);
  const claimed = entries.filter((e) => e.reported);

  return (
    <>
      <section className="band-dark relative overflow-hidden">
        <div className="grid-field pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="content-width relative py-20">
          <Eyebrow tone="onBlack">Public evidence</Eyebrow>
          <h1 className="text-h1 mt-5 max-w-2xl text-[var(--on-black)]">
            A blocked trade is still evidence
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-[var(--on-black-2)]">
            These intents were signed by an agent and refused by the relay. Nothing executed and no
            depositor lost a cent — and the signature on each one still proves the agent authorised an
            action its mandate forbids. Reporting it pays.
          </p>

          <MetricStrip className="mt-12" columns={3} onBlack>
            <MetricCell onBlack>
              <Metric
                label="Unclaimed"
                value={String(unreported.length)}
                size="lg"
                onBlack
                tone={unreported.length > 0 ? 'positive' : 'neutral'}
                sub="bounty still available"
              />
            </MetricCell>
            <MetricCell onBlack>
              <Metric
                label="Already reported"
                value={String(claimed.length)}
                size="lg"
                onBlack
                sub="bond has paid out"
              />
            </MetricCell>
            <MetricCell onBlack>
              <Metric
                label="Depositor funds at risk"
                value="0"
                size="lg"
                onBlack
                sub="none of these ever executed"
              />
            </MetricCell>
          </MetricStrip>
        </div>
      </section>

      <section className="content-width py-20">
        <SectionHeading
          eyebrow="Open claims"
          index="01"
          title="Unclaimed evidence"
          sub="Report one and the bond pays you a share of the penalty. The court re-derives the verdict from the signature, so an innocent agent cannot be griefed."
        />
        {unreported.length === 0 ? (
          <EmptyState
            title="Nothing unclaimed"
            hint="Run the prompt-injection scenario from the console to publish a fresh one."
          />
        ) : (
          <WatchFeed entries={unreported} />
        )}
      </section>

      {claimed.length > 0 ? (
        <section className="content-width pb-20">
          <SectionHeading
            eyebrow="Settled"
            index="02"
            title="Already reported"
            sub="The bond has paid out on each of these."
          />
          <WatchFeed entries={claimed} />
        </section>
      ) : null}
    </>
  );
}
