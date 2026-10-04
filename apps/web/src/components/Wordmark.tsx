import { cn } from '@velanos/ui';

/**
 * The Velanos mark: a tapered stroke and a slanted bar that together read as a V.
 *
 * Traced from the master artwork and checked against it pixel-for-pixel (99.2% overlap at 1448px),
 * so the vector and the raster app icons are the same shape. The paths keep the master's coordinate
 * space; the viewBox crops to the mark with a little breathing room.
 */
const LEFT = 'M494 434L676 430.5Q726 429.5 715 478.3L603.3 973.1Q601.6 981 593.5 981L593.5 981Q585.5 981 583.4 973.2L453.9 487.2Q440 435 494 434Z';
const RIGHT = 'M809 433L976 433Q1002 433 996.8 458.5L890.6 974.5Q886 997 863 997L700 997Q671 997 676.8 968.6L782.6 454.5Q787 433 809 433Z';

export const BRAND = {
  lime: '#75FB65',
  deep: '#0C2104',
} as const;

export function Mark({
  size = 24,
  className,
  color = 'currentColor',
}: {
  size?: number;
  className?: string;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="436 427 572 572"
      fill={color}
      className={className}
      aria-hidden
    >
      <path d={LEFT} />
      <path d={RIGHT} />
    </svg>
  );
}

/** The mark on its deep-green tile — the app icon, used wherever the mark needs its own ground. */
export function MarkTile({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: BRAND.deep,
        boxShadow: 'inset 0 0 0 1px rgba(117,251,101,0.18)',
      }}
    >
      <Mark size={size * 0.46} color={BRAND.lime} />
    </span>
  );
}

export function Wordmark({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <MarkTile size={size} />
      <span className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--ink)]">Velanos</span>
    </span>
  );
}
