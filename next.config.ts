import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return { beforeFiles: [{ source: "/uploads/:filename", destination: "/api/uploads/:filename" }] };
  },
  /* config options here */
  reactStrictMode: false,
};

export default nextConfig;
