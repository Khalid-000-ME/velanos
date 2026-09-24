'use client';

import { Button } from '@aegis/ui';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="content-width py-20">
      <h1 className="text-2xl font-semibold">Something broke on this screen</h1>
      <p className="mt-2 max-w-xl text-sm text-[var(--ink-3)]">
        Nothing on-chain was affected — this app only reads. If the indexer is still starting up,
        give it a few seconds and try again.
      </p>
      <pre className="mt-6 max-w-2xl overflow-x-auto rounded-[var(--radius)] bg-[var(--bg-subtle)] p-4 font-mono text-xs text-[var(--ink-2)]">
        {error.message}
      </pre>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
