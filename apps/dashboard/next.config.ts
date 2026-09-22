import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/web-kit",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
