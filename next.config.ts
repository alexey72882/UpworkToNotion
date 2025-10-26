import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // DO NOT set output: 'export' (static export disables API routes)
};

export default nextConfig;
