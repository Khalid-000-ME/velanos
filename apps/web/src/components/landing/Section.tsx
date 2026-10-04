import type { ReactNode } from 'react';
import { cn } from '@velanos/ui';

/** Centered section heading, the repeating rhythm of the landing page. */
export function CenteredHeading({
  title,
  sub,
  className,
}: {
  title: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto max-w-3xl text-center', className)}>
      <h2 className="text-h1">{title}</h2>
      {sub ? <p className="mt-5 text-[17px] leading-relaxed text-[var(--ink-2)]">{sub}</p> : null}
    </div>
  );
}
