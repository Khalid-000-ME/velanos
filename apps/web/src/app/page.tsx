import Link from 'next/link';
import { ArrowRight, Coins, FileCheck2, Gavel, Wallet } from 'lucide-react';
import { EmptyState, SectionHeading } from '@aegis/ui';
import { AgentCard } from '@/components/AgentCard';
import { Hero } from '@/components/Hero';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function DiscoverPage() {
  const [agentsRes, incidentsRes] = await Promise.all([api.agents(), api.incidents()]);
  const agents = agentsRes?.agents ?? [];
  const incidents = (incidentsRes?.incidents ?? []).slice(0, 3);

  return (
    <>
      <Hero />
      <HowItWorks />

      <section id="agents" className="content-width mt-16">
        <SectionHeading
          title="Agents"
          sub="Each one has posted its own capital against the vaults it manages."
        />

        {agents.length === 0 ? (
          <EmptyState
            title="No agents indexed yet"
            hint="Run pnpm demo:seed to register Delta and create the demo vaults."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={`${agent.chainId}-${agent.agentId}`} agent={agent} />
            ))}
          </div>
        )}
      </section>

      {incidents.length > 0 ? (
        <section className="content-width mt-16">
          <SectionHeading
            title="Recent incidents"
            sub="Every one of these is a replay you can step through, with the transactions behind it."
            action={
              <Link
                href="/watch"
                className="inline-flex items-center gap-1.5 text-sm font-medium underline decoration-[var(--green)] decoration-2 underline-offset-4"
              >
                Watch feed <ArrowRight size={14} />
              </Link>
            }
          />
          <div className="grid gap-4 sm:grid-cols-3">
            {incidents.map((incident) => (
              <Link
                key={incident.id}
                href={`/incidents/${incident.id}`}
                className="group rounded-[var(--radius)] bg-[var(--black)] p-5 text-[var(--on-black)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--green)]">
                  {incident.category.replace('_', ' ')}
                </p>
                <h3 className="mt-2 text-[15px] font-semibold leading-snug">{incident.title}</h3>
                <p className="mt-4 font-mono text-xs text-[var(--on-black-2)]">
                  {incident.stepCount} steps · replay →
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/**
 * Four steps, in the order the money moves.
 *
 * Deposit comes first and slash comes last on purpose: the sequence is the explanation. A reader who
 * only takes in these four phrases should still come away with the mechanism.
 */
function HowItWorks() {
  const steps = [
    {
      icon: Wallet,
      title: 'You deposit',
      body: 'Funds sit in an ERC-4626 vault. The agent can never withdraw them — only trade inside its mandate.',
    },
    {
      icon: Coins,
      title: 'The agent bonds',
      body: 'Before trading opens, the operator stakes the agent’s own capital in the same asset you deposited.',
    },
    {
      icon: FileCheck2,
      title: 'Every intent is checked',
      body: 'Each action is a signed intent, verified against the immutable mandate on-chain before any funds move.',
    },
    {
      icon: Gavel,
      title: 'Misconduct is paid for',
      body: 'A rule-breaking signature is evidence. It slashes the bond to you in the same transaction.',
    },
  ];

  return (
    <section className="content-width mt-14">
      <div className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <div key={title} className="bg-white p-5">
            <div className="flex items-center gap-2.5">
              <Icon size={18} strokeWidth={1.5} />
              <span className="font-mono text-[11px] text-[var(--ink-3)]">0{i + 1}</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold">{title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-3)]">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
