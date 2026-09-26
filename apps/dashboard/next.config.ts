import type { NextConfig } from "next";

const config: NextConfig = {
  env: {
    SENTINEL_API_URL: process.env.SENTINEL_API_URL ?? "http://localhost:3001",
  },
};

export default config;
