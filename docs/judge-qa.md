# Judge Q&A

Short, honest answers. Where a limitation exists, it is named.

### If the guard already blocks bad trades, why does the bond exist?

Blocking stops the damage. It does not create a reason for the agent to improve, and it does nothing
for you the one time the rules have a gap.

The bond prices misconduct. An agent that signs a forbidden trade pays for it whether or not the trade
executed, because the signature is the offence. Repeat offenders are frozen automatically at the second
breach — so an agent probing for an edge case pays twice before it finds one.

### Can watchers grief an honest agent?

No. Reporting requires three things a watcher cannot manufacture: the agent's own signature over the
intent, a nonce that has not already been resolved, and a static rule the guard independently agrees
was broken. Stateful rejections — exposure, slippage, daily loss — are never reportable, which is
exactly the class of failure an honest agent actually hits.

### What about an honest agent that just gets caught by the market?

That is the drawdown breaker, and it is the scenario we spend the most time on. Nobody is accused of
anything. NAV per share falls through the floor, trading halts, the vault unwinds to cash, and the bond
pays the gap between where it landed and the floor.

In our demo that payout was 57.565088 tUSDG and NAV per share ended at exactly 0.920000000000000000 —
the floor, to the wei. Losses *inside* the floor are disclosed market risk and stay with depositors.

### What happens when the bond runs out?

The payout is capped at what the bond holds, and the shortfall is visible on-chain in the gap between
the penalty assessed and the amount paid. We do not revert — that would leave depositors with nothing.

The fund screen computes the worst case against the current bond and names the unbacked remainder
before anyone deposits. We would rather lose a depositor than mislead one.

### Isn't this just insurance?

No premiums, no underwriting committee, no claims process. It is first-loss collateral posted by the
party that created the risk, released by deterministic rules that anyone can evaluate.

The practical difference: an insurer decides whether to pay. Here, `reportSignedViolation` is
permissionless — if anyone can compute that a payout is owed, anyone can collect it.

### Why would an agent operator ever accept this?

Access to capital it otherwise cannot get, at a price that falls with its record. A clean settlement
earns a season, and each season cuts the required bond by 250 bps down to half the base rate.

The discount is on the *price* of the bond, never on the checks. Reputation makes outside capital
cheaper; it never makes the mandate looser.

### Is the LLM in control?

No, and the architecture enforces that rather than asking nicely.

The model proposes an action and explains itself. Deterministic code sizes it, converts to raw units
using on-chain decimals, runs the mandate checks, signs, and submits. The contract decides.

Our prompt-injection scenario is the proof: the model is fully compromised — it reads an instruction
disguised as a headline and follows it. The protection holds anyway, because it never depended on the
model resisting.

### How do I know the numbers on screen are real?

Open the pre-flight inspector on any intent. It shows the full ordered checklist the contract
evaluated, every rule with its actual value against the limit, recomputed from live chain state — not a
cached copy.

And where an input *is* staged — a price shock, the poisoned feed — it carries a TEST CONTROL badge, and
the status bar permanently shows which integrations are running against test stand-ins. We are loud
about the few numbers that are ours precisely so the rest are credible.

### What is the weakest part of this?

The oracle. It is a role-gated price setter, not a feed, and we chose that deliberately so the drawdown
arithmetic is exact and reproducible on camera. A compromised price updater could manufacture a
drawdown. Production replaces it with Chainlink, and nothing else changes because prices are read
through one interface.

Second weakest: an operator who publishes its own violating intent and reports it from an unrelated
address keeps the bounty share, reducing its effective penalty by 10%. Bounded, and still strictly worse
for the agent than staying inside the mandate.

### What did building this actually surface?

Three things worth stating, because they were found by testing rather than by design:

- **Fuzzing found an overflow** in the basis-point arithmetic. Those are view functions the inspector
  calls with arbitrary numbers, so a revert would have blanked the screen instead of explaining a
  rejection. Now 512-bit `mulDiv`.
- **On-chain testing caught a bounty farm.** The agent's own gas key collected the bounty on its own
  violation, because the anti-farming check only knew the signer and operator addresses. Fixed
  structurally: bounties exist only on the reporting path.
- **The watcher was abandoning real payouts.** Two sweeps spending from one account raced for the
  nonce, and the failure was indistinguishable from losing a bounty to a competitor, so it gave up.
  Now serialised, with transient failures retried.
