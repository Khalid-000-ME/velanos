/**
 * Serialises every transaction the watcher sends.
 *
 * The watcher runs two independent sweeps — the feed loop hunting bounties and the lifecycle loop
 * doing housekeeping — and both spend from the same EOA. Sending concurrently makes them race for
 * the same account nonce, and the loser fails with "nonce lower than the current nonce of the
 * account". That failure looks exactly like losing a bounty to another reporter, which is how a
 * local plumbing bug ends up being mistaken for normal competition.
 *
 * One queue, one in-flight transaction, no races.
 */
export class TxQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    // Keep the chain alive after a rejection, but don't swallow it from the caller.
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

/**
 * True when a failure means the work is genuinely finished — someone else got there first, or the
 * court disagrees that a rule was broken.
 *
 * Everything else (a nonce race, an RPC hiccup, a reorg) is transient and must be retried, or the
 * watcher silently abandons a payout it was entitled to.
 */
export function isTerminalFailure(e: unknown): boolean {
  const msg = ((e as Error)?.message ?? String(e)).toLowerCase();
  return (
    msg.includes('noncealreadyresolved') ||
    msg.includes('notaviolation') ||
    msg.includes('wrongsigner') ||
    msg.includes('alreadycompensated') ||
    msg.includes('unknownvault')
  );
}
