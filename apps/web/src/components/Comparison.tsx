import { Check, Minus } from 'lucide-react';

/**
 * Velanos against the shape almost every agent-safety project takes.
 *
 * Written as situations rather than features, because the difference only shows up when something
 * goes wrong: a forbidden trade, an honest mistake, a market drop, an agent that goes silent. A
 * feature list would let both columns say "risk controls" and look identical.
 */
const ROWS: Array<{ situation: string; typical: string; velanos: string }> = [
  {
    situation: 'The agent tries a forbidden trade',
    typical: 'Blocked. Nothing else happens.',
    velanos: 'Blocked — and its signature on that trade slashes its own bond to depositors.',
  },
  {
    situation: 'Whose money is at risk first',
    typical: 'Depositors’, entirely.',
    velanos: 'The agent’s. It posts a bond before a single deposit is accepted.',
  },
  {
    situation: 'An honest mistake — a limit hit because prices moved',
    typical: 'Treated the same as misconduct, or not distinguished at all.',
    velanos: 'Rejected with no penalty. Misconduct and bad luck are separate rule bands.',
  },
  {
    situation: 'The market falls past what depositors were promised',
    typical: 'Depositors absorb it.',
    velanos: 'Trading halts and the bond tops depositors back up to the floor — exactly.',
  },
  {
    situation: 'Who enforces the rules',
    typical: 'The operator’s own server.',
    velanos: 'Anyone. Every enforcement call is permissionless and reporting pays a bounty.',
  },
  {
    situation: 'What counts as proof',
    typical: 'Logs on the operator’s machine.',
    velanos: 'Signed intents and on-chain events that anyone can re-verify.',
  },
  {
    situation: 'The agent stops responding at the end of its term',
    typical: 'Funds sit in open positions until someone intervenes.',
    velanos: 'Anyone can force settlement, and a late penalty comes out of the bond.',
  },
];

export function Comparison() {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)] bg-white">
      <table className="w-full min-w-[720px] text-left">
        <thead>
          <tr className="border-b border-[var(--line)]">
            <th className="w-[30%] px-6 py-4 font-mono text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
              When
            </th>
            <th className="w-[30%] px-6 py-4 font-mono text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--ink-3)]">
              Typical agent guardrail
            </th>
            <th className="bg-[var(--green-tint)] px-6 py-4 font-mono text-[11px] font-medium uppercase tracking-[var(--track-label)] text-[var(--green-ink)]">
              Velanos
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.situation} className="border-b border-[var(--line)] last:border-0 align-top">
              <td className="px-6 py-4 text-[14px] font-medium leading-snug text-[var(--ink)]">
                {row.situation}
              </td>
              <td className="px-6 py-4 text-[14px] leading-snug text-[var(--ink-3)]">
                <span className="flex gap-2.5">
                  <Minus size={14} className="mt-[3px] shrink-0 text-[var(--ink-3)]" strokeWidth={2} />
                  {row.typical}
                </span>
              </td>
              <td className="bg-[var(--green-tint)]/40 px-6 py-4 text-[14px] leading-snug text-[var(--ink-2)]">
                <span className="flex gap-2.5">
                  <Check size={14} className="mt-[3px] shrink-0 text-[var(--green-ink)]" strokeWidth={2.25} />
                  {row.velanos}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
