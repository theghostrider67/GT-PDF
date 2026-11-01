import "./scripts/prepare-pdf-worker.mjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  ...(process.env.GT_PDF_STATIC_EXPORT === "true" ? { output: "export" as const } : {}),
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      // Let PptxGenJS's browser mappings exclude its optional Node-only imports.
      config.plugins.push(
        // Cloud KMS signing is an optional server-only LibPDF feature. The
        // browser toolkit uses only its local password/recovery engine.
        new webpack.IgnorePlugin({ resourceRegExp: /^@google-cloud\/(kms|secret-manager)$/ }),
        new webpack.NormalModuleReplacementPlugin(/^node:(fs|https)$/, (resource: { request: string }) => {
          resource.request = resource.request.slice(5);
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
