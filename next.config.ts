import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Configure external packages
  serverExternalPackages: [],
  // Configure body size limits
  async rewrites() {
    return []
  },
  // Add custom headers for API routes
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; img-src 'self' data: blob:;"
          }
        ]
      }
    ]
  }
};

export default nextConfig;
