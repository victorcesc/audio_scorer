import type { NextRequest } from "next/server";

/**
 * Valida o token do bot nas rotas /api/bot/*.
 * Headers: `x-bot-token` ou `Authorization: Bearer <token>`.
 */
export function validateBotRequestToken(request: NextRequest): boolean {
  const expected = process.env.AUDIO_SCORER_BOT_TOKEN;
  if (!expected) return false;
  const header =
    request.headers.get("x-bot-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return header.length > 0 && header === expected;
}
