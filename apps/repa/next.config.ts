import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@pos-tercos/ui', '@pos-tercos/types', '@pos-tercos/domain'],
};

export default nextConfig;
