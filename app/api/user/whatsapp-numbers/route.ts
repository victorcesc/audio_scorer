import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAuthorizedWhatsappOwnershipByRawPhone } from "@/lib/bot-authorized-phone";
import {
  digitsOnlyFromBrazilianPhoneInput,
  normalizeBrazilianPhone,
  validateBrazilianPhone,
} from "@/lib/phone";
import { normalizeBotConfig } from "@/lib/bot-config";
import { parseJsonBody } from "@/lib/parse-json-body";
import { isActivationProfessionSlug } from "@/lib/activation-professions";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  }

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const profileTypeRaw =
    typeof (body as { profileType?: unknown })?.profileType === "string"
      ? (body as { profileType: string }).profileType.trim()
      : "";
  if (!isActivationProfessionSlug(profileTypeRaw)) {
    return NextResponse.json(
      {
        error:
          "Selecione uma opção de perfil válida (incluindo “Nenhuma profissão”, se for o caso).",
      },
      { status: 400 }
    );
  }

  const raw =
    typeof (body as { phone?: unknown })?.phone === "string"
      ? digitsOnlyFromBrazilianPhoneInput((body as { phone: string }).phone)
      : "";
  if (!raw || raw.length < 10) {
    return NextResponse.json(
      { error: "Informe o número com DDD (apenas números)." },
      { status: 400 }
    );
  }

  const validation = validateBrazilianPhone(raw);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  let onlyDigits = raw;
  if (onlyDigits.startsWith("55") && onlyDigits.length >= 12) {
    onlyDigits = onlyDigits.slice(2);
  }
  const phone = normalizeBrazilianPhone(onlyDigits);
  const botConfig = normalizeBotConfig({ profileType: profileTypeRaw });

  try {
    const admin = createAdminClient();
    const existing = await findAuthorizedWhatsappOwnershipByRawPhone(onlyDigits);

    if (existing) {
      if (existing.user_id && existing.user_id !== user.id) {
        return NextResponse.json(
          { error: "Este número já está cadastrado em outra conta." },
          { status: 409 }
        );
      }
      if (!existing.user_id) {
        const { error } = await admin
          .from("authorized_whatsapp_numbers")
          .update({ user_id: user.id, bot_config: botConfig })
          .eq("phone", existing.phone);
        if (error) {
          console.error(
            "[user/whatsapp-numbers] claim legacy message=" + (error.message || "")
          );
          return NextResponse.json(
            { error: "Não foi possível vincular este número. Tente novamente." },
            { status: 500 }
          );
        }
      } else {
        const { error } = await admin
          .from("authorized_whatsapp_numbers")
          .update({ bot_config: botConfig })
          .eq("phone", existing.phone)
          .eq("user_id", user.id);
        if (error) {
          console.error(
            "[user/whatsapp-numbers] update message=" + (error.message || "")
          );
          return NextResponse.json(
            { error: "Não foi possível atualizar o número." },
            { status: 500 }
          );
        }
      }
    } else {
      const { error } = await admin.from("authorized_whatsapp_numbers").insert({
        phone,
        user_id: user.id,
        bot_config: botConfig,
      });
      if (error) {
        console.error(
          "[user/whatsapp-numbers] insert message=" + (error.message || "")
        );
        return NextResponse.json(
          { error: "Não foi possível cadastrar o número. Ele pode já estar em uso." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[user/whatsapp-numbers] error message=" + err.message);
    return NextResponse.json(
      { error: "Erro ao processar o cadastro do número." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  }

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const phoneRaw =
    typeof (body as { phone?: unknown })?.phone === "string"
      ? (body as { phone: string }).phone.trim()
      : "";
  if (!phoneRaw) {
    return NextResponse.json({ error: "Informe o número a remover." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: row, error: fetchError } = await admin
      .from("authorized_whatsapp_numbers")
      .select("phone, user_id")
      .eq("phone", phoneRaw)
      .maybeSingle();

    if (fetchError) {
      console.error(
        "[user/whatsapp-numbers] delete fetch message=" + (fetchError.message || "")
      );
      return NextResponse.json({ error: "Não foi possível verificar o número." }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Número não encontrado." }, { status: 404 });
    }
    if (row.user_id !== user.id) {
      return NextResponse.json({ error: "Você não pode remover este número." }, { status: 403 });
    }

    const { error: deleteError } = await admin
      .from("authorized_whatsapp_numbers")
      .delete()
      .eq("phone", phoneRaw)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error(
        "[user/whatsapp-numbers] delete message=" + (deleteError.message || "")
      );
      return NextResponse.json(
        { error: "Não foi possível remover o número. Tente novamente." },
        { status: 500 }
      );
    }

    console.log("[user/whatsapp-numbers] delete success phone=" + phoneRaw);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[user/whatsapp-numbers] delete error message=" + err.message);
    return NextResponse.json({ error: "Erro ao remover o número." }, { status: 500 });
  }
}
