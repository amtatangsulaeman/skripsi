import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["mammoth", "unpdf", "@prisma/client"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages can never be framed by other sites; private PDFs may be previewed in a same-origin iframe.
      { source: "/((?!api/documents/[^/]+/file).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/api/documents/:id/file", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default nextConfig;
