import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.qrserver.com",
      },
    ],
  },
  // Allow preview iframe to access dev server resources
  allowedDevOrigins: [
    "preview-chat-8b085902-3657-49bf-bfe6-9a5d473f5836.space-z.ai",
    "https://preview-chat-8b085902-3657-49bf-bfe6-9a5d473f5836.space-z.ai",
  ],
  async headers() {
    return [
      {
        // Allow all _next static assets to be loaded from any origin
        source: "/_next/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
