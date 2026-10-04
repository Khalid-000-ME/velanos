'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/** A code block with a copy button. The copy is the whole point, so it is never more than one click. */
export function CopyBlock({ code, wrap = false }: { code: string; wrap?: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg)]">
      <pre className={`${wrap ? 'whitespace-pre-wrap' : 'overflow-x-auto'} p-5 pr-14 font-mono text-[13px] leading-relaxed text-[var(--ink)]`}>
        <code>{code}</code>
      </pre>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* clipboard blocked; the text is still selectable */
          }
        }}
        className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
      >
        {copied ? <Check size={14} className="text-[var(--green)]" /> : <Copy size={14} />}
      </button>
    </div>
  );
}
