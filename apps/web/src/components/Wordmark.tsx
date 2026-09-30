import { cn } from '@aegis/ui';

/**
 * The mark: a shield whose notch reads as a downward step — the drawdown floor the bond defends.
 *
 * Drawn rather than lettered so it holds at 16px in a browser tab and at 40px in a hero.
 */
export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M12 2 4 5.2v6.1c0 4.7 3.2 8.8 8 10.7 4.8-1.9 8-6 8-10.7V5.2L12 2Z"
        fill="currentColor"
      />
      <path
        d="M8.2 12.4h2.5l1.4-3 1.5 5 1.1-2h1.6"
        stroke="var(--black)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Lowercase wordmark.
 *
 * Lowercase and tightly tracked because the alternative — a capitalised two-word name with a sector
 * suffix — reads like a pitch deck title rather than a product.
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
      <span className="text-[17px] font-medium lowercase tracking-[-0.03em]">aegis</span>
    </span>
  );
}
