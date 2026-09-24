'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts a figure up on mount.
 *
 * Purely decorative, and written so the final value is correct even if the animation never runs —
 * a reader with reduced-motion on, or a failed hydration, still sees the real number rather than a
 * zero that never moved.
 */
export function Ticker({
  value,
  durationMs = 900,
  className,
}: {
  value: string;
  durationMs?: number;
  className?: string;
}) {
  const target = Number(value.replace(/,/g, ''));
  const [shown, setShown] = useState(() => (Number.isFinite(target) ? target : 0));
  const started = useRef(false);

  useEffect(() => {
    if (!Number.isFinite(target) || started.current) return;
    started.current = true;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(target);
      return;
    }

    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      // Ease-out: fast at the start, settles into the final digit rather than snapping.
      setShown(target * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  if (!Number.isFinite(target)) return <span className={className}>{value}</span>;

  return (
    <span className={className}>
      {shown.toLocaleString('en-US', { maximumFractionDigits: 0 })}
    </span>
  );
}
