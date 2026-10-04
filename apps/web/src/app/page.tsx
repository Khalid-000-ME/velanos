import Link from 'next/link';
import { ArrowRight, Ban, FileSignature, Gavel, ShieldCheck } from 'lucide-react';
import {
  Chip,
  EmptyState,
  Eyebrow,
  HairlineCell,
  HairlineGrid,
  SectionHeading,
  formatAmount,
} from '@velanos/ui';
import { Hero } from '@/components/Hero';
import { VaultCard } from '@/components/VaultCard';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [vaultsRes, agentsRes, incidentsRes] = await Promise.all([
    api.vaults(),
    api.agents(),
    api.incidents(),
  ]);

  const vaults = vaultsRes?.vaults ?? [];
  const agents = agentsRes?.agents ?? [];
  const incidents = (incidentsRes?.incidents ?? []).slice(0, 3);
  const agentById = new Map(agents.map((a) => [`${a.chainId}-${a.agentId}`, a]));

  return (
    <>
      <Hero />
      <Mechanism />

      {/* ── vaults ─────────────────────────────────────────────────────── */}
      <section id="vaults" className="content-width scroll-mt-24 py-24">
        <SectionHeading
          eyebrow="Live vaults"
          index="02"
          title="Capital under mandate"
          sub="Each vault pairs one agent with one immutable set of rules and one bond. Open any of them to see every intent the agent has signed."
        />

        {vaults.length === 0 ? (
          <EmptyState
            title="No vaults indexed yet"
            hint="Run pnpm demo:seed to register an agent and create the demo vaults."
          />
        ) : (
          <HairlineGrid columns={3}>
            {vaults.map((v) => (
              <HairlineCell key={`${v.chainId}-${v.address}`}>
                <VaultCard vault={v} agent={agentById.get(`${v.chainId}-${v.agentId}`)} />
              </HairlineCell>
            ))}
          </HairlineGrid>
        )}
      </section>

      {/* ── incidents ──────────────────────────────────────────────────── */}
      {incidents.length > 0 ? (
        <section className="band-dark">
          <div className="content-width py-24">
            <SectionHeading
              eyebrow="Incident record"
              index="03"
              onBlack
              title="Every failure, replayable"
              sub="Each incident reconstructs the full causal chain — what the agent was shown, what it proposed, what it signed, what the guard decided, and where the money went."
              action={
                <Link
                  href="/watch"
                  className="inline-flex items-center gap-2 text-[14px] text-[var(--on-black-2)] transition-colors hover:text-white"
                >
                  Public evidence <ArrowRight size={14} />
                </Link>
              }
            />

            <HairlineGrid columns={3} dark>
              {incidents.map((incident) => (
                <HairlineCell key={incident.id} dark>
                <Link
                  href={`/incidents/${incident.id}`}
                  className="group block h-full p-6 transition-colors hover:bg-[var(--black-2)]"
                >
                  <div className="flex items-center gap-2">
                    <Chip
                      tone={incident.category === 'drawdown' ? 'warn' : 'negative'}
                      className="!border-transparent"
                    >
                      {incident.category.replace('_', ' ')}
                    </Chip>
                    {incident.ruleId ? (
                      <span className="font-mono text-[10px] tabular-nums text-[var(--on-black-2)]">
                        RULE {incident.ruleId}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-4 text-[15px] font-medium leading-snug text-[var(--on-black)]">
                    {incident.title}
                  </h3>

                  <p className="mt-6 font-mono text-[11px] uppercase tracking-[var(--track-label)] text-[var(--on-black-2)]">
                    Paid to depositors
                  </p>
                  <p className="mt-1.5 text-[1.5rem] font-medium leading-none tracking-[-0.03em] tabular-nums text-[var(--green-on-black)]">
                    {formatAmount(incident.totalPaidToDepositors, 6, { maxFractionDigits: 2 })}
                  </p>

                  <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--on-black-2)] transition-colors group-hover:text-white">
                    Replay <ArrowRight size={12} />
                  </span>
                </Link>
                </HairlineCell>
              ))}
            </HairlineGrid>
          </div>
        </section>
      ) : null}

      <Covered />
    </>
  );
}

/**
 * Prevent / prove / pay, as three numbered panels.
 *
 * The middle one is the argument the product actually rests on, so it gets the accent: a blocked
 * trade and a slashable offence are different events, and separating them is what buys both
 * properties at once.
 */
function Mechanism() {
  const steps = [
    {
      icon: ShieldCheck,
      index: '01',
      title: 'Prevent',
      body: 'Every action is an EIP-712 signed intent, checked against an immutable mandate before any funds move. The vault makes no arbitrary calls — it approves an exact amount to an allowlisted venue and nothing else.',
    },
    {
      icon: FileSignature,
      index: '02',
      title: 'Prove',
      body: 'A rule-breaking intent never executes. Its signature is still cryptographic evidence that this key authorised this trade in breach of this mandate — and it stays valid whether or not the trade ever reached the chain.',
      accent: true,
    },
    {
      icon: Gavel,
      index: '03',
      title: 'Pay',
      body: 'That evidence slashes the agent’s bond to depositors in the same transaction. The bond is posted in the asset you deposited, so a payout needs no pricing, no oracle and no claims committee.',
    },
  ];

  return (
    <section className="content-width py-24">
      <SectionHeading
        eyebrow="How it works"
        index="01"
        title="Blocking a trade costs an agent nothing. Paying for it does."
        sub="Policy engines stop bad actions and stop there. The agent has no reason to improve, and the one time your rules have a gap you absorb the loss alone."
      />

      <HairlineGrid columns={3}>
        {steps.map(({ icon: Icon, index, title, body, accent }) => (
          <HairlineCell key={title} accent={accent} className="p-7">
          <div>
            <div className="flex items-center justify-between">
              <Icon size={18} strokeWidth={1.5} className="text-[var(--ink)]" />
              <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">{index}</span>
            </div>
            <h3 className="mt-6 text-[1.25rem] font-medium tracking-[-0.02em]">{title}</h3>
            <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-3)]">{body}</p>
          </div>
          </HairlineCell>
        ))}
      </HairlineGrid>
    </section>
  );
}

/**
 * Covered against not-covered, side by side.
 *
 * Both columns are given the same visual weight on purpose. A loss floor is only worth something if
 * its edges are stated, and burying the exclusions would make the promise less credible, not more.
 */
function Covered() {
  const covered = [
    'Trades outside the mandate',
    'Oversized or over-leveraged orders',
    'Acting after a freeze or after expiry',
    'Losses beyond the drawdown floor, up to bond size',
    'Failure to settle when the term ends',
  ];
  const not = ['Losses within the agreed drawdown limit', 'Strategy underperformance'];

  return (
    <section className="band-subtle border-y border-[var(--line)]">
      <div className="content-width py-24">
        <SectionHeading
          eyebrow="Scope"
          index="04"
          title="What the bond answers for"
          sub="And what it does not. Payouts are capped at the size of the bond, and the fund screen names the unbacked remainder before anyone deposits."
        />

        <HairlineGrid columns={2}>
          <HairlineCell className="p-7">
            <Eyebrow tone="green">Covered</Eyebrow>
            <ul className="mt-5 space-y-3">
              {covered.map((item) => (
                <li key={item} className="flex gap-3 text-[14px] leading-snug text-[var(--ink-2)]">
                  <ShieldCheck
                    size={15}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 text-[var(--green-ink)]"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </HairlineCell>

          <HairlineCell className="p-7">
            <Eyebrow>Not covered</Eyebrow>
            <ul className="mt-5 space-y-3">
              {not.map((item) => (
                <li key={item} className="flex gap-3 text-[14px] leading-snug text-[var(--ink-3)]">
                  <Ban size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--ink-3)]" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-[var(--line)] pt-5 text-[13px] leading-relaxed text-[var(--ink-3)]">
              Ordinary market risk inside the mandate stays with depositors. That is the deal, and
              stating it plainly is what makes the rest of the promise worth anything.
            </p>
          </HairlineCell>
        </HairlineGrid>
      </div>
    </section>
  );
}
