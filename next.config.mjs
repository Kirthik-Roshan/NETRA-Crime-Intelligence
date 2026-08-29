/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Keep the dev compiler separate from production/export builds. Running
  // both at once otherwise lets them overwrite the same webpack chunks.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

  // Slate serves static/CDN content but drops any response its Node function
  // renders at runtime (proven: a trivial API route returns 200 + empty body,
  // dynamic SSR pages hang → 524). So NETRA ships as a fully static site: every
  // page is prerendered at BUILD time with the demo database baked in, and
  // there is no runtime server for Slate to mishandle.
  output: "export",

  // No Next Image optimizer in a static export.
  images: { unoptimized: true },

  // Emit /dashboard/index.html etc. so a plain static host resolves clean URLs.
  trailingSlash: true,

  // better-sqlite3 is only used at BUILD time (server components + the static
  // data baker read the shipped data/netra.db). Keep it external so the client
  // bundle never tries to include the native module.
  webpack: (config) => {
    config.externals = [...(config.externals || []), "better-sqlite3"];
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
