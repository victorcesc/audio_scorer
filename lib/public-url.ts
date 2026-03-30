import type { NextRequest } from "next/server";

function stripTrailingSlash(s: string): string {
  return s.replace(/\/$/, "");
}

/**
 * Base URL pública só de variáveis de ambiente (ex.: token de ativação chamado pelo bot, sem Host do browser).
 */
export function getPublicBaseUrlFromEnv(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);
  if (process.env.VERCEL_URL) {
    const host = process.env.VERCEL_URL.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }
  return "http://localhost:3000";
}

/**
 * Origin para redirects e URLs absolutas (logout, Stripe).
 * Ordem: NEXT_PUBLIC_APP_URL → proxy (x-forwarded-*) → VERCEL_URL → URL da requisição.
 */
export function getPublicOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protoHeader = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto =
      protoHeader === "http" || protoHeader === "https"
        ? protoHeader
        : request.nextUrl.protocol === "https:"
          ? "https"
          : "http";
    return `${proto}://${forwardedHost}`;
  }

  if (process.env.VERCEL_URL) {
    const host = process.env.VERCEL_URL.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }

  return request.nextUrl.origin;
}
