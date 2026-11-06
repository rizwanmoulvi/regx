import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@regx/shared"],
  webpack: (config) => {
    // optional deps of wallet libraries that we never load
    config.externals.push("pino-pretty", "lokijs", "encoding")
    return config
  },
}

export default nextConfig
