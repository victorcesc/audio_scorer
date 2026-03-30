import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateBotRequestToken } from "@/lib/bot-auth";
import { getBrazilianPhoneLookupVariants, normalizeBrazilianPhone } from "@/lib/phone";

type AdminClient = ReturnType<typeof createAdminClient>;

async function fetchAuthorizedWhatsappRow(
  supabase: AdminClient,
  variants: string[]
): Promise<{ row: { phone: string } | null; hadTableError: boolean }> {
  let hadTableError = false;
  for (const v of variants) {
    const res = await supabase
      .from("authorized_whatsapp_numbers")
      .select("phone")
      .eq("phone", v)
      .maybeSingle();
    if (res.error) {
      hadTableError = true;
      console.error(
        "[check-authorized] supabase_error table=authorized_whatsapp_numbers phone=" +
          v +
          " message=" +
          (res.error?.message || "")
      );
      continue;
    }
    if (res.data) return { row: res.data, hadTableError: false };
  }
  return { row: null, hadTableError };
}

/** Token já usado, amarrado a um dos formatos do telefone. */
async function hasConsumedActivationForVariants(
  supabase: AdminClient,
  variants: string[]
): Promise<boolean> {
  for (const v of variants) {
    const res = await supabase
      .from("activation_tokens")
      .select("token")
      .eq("used_by_phone", v)
      .not("used_at", "is", null)
      .maybeSingle();
    if (res.error) {
      console.error(
        "[check-authorized] supabase_error table=activation_tokens message=" +
          (res.error?.message || "")
      );
      continue;
    }
    if (res.data) return true;
  }
  return false;
}

export async function GET(request: NextRequest) {
  if (!validateBotRequestToken(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const phone = request.nextUrl.searchParams.get("phone");
  if (!phone?.trim()) {
    return NextResponse.json(
      { error: "O parâmetro 'phone' na URL é obrigatório." },
      { status: 400 }
    );
  }

  const digitsOnly = phone.replace(/\D/g, "");
  const normalized = normalizeBrazilianPhone(digitsOnly);
  if (!normalized.length) {
    return NextResponse.json({ authorized: false });
  }

  const variants = getBrazilianPhoneLookupVariants(digitsOnly);

  try {
    const supabase = createAdminClient();
    const { row, hadTableError } = await fetchAuthorizedWhatsappRow(supabase, variants);

    let authorized = !!row;
    let source = row ? "authorized_whatsapp_numbers" : "";

    if (!authorized && !hadTableError) {
      const viaToken = await hasConsumedActivationForVariants(supabase, variants);
      if (viaToken) {
        authorized = true;
        source = "activation_tokens";
      }
    }

    if (authorized) {
      console.log(
        "[check-authorized] phone=" + normalized + " authorized=true source=" + source
      );
    } else {
      console.log(
        "[check-authorized] phone=" +
          normalized +
          " authorized=false tried=" +
          variants.join(",")
      );
    }

    return NextResponse.json({ authorized });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[check-authorized] error message=" + err.message);
    return NextResponse.json({ authorized: false });
  }
}
