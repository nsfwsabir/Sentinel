import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  env: {
    SENTINEL_API_URL: process.env.SENTINEL_API_URL ?? "http://localhost:3001",
  },
  // Clickjacking + MIME-sniffing baseline. script-src allows Next.js
  // inline runtime chunks ('unsafe-inline' scripts only, no eval);
  // connect-src must cover the API + Laya only via server routes, so
  // same-origin suffices here.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default config;
