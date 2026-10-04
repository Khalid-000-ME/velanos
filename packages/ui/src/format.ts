import { formatUnits } from 'viem';

/**
 * Formatting helpers.
 *
 * Every amount crossing into the UI is a bigint in a token's own decimals, and it stays that way
 * until the moment it is rendered. Converting to a float earlier would round a slash.
 */

/** Token amount with a thousands separator and a sensible number of decimals. */
export function formatAmount(
  raw: bigint | string | null | undefined,
  decimals: number,
  opts: { maxFractionDigits?: number; symbol?: string } = {},
): string {
  // A row the indexer has created but not yet enriched has empty amounts. BigInt() throws on those,
  // and a throw inside a server component takes the whole page down with an opaque 500, so a missing
  // amount renders as a dash instead.
  if (raw === null || raw === undefined || raw === '') return opts.symbol ? `— ${opts.symbol}` : '—';
  const value = formatUnits(BigInt(raw), decimals);
  const max = opts.maxFractionDigits ?? (decimals >= 6 ? 2 : 4);
  const n = Number(value);

  const body = Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: max })
    : value;

  return opts.symbol ? `${body} ${opts.symbol}` : body;
}

/** A WAD-scaled share price, e.g. 920000000000000000n → "0.9200". */
export function formatWad(raw: bigint | string, digits = 4): string {
  const n = Number(formatUnits(BigInt(raw), 18));
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2)}%`;
}

/** Signed percentage change between two WAD values, for a NAV delta. */
export function formatWadDelta(from: bigint | string, to: bigint | string): string {
  const a = Number(formatUnits(BigInt(from), 18));
  const b = Number(formatUnits(BigInt(to), 18));
  if (a === 0) return '—';
  const pct = ((b - a) / a) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

export function shortAddress(address: string, chars = 4): string {
  if (address.length < 2 * chars + 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…`;
}

/** "3m 12s" style countdown. Returns null once the deadline has passed. */
export function countdown(toUnixSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  const left = toUnixSeconds - nowSeconds;
  if (left <= 0) return null;

  const d = Math.floor(left / 86_400);
  const h = Math.floor((left % 86_400) / 3_600);
  const m = Math.floor((left % 3_600) / 60);
  const s = left % 60;

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function relativeTime(unixSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const diff = Math.max(0, nowSeconds - unixSeconds);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3_600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3_600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

export function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
