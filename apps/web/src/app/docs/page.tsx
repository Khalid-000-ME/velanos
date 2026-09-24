import { Card, Chip } from '@aegis/ui';
import { CHAIN_LABELS, api, explorerAddressUrl } from '@/lib/api';
import { ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * The reference page: the rule table, the deployed addresses, and what the protocol does not cover.
 *
 * The rule table is the important half. Every rejection a judge sees in the UI cites a number, and
 * this is where that number becomes a sentence — including which band it belongs to, which is what
 * decides whether the agent pays.
 */
const RULES: Array<{
  id: number;
  code: string;
  title: string;
  band: 'static' | 'stateful' | 'validity';
  slashable: boolean;
  description: string;
}> = [
  { id: 101, code: 'ASSET_NOT_ALLOWED', title: 'Asset not in mandate', band: 'static', slashable: true, description: 'The traded asset, or the asset being spent, is not one this vault may touch.' },
  { id: 102, code: 'ADAPTER_NOT_ALLOWED', title: 'Venue not in mandate', band: 'static', slashable: true, description: 'The intent routes through a venue the vault never approved.' },
  { id: 103, code: 'TRADE_SIZE_EXCEEDED', title: 'Trade larger than the per-trade cap', band: 'static', slashable: true, description: 'A single buy or position open exceeded the mandate maximum. Sells and closes are never capped.' },
  { id: 104, code: 'LEVERAGE_EXCEEDED', title: 'Leverage above the mandate limit', band: 'static', slashable: true, description: 'Requested leverage is above the cap, or any leverage at all on a spot vault.' },
  { id: 105, code: 'OUTSIDE_TERM', title: 'Signed outside the mandate term', band: 'static', slashable: true, description: 'The intent was signed before the mandate started or after it expired.' },
  { id: 106, code: 'SIGNED_WHILE_FROZEN', title: 'Signed after the vault was frozen', band: 'static', slashable: true, description: 'The agent kept signing after trading had already been halted.' },
  { id: 107, code: 'VALIDITY_TOO_LONG', title: 'Validity window too long', band: 'static', slashable: true, description: 'An intent may stay valid for at most 5 minutes. Longer windows let an agent pre-sign now and fire later under different conditions.' },
  { id: 108, code: 'KIND_NOT_ALLOWED', title: 'Wrong instrument for this vault', band: 'static', slashable: true, description: 'A perpetuals order on a spot vault, or the reverse.' },
  { id: 201, code: 'EXPOSURE_EXCEEDED', title: 'Would breach the per-asset cap', band: 'stateful', slashable: false, description: 'After this trade the vault would hold more of one asset than the mandate allows as a share of NAV.' },
  { id: 202, code: 'SLIPPAGE_EXCEEDED', title: 'Price worse than the slippage limit', band: 'stateful', slashable: false, description: 'The venue quote is further from the oracle fair value than the mandate permits.' },
  { id: 203, code: 'DAILY_LOSS_EXCEEDED', title: 'Daily loss budget spent', band: 'stateful', slashable: false, description: 'NAV per share is below the day open by more than the mandate allows, so new risk pauses. Selling stays open.' },
  { id: 204, code: 'DEADLINE_PASSED', title: 'Intent expired before execution', band: 'stateful', slashable: false, description: 'The intent reached the vault after its own deadline.' },
  { id: 205, code: 'INSUFFICIENT_BALANCE', title: 'Not enough balance', band: 'stateful', slashable: false, description: 'The vault does not hold enough of the asset being spent.' },
  { id: 206, code: 'VAULT_NOT_ACTIVE', title: 'Vault is not accepting trades', band: 'stateful', slashable: false, description: 'The vault is awaiting its bond, cooling off, frozen or settled.' },
  { id: 207, code: 'EXECUTION_FAILED', title: 'Venue rejected the order', band: 'stateful', slashable: false, description: 'The trade was permitted but the venue failed to fill it. Not the agent’s fault.' },
  { id: 301, code: 'BAD_SIGNATURE', title: 'Signature does not match the agent key', band: 'validity', slashable: false, description: 'Ignored. The intent cannot be attributed to this agent.' },
  { id: 302, code: 'NONCE_USED', title: 'Nonce already resolved', band: 'validity', slashable: false, description: 'Ignored. Each nonce is executed, rejected or slashed exactly once.' },
  { id: 303, code: 'WRONG_VAULT_OR_CHAIN', title: 'Intent is for a different vault or chain', band: 'validity', slashable: false, description: 'Ignored. The EIP-712 domain binds every signature to one vault on one chain.' },
];

const BAND_COPY = {
  static: {
    title: 'Static rules — slashable',
    explain:
      'These depend only on the intent and the mandate. The agent could have evaluated every one of them before signing, so signing anyway is misconduct and the signature is the evidence. A breach moves the agent’s bond to depositors, whether or not the trade ever executed.',
  },
  stateful: {
    title: 'Stateful rules — never slashable',
    explain:
      'These depend on live vault and market state the agent cannot fully predict. An honest agent trips them. The action is blocked and recorded as a strike; the bond is untouched. Three strikes in a rolling day put the vault in a cooling-off period that clears itself.',
  },
  validity: {
    title: 'Validity rules — ignored',
    explain:
      'The intent is not attributable to the agent at all. Nothing is recorded and nothing is slashed.',
  },
} as const;

export default async function DocsPage() {
  const status = await api.chainStatus();

  return (
    <div className="content-width pt-8">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">How Aegis Prop works</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-[var(--ink-2)]">
        An agent that wants outside capital posts its own capital first. Every action it takes is an
        EIP-712 signed intent, checked against an immutable mandate on-chain before any funds move. A
        rule-breaking intent is never executed — and the agent&rsquo;s signature on it is cryptographic
        proof of misconduct that anyone can verify and that slashes its bond to depositors in the same
        transaction.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { n: 'Prevent', body: 'The mandate is checked before funds move. No arbitrary calls exist.' },
          { n: 'Prove', body: 'A blocked intent still carries a signature. That is the evidence.' },
          { n: 'Pay', body: 'Evidence slashes the bond to depositors, automatically.' },
        ].map((item) => (
          <Card key={item.n} className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--green-ink)]">
              {item.n}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">{item.body}</p>
          </Card>
        ))}
      </div>

      {/* ── rule table ─────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">The rulebook</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--ink-3)]">
          Rules are banded by who is to blame, and the band decides the consequence. This is the single
          most important distinction in the protocol: it is what lets us punish misconduct without
          punishing an agent for volatility.
        </p>

        {(['static', 'stateful', 'validity'] as const).map((band) => (
          <div key={band} className="mt-7">
            <h3 className="text-sm font-semibold">{BAND_COPY[band].title}</h3>
            <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-[var(--ink-3)]">
              {BAND_COPY[band].explain}
            </p>

            <Card className="mt-3 overflow-hidden p-0">
              <table className="w-full text-sm">
                <tbody>
                  {RULES.filter((r) => r.band === band).map((rule) => (
                    <tr key={rule.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="w-14 px-4 py-3 align-top font-mono text-[12px] font-bold text-[var(--ink-3)]">
                        {rule.id}
                      </td>
                      <td className="px-2 py-3 align-top">
                        <p className="text-[13px] font-medium">{rule.title}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-[var(--ink-3)]">{rule.code}</p>
                        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[var(--ink-3)]">
                          {rule.description}
                        </p>
                      </td>
                      <td className="w-28 px-4 py-3 align-top">
                        <Chip tone={rule.slashable ? 'negative' : 'neutral'}>
                          {rule.slashable ? 'Slashable' : 'No slash'}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        ))}
      </section>

      {/* ── deployments ────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Deployed contracts</h2>
        <p className="mt-2 text-sm text-[var(--ink-3)]">
          Read from the deployment files the deploy scripts write. There is no address literal anywhere
          else in the codebase.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {(status?.chains ?? [])
            .filter((c) => c.deployed)
            .map((chain) => (
              <Card key={chain.chainId} className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {CHAIN_LABELS[chain.chainId] ?? chain.chainId}
                  </h3>
                  <Chip>chain {chain.chainId}</Chip>
                </div>
                {chain.mode ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Chip>USDG: {chain.mode.usdg}</Chip>
                    {chain.mode.stocks ? <Chip>stocks: {chain.mode.stocks}</Chip> : null}
                    {chain.mode.perp ? <Chip>perps: {chain.mode.perp}</Chip> : null}
                  </div>
                ) : null}
                <p className="mt-3 font-mono text-[11px] text-[var(--ink-3)]">
                  indexed to block {chain.indexedBlock?.toLocaleString() ?? '—'}
                </p>

                {chain.contracts ? (
                  <dl className="mt-3 space-y-1 border-t border-[var(--line)] pt-3">
                    {Object.entries(chain.contracts).map(([name, address]) => {
                      const url = explorerAddressUrl(chain.chainId, address);
                      return (
                        <div key={name} className="flex items-baseline justify-between gap-3">
                          <dt className="text-[12px] text-[var(--ink-2)]">{name}</dt>
                          <dd className="font-mono text-[11px]">
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[var(--ink-3)] hover:text-[var(--ink)]"
                              >
                                {address.slice(0, 10)}…{address.slice(-6)}
                                <ExternalLink size={9} />
                              </a>
                            ) : (
                              <span className="text-[var(--ink-3)]">
                                {address.slice(0, 10)}…{address.slice(-6)}
                              </span>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}
              </Card>
            ))}
          {(status?.chains ?? []).every((c) => !c.deployed) ? (
            <Card className="p-5">
              <p className="text-sm text-[var(--ink-3)]">
                Nothing deployed yet. Run <code className="font-mono">pnpm contracts:deploy:rh</code>.
              </p>
            </Card>
          ) : null}
        </div>
      </section>

      {/* ── limitations ────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Known limitations</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--ink-3)]">
          Stated plainly, because a loss floor is only worth something if its edges are known.
        </p>
        <Card className="mt-4 p-5">
          <ul className="space-y-2.5 text-[13px] leading-relaxed text-[var(--ink-2)]">
            <li>
              <strong className="font-semibold">Payouts are capped by the bond.</strong> If a drawdown
              is deeper than the bond can cover, depositors keep the remainder of the loss. The fund
              screen shows that unbacked amount before anyone deposits.
            </li>
            <li>
              <strong className="font-semibold">The oracle is a role-gated test oracle.</strong> It
              exists so the drawdown demo is exact and reproducible. Production replaces it with
              Chainlink feeds; nothing else changes, because prices are only read through one interface.
            </li>
            <li>
              <strong className="font-semibold">The venue is not a real DEX.</strong> Fills come from an
              oracle-priced pool with a fixed spread and linear depth impact, so the arithmetic in the
              demo is checkable. Mainnet uses a Uniswap adapter.
            </li>
            <li>
              <strong className="font-semibold">A self-reporting operator can recover the bounty.</strong>{' '}
              Bounties are only paid on the reporting path and the agent and operator addresses are
              excluded, but an operator reporting from an unrelated address it controls keeps that
              share. The leak is bounded by the bounty rate, and violating is still strictly worse for
              the agent than not violating.
            </li>
            <li>
              <strong className="font-semibold">Perp NAV is simplified.</strong> One position per market,
              valued as collateral plus unrealised PnL.
            </li>
            <li>
              <strong className="font-semibold">Not audited.</strong> Testnet only.
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
