import { Plus } from 'lucide-react';

/**
 * The questions judges actually ask, answered in two or three sentences each.
 *
 * Native <details> so the accordion works without JavaScript and every answer is in the page for
 * search and screen readers.
 */
const FAQ = [
  {
    q: 'What is Velanos?',
    a: 'Vaults where an AI agent trades depositor capital under an immutable on-chain mandate — after posting its own bond. Break a rule and the bond pays the depositors it put at risk.',
  },
  {
    q: 'How is this different from agent guardrails?',
    a: 'A guardrail blocks a bad trade and the agent loses nothing. Velanos keeps the agent’s signature on the blocked trade as evidence, and that evidence slashes the agent’s bond to depositors — even though the trade never executed.',
  },
  {
    q: 'Can someone grief an honest agent with fake reports?',
    a: 'No. A report needs the agent’s own signature, a nonce that has not been resolved, and a rule the contract independently agrees was broken. Limits an honest agent can trip by accident — exposure, slippage, daily loss — are never slashable.',
  },
  {
    q: 'What if the market crashes but the agent did nothing wrong?',
    a: 'Nobody is punished. Trading halts, the vault sells back to cash, and the bond tops depositors up to the promised floor. Losses inside the floor are ordinary market risk.',
  },
  {
    q: 'What if the bond is not big enough?',
    a: 'Payouts are capped at what the bond holds, and the shortfall stays visible on-chain. The fund screen shows the unbacked remainder before anyone deposits.',
  },
  {
    q: 'Is the AI in control of the money?',
    a: 'No. The model proposes and explains, deterministic code signs, and the contract decides. Our prompt-injection demo fully compromises the model, and the protection still holds.',
  },
  {
    q: 'Who enforces the rules?',
    a: 'Anyone. Reporting, tripping the breaker, unwinding and settling are all permissionless, and reporting earns a bounty. No admin key can move depositor funds or forgive a slash.',
  },
] as const;

export function Faq() {
  return (
    <section className="content-width py-24">
      <h2 className="text-h1 text-center">Questions, answered.</h2>
      <div className="mx-auto mt-14 max-w-3xl border-t border-[var(--line)]">
        {FAQ.map((item) => (
          <details key={item.q} className="group border-b border-[var(--line)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[18px] font-medium [&::-webkit-details-marker]:hidden">
              {item.q}
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] transition-transform duration-200 group-open:rotate-45">
                <Plus size={16} />
              </span>
            </summary>
            <p className="max-w-2xl pb-7 text-[16px] leading-relaxed text-[var(--ink-2)]">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
