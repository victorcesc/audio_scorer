import { NextResponse } from "next/server";

export type ParseJsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse };

/** Lê o corpo JSON; em falha devolve 400 com mensagem padrão em PT-BR. */
export async function parseJsonBody(request: Request): Promise<ParseJsonBodyResult> {
  try {
    const body = await request.json();
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "JSON inválido." }, { status: 400 }),
    };
  }
}
