'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { Toaster } from 'sonner';
import { wagmiConfig } from '@/lib/wagmi';

export function Providers({ children }: { children: React.ReactNode }) {
  // Created in state so a re-render never swaps the cache out from under in-flight queries.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain state goes stale the moment a block lands, so nothing is cached by default and
            // the SSE stream drives invalidation instead of a polling interval.
            staleTime: 0,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              borderRadius: 'var(--radius)',
              border: '1px solid var(--line)',
              fontSize: '13px',
            },
          }}
        />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
