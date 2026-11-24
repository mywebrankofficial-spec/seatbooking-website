import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets tests build/serve from a separate folder without touching a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Hide the floating Next.js "N" dev badge; it sits on top of the bottom bar.
  devIndicators: false,
};

export default nextConfig;
