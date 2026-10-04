import { cn } from '@velanos/ui';

/**
 * The mark: a V whose descent is cut flat by a floor line.
 *
 * It reads as the initial, and it is also the product in one glyph — a drawdown that stops at a
 * floor instead of running to a point. Drawn as strokes on a filled tile so it holds at favicon size
 * and at hero size without a separate small-size variant.
 */
export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <path
        d="M6.5 6.5 10.6 14.2h2.8L17.5 6.5"
        stroke="var(--black)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5.5 17.6h13" stroke="var(--black)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Lowercase wordmark, tightly tracked. A capitalised name with a sector suffix reads like a pitch
 * deck title; lowercase reads like a product.
 */
export function Wordmark({
  className,
  markClassName,
  size = 22,
}: {
  className?: string;
  markClassName?: string;
  size?: number;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Mark size={size} className={cn('text-[var(--green)]', markClassName)} />
      <span className="text-[17px] font-medium lowercase tracking-[-0.03em]">velanos</span>
    </span>
  );
}
