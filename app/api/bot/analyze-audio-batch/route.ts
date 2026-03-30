import { NextRequest, NextResponse } from "next/server";
import {
  analyzeAudioBatch,
  BATCH_MAX_ITEMS,
  MAX_AUDIO_SIZE_BYTES,
} from "@/lib/analyze-audio";
import { findAuthorizedWhatsappRowForLookup } from "@/lib/bot-authorized-phone";
import { validateBotRequestToken } from "@/lib/bot-auth";
import { DEFAULT_BOT_REPLY_FORMAT, normalizeBotConfig } from "@/lib/bot-config";
import { parseJsonBody } from "@/lib/parse-json-body";
import { incrementWhatsappAudioCount } from "@/lib/whatsapp-audio-usage";

export const maxDuration = 300;

// -----------------------------------------------------------------------------
// fromPhone (opcional; se enviado, tem de existir em authorized_whatsapp_numbers)
// -----------------------------------------------------------------------------

type FromPhoneParse =
  | { kind: "omit" }
  | { kind: "invalid" }
  | { kind: "ok"; raw: string };

function parseFromPhoneField(body: unknown): FromPhoneParse {
  if (!body || typeof body !== "object") return { kind: "omit" };
  if (!("fromPhone" in body)) return { kind: "omit" };
  const v = (body as { fromPhone?: unknown }).fromPhone;
  if (v === undefined || v === null) return { kind: "omit" };
  if (typeof v !== "string") return { kind: "invalid" };
  const digits = v.replace(/\D/g, "");
  if (!digits.length) return { kind: "invalid" };
  return { kind: "ok", raw: v };
}

// -----------------------------------------------------------------------------
// Request body parsing & validation
// -----------------------------------------------------------------------------

type ParsedBatchItem = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  timestamp?: number;
};

type ParseResult =
  | { ok: true; items: ParsedBatchItem[] }
  | { ok: false; status: number; error: string };

function parseBatchBody(body: unknown): ParseResult {
  if (!body || typeof body !== "object" || !("items" in body)) {
    return {
      ok: false,
      status: 400,
      error: "Envie um array 'items' não vazio (máximo 5 áudios).",
    };
  }

  const rawItems = (body as { items: unknown }).items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Envie um array 'items' não vazio (máximo 5 áudios).",
    };
  }

  if (rawItems.length > BATCH_MAX_ITEMS) {
    return {
      ok: false,
      status: 400,
      error: `No máximo ${BATCH_MAX_ITEMS} áudios por lote.`,
    };
  }

  const items: ParsedBatchItem[] = [];

  for (let i = 0; i < rawItems.length; i++) {
    const row = rawItems[i];
    if (!row || typeof row !== "object" || typeof (row as { audio?: unknown }).audio !== "string") {
      return {
        ok: false,
        status: 400,
        error: `Item ${i + 1}: campo 'audio' (base64) em falta.`,
      };
    }

    const { audio: b64, mimeType: rawMime, filename: rawFilename, timestamp: rawTs } = row as {
      audio: string;
      mimeType?: unknown;
      filename?: unknown;
      timestamp?: unknown;
    };

    let buffer: Buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return { ok: false, status: 400, error: `Item ${i + 1}: base64 inválido.` };
    }

    if (buffer.length === 0) {
      return { ok: false, status: 400, error: `Item ${i + 1}: áudio vazio.` };
    }
    if (buffer.length > MAX_AUDIO_SIZE_BYTES) {
      return {
        ok: false,
        status: 400,
        error: `Item ${i + 1}: arquivo muito grande (máx. 25MB).`,
      };
    }

    const mimeType = typeof rawMime === "string" ? rawMime : "audio/ogg";
    const fileName = typeof rawFilename === "string" ? rawFilename : `audio_${i + 1}.ogg`;
    const timestamp =
      typeof rawTs === "number" && Number.isFinite(rawTs) ? rawTs : undefined;

    items.push({ buffer, mimeType, fileName, timestamp });
  }

  return { ok: true, items };
}

// -----------------------------------------------------------------------------
// Error mapping (library errors → HTTP)
// -----------------------------------------------------------------------------

const BAD_REQUEST_PHRASES = [
  "Formato não suportado",
  "muito grande",
  "Máximo de",
];

function batchErrorToResponse(err: Error): NextResponse | null {
  const msg = err.message;
  if (BAD_REQUEST_PHRASES.some((p) => msg.includes(p))) {
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (msg.includes("OPENAI_API_KEY")) {
    return NextResponse.json(
      { error: "Serviço de análise não configurado." },
      { status: 503 }
    );
  }
  return null;
}

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  if (!validateBotRequestToken(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsedJson = await parseJsonBody(request);
  if (!parsedJson.ok) return parsedJson.response;
  const body = parsedJson.body;

  const parsed = parseBatchBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const fp = parseFromPhoneField(body);
  if (fp.kind === "invalid") {
    return NextResponse.json(
      {
        error:
          "O campo 'fromPhone' é inválido. Envie o número com DDD (dígitos ou formato brasileiro).",
      },
      { status: 400 }
    );
  }

  let format = DEFAULT_BOT_REPLY_FORMAT;
  let canonicalPhoneForUsage: string | null = null;
  if (fp.kind === "ok") {
    const row = await findAuthorizedWhatsappRowForLookup(fp.raw);
    if (!row) {
      return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    }
    format = normalizeBotConfig(row.bot_config);
    canonicalPhoneForUsage = row.phone;
  } else if (process.env.NODE_ENV === "development") {
    console.warn("[analyze-audio-batch] fromPhone omitido; usando formato padrão.");
  }

  try {
    const text = await analyzeAudioBatch(parsed.items, format);
    if (canonicalPhoneForUsage) {
      await incrementWhatsappAudioCount(
        canonicalPhoneForUsage,
        parsed.items.length
      );
    }
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof Error) {
      const mapped = batchErrorToResponse(err);
      if (mapped) return mapped;
      console.error("[bot/analyze-audio-batch] error", err.message);
    }
    return NextResponse.json(
      {
        error:
          "Falha ao processar o lote. Tente áudios mais curtos ou volte a tentar mais tarde.",
      },
      { status: 500 }
    );
  }
}
