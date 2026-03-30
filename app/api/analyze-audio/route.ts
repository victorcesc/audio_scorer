import { NextRequest, NextResponse } from "next/server";
import {
  analyzeAudioBuffer,
  isAllowedAudioType,
  MAX_AUDIO_SIZE_BYTES,
} from "@/lib/analyze-audio";

// Áudio de ~1 min pode levar 15–45s (Whisper + GPT). Evita timeout 500.
export const maxDuration = 60;

const ERROR_FORMAT_INVALID = "Resposta da IA em formato inválido.";
const ERROR_UNSUPPORTED_FORMAT =
  "Formato não suportado. Use MP3, OGG, WebM ou WAV (máx. 25MB).";
const ERROR_FILE_TOO_LARGE = "Arquivo muito grande. Tamanho máximo: 25MB.";
const ERROR_TIMEOUT =
  "O processamento demorou demais. Tente um áudio mais curto ou tente novamente.";
const ERROR_CONNECTION =
  "Falha de conexão com o serviço de análise. Aguarde alguns segundos e tente novamente.";
const ERROR_API_KEY = "Serviço de análise não configurado. Contate o suporte.";
const ERROR_QUOTA =
  "Cota da API OpenAI esgotada. Verifique seu plano e cobrança em platform.openai.com.";
const ERROR_GENERIC =
  "Erro ao processar o áudio. Tente novamente. Se persistir, use um áudio mais curto ou formato MP3.";

/**
 * Mapeia erros conhecidos da análise de áudio para resposta HTTP (mensagem + status).
 * Retorna null quando o erro não se enquadra em nenhum caso conhecido.
 */
function errorToApiResponse(
  err: unknown
): { error: string; status: number } | null {
  if (err instanceof SyntaxError) {
    return { error: ERROR_FORMAT_INVALID, status: 502 };
  }

  if (!(err instanceof Error)) {
    return null;
  }

  const message = err.message;
  const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
  const apiErr = err as {
    status?: number;
    error?: { message?: string; code?: string };
  };

  if (message.includes("Invalid qualification JSON shape")) {
    return { error: ERROR_FORMAT_INVALID, status: 502 };
  }
  if (message.includes("Formato não suportado") || message.includes("muito grande")) {
    return { error: message, status: 400 };
  }
  if (message.includes("transcrever o áudio")) {
    return { error: message, status: 422 };
  }
  if (
    message.includes("timeout") ||
    message.includes("ETIMEDOUT") ||
    err.name === "AbortError"
  ) {
    return { error: ERROR_TIMEOUT, status: 504 };
  }
  if (
    message.includes("Connection error") ||
    message.includes("APIConnectionError") ||
    causeCode === "ECONNRESET"
  ) {
    return { error: ERROR_CONNECTION, status: 503 };
  }
  if (message.includes("OPENAI_API_KEY")) {
    return { error: ERROR_API_KEY, status: 503 };
  }
  if (apiErr.status === 429 || apiErr.error?.code === "insufficient_quota") {
    return { error: ERROR_QUOTA, status: 503 };
  }
  if (apiErr.error?.message) {
    return { error: `Erro na análise: ${apiErr.error.message}`, status: 502 };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("audio");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Arquivo de áudio não enviado. Use o campo 'audio'." },
        { status: 400 }
      );
    }

    const mimeType = file.type ?? "";
    const fileName = file.name ?? "audio.mp3";

    if (!isAllowedAudioType(mimeType, fileName)) {
      return NextResponse.json(
        { error: ERROR_UNSUPPORTED_FORMAT },
        { status: 400 }
      );
    }

    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      return NextResponse.json(
        { error: ERROR_FILE_TOO_LARGE },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { transcript, qualification } = await analyzeAudioBuffer(
      buffer,
      mimeType || "audio/mpeg",
      fileName
    );

    return NextResponse.json({
      transcript,
      ...qualification,
    });
  } catch (err) {
    console.error("[analyze-audio] error", err instanceof Error ? err.message : err);

    const response = errorToApiResponse(err);
    if (response) {
      return NextResponse.json({ error: response.error }, { status: response.status });
    }

    return NextResponse.json(
      { error: ERROR_GENERIC },
      { status: 500 }
    );
  }
}
