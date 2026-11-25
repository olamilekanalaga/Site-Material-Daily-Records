import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  outputFileTracingExcludes: {
    "/*": [
      "./.local-data/**/*",
      "./.env*",
      "./test-results/**/*",
      "./playwright-report/**/*",
    ],
  },
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/demo/:path*", destination: "/", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(), microphone=()",
          },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};
export default nextConfig;
