import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { digitsOnlyFromBrazilianPhoneInput, normalizeBrazilianPhone } from "@/lib/phone";
import { normalizeBotConfig } from "@/lib/bot-config";
import { parseJsonBody } from "@/lib/parse-json-body";
import { isActivationProfessionSlug } from "@/lib/activation-professions";

export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    token?: unknown;
    phone?: unknown;
    profileType?: unknown;
  };

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const raw =
    typeof body.phone === "string" ? digitsOnlyFromBrazilianPhoneInput(body.phone) : "";
  const profileTypeRaw =
    typeof body.profileType === "string" ? body.profileType.trim() : "";

  if (!token || !raw || raw.length < 10) {
    return NextResponse.json(
      { error: "Token e número com DDD (apenas números) são obrigatórios." },
      { status: 400 }
    );
  }
  if (!isActivationProfessionSlug(profileTypeRaw)) {
    return NextResponse.json(
      {
        error:
          "Selecione uma opção de perfil válida (incluindo “Nenhuma profissão”, se for o caso).",
      },
      { status: 400 }
    );
  }

  const phone = normalizeBrazilianPhone(raw);
  const supabase = createAdminClient();

  const { data: row, error: fetchError } = await supabase
    .from("activation_tokens")
    .select("token, used_at")
    .eq("token", token)
    .single();

  if (fetchError || !row) {
    return NextResponse.json(
      { error: "Token inválido ou já utilizado." },
      { status: 400 }
    );
  }
  if (row.used_at) {
    return NextResponse.json(
      { error: "Este token já foi utilizado." },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("activation_tokens")
    .update({
      used_at: new Date().toISOString(),
      used_by_phone: phone,
    })
    .eq("token", token);

  if (updateError) {
    console.error(
      "[activate] error update_token message=" + (updateError?.message || "")
    );
    return NextResponse.json(
      { error: "Erro ao marcar token como usado." },
      { status: 500 }
    );
  }

  const botConfig = normalizeBotConfig({ profileType: profileTypeRaw });

  const { error: insertError } = await supabase
    .from("authorized_whatsapp_numbers")
    .upsert({ phone, bot_config: botConfig }, { onConflict: "phone" });

  if (insertError) {
    console.error(
      "[activate] error insert_authorized message=" + (insertError?.message || "")
    );
    return NextResponse.json(
      { error: "Erro ao registrar número autorizado." },
      { status: 500 }
    );
  }

  console.log("[activate] success phone=" + phone);
  return NextResponse.json({ ok: true });
}
