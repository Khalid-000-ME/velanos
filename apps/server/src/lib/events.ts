import { EventEmitter } from 'node:events';

export interface VelanosEvent {
  type: string;
  chainId: number;
  vault?: string;
  payload: Record<string, unknown>;
  ts: number;
  txHash?: string;
}

/**
 * In-process fan-out for the SSE endpoints.
 *
 * Deliberately not a queue: the UI wants "what just happened", and a reconnecting client
 * backfills over REST rather than replaying a backlog. A dropped event is a cosmetic problem, so
 * paying for durability here would buy nothing.
 */
class EventBus extends EventEmitter {
  publish(event: VelanosEvent): void {
    this.emit('event', event);
  }

  subscribe(listener: (event: VelanosEvent) => void): () => void {
    this.on('event', listener);
    return () => this.off('event', listener);
  }
}

export const bus = new EventBus();
bus.setMaxListeners(0);

export function emit(
  type: string,
  chainId: number,
  payload: Record<string, unknown>,
  opts: { vault?: string; txHash?: string } = {},
): void {
  bus.publish({
    type,
    chainId,
    payload,
    ts: Math.floor(Date.now() / 1000),
    ...(opts.vault ? { vault: opts.vault } : {}),
    ...(opts.txHash ? { txHash: opts.txHash } : {}),
  });
}

/** bigints are not JSON-serialisable; decimal strings are, and keep full precision. */
export function jsonSafe<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
}
