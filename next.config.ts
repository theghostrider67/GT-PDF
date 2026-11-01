import "./scripts/prepare-pdf-worker.mjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  ...(process.env.GT_PDF_STATIC_EXPORT === "true" ? { output: "export" as const } : {}),
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      // Let PptxGenJS's browser mappings exclude its optional Node-only imports.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:(fs|https)$/, (resource: { request: string }) => {
          resource.request = resource.request.slice(5);
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
