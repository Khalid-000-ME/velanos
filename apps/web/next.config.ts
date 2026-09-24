import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build step, so Next compiles them.
  transpilePackages: ['@aegis/ui', '@aegis/config', '@aegis/agent-sdk'],
  typedRoutes: true,
  experimental: {
    // Pulls the heavy chain libraries out of the client bundle where a page only reads.
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

export default nextConfig;
