import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicBaseUrlFromEnv } from "@/lib/public-url";
import { randomBytes } from "crypto";

const BOT_TOKEN = process.env.AUDIO_SCORER_BOT_TOKEN;

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("x-bot-token") || request.headers.get("X-Bot-Token");
  if (!BOT_TOKEN || auth !== BOT_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = generateToken();
  const baseUrl = getPublicBaseUrlFromEnv();
  const link = `${baseUrl}/ativar?token=${token}`;

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("activation_tokens").insert({
      token,
    });
    if (error) {
      console.error("[generate-token] error insert message=" + (error?.message || ""));
      return NextResponse.json(
        { error: "Erro ao criar token no banco." },
        { status: 500 }
      );
    }
    return NextResponse.json({ token, link });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[generate-token] error message=" + err.message);
    return NextResponse.json(
      { error: "Erro ao gerar token." },
      { status: 500 }
    );
  }
}
