import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const apiUpstream =
  process.env.API_UPSTREAM_URL?.replace(/\/$/, "") ||
  "https://dentist-on-call-api-production.up.railway.app";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      // Same-origin /api/v1 proxy in production; keep localhost for local API.
      "connect-src 'self' https: http://localhost:8000 http://127.0.0.1:8000",
      "form-action 'self'",
    ].join("; "),
  },
];

if (isProd) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });
}

const nextConfig: NextConfig = {
  typedRoutes: false,
  poweredByHeader: false,
  // Browser should call same-origin /api/v1 so auth cookies are first-party.
  // Local/dev can still point at the FastAPI port directly.
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ?? (isProd ? "/api/v1" : "http://localhost:8000/api/v1"),
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUpstream}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
