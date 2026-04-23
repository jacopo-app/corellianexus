import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.swu-db.com' },
      { protocol: 'https', hostname: 'api.swu-db.com' },
      { protocol: 'https', hostname: 'images.swudb.com' },
      { protocol: 'https', hostname: 'karabast-customization.s3.us-east-1.amazonaws.com' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
    ],
  },
};

export default nextConfig;
