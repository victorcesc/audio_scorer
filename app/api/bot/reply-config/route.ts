import { NextRequest, NextResponse } from "next/server";
import { findAuthorizedWhatsappRowForLookup } from "@/lib/bot-authorized-phone";
import { validateBotRequestToken } from "@/lib/bot-auth";
import {
  mergeBotReplyFormat,
  normalizeBotConfig,
  type BotReplyFormat,
  type BotReplyFormatPatch,
} from "@/lib/bot-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parse-json-body";
import { getProfileInsightLabels } from "@/lib/profile-insights";

/**
 * GET ?phone=... — devolve replyFormat efetivo (defaults + bot_config).
 */
export async function GET(request: NextRequest) {
  if (!validateBotRequestToken(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get("phone");
  if (!raw || typeof raw !== "string") {
    return NextResponse.json(
      { error: "Parâmetro 'phone' é obrigatório." },
      { status: 400 }
    );
  }

  const row = await findAuthorizedWhatsappRowForLookup(raw);
  if (!row) {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }

  const replyFormat = normalizeBotConfig(row.bot_config);
  const profileInsightLabels = getProfileInsightLabels(replyFormat.profileType);
  return NextResponse.json({ replyFormat, profileInsightLabels });
}

/**
 * PATCH — body: { phone: string, patch: Partial<BotReplyFormat> }
 */
export async function PATCH(request: NextRequest) {
  if (!validateBotRequestToken(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const phoneRaw = typeof (body as { phone?: unknown }).phone === "string"
    ? (body as { phone: string }).phone.trim()
    : "";
  const patchRaw = (body as { patch?: unknown }).patch;

  if (!phoneRaw) {
    return NextResponse.json(
      { error: "Campo 'phone' é obrigatório." },
      { status: 400 }
    );
  }
  if (patchRaw == null || typeof patchRaw !== "object" || Array.isArray(patchRaw)) {
    return NextResponse.json(
      { error: "Campo 'patch' deve ser um objeto." },
      { status: 400 }
    );
  }

  const row = await findAuthorizedWhatsappRowForLookup(phoneRaw);
  if (!row) {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  }

  const patch = patchRaw as BotReplyFormatPatch;
  const current = normalizeBotConfig(row.bot_config);
  const replyFormat: BotReplyFormat = mergeBotReplyFormat(current, patch);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("authorized_whatsapp_numbers")
    .update({ bot_config: replyFormat })
    .eq("phone", row.phone);

  if (error) {
    console.error("[reply-config] update_error message=" + (error.message || ""));
    return NextResponse.json(
      { error: "Erro ao guardar configuração." },
      { status: 500 }
    );
  }

  const profileInsightLabels = getProfileInsightLabels(replyFormat.profileType);
  return NextResponse.json({ replyFormat, profileInsightLabels });
}
