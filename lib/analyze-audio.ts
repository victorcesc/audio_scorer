import OpenAI from "openai";
import type { LeadQualification } from "@/lib/types";
import {
  DEFAULT_BOT_REPLY_FORMAT,
  type BotReplyFormat,
} from "@/lib/bot-config";
import { getProfileInsightLabels } from "@/lib/profile-insights";
import {
  buildQualificationSystemPrompt,
  buildQualificationUserPrompt,
  buildQualificationBatchSystemPrompt,
  buildQualificationBatchUserPrompt,
} from "@/lib/prompts/qualification";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
] as const;

export const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;
export const BATCH_MAX_ITEMS = 5;

const ALLOWED_EXTENSIONS = /\.(mp3|ogg|webm|wav|mpeg)$/i;
const BATCH_TRANSCRIPT_SNIPPET_LENGTH = 150;
const WHISPER_CONCURRENCY = 2;
const BATCH_AUDIO_SUMMARY_MAX_CHARS = 200;
const BATCH_MIXED_AUDIO_NOTICE =
  "Se os áudios forem de pessoas diferentes, considere cada bloco abaixo separadamente.";

const TIME_LABEL_LOCALE = "pt-BR";
const TIME_LABEL_TZ = "America/Sao_Paulo";
const OPENAI_TIMEOUT_MS = 120_000;
const OPENAI_MAX_RETRIES = 2;
const RETRY_DELAY_MULTIPLIER_MS = 3000;

// -----------------------------------------------------------------------------
// OpenAI client & retry
// -----------------------------------------------------------------------------

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: { code?: string } })?.cause;
  return (
    error.message?.includes("ECONNRESET") === true ||
    error.message?.includes("Connection error") === true ||
    error.message?.includes("APIConnectionError") === true ||
    cause?.code === "ECONNRESET"
  );
}

function createOpenAIClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({
    apiKey: key,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES,
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === maxAttempts) throw error;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MULTIPLIER_MS * attempt));
    }
  }
  throw lastError;
}

// -----------------------------------------------------------------------------
// Validation & parsing
// -----------------------------------------------------------------------------

export function isAllowedAudioType(mimeType: string, fileName: string): boolean {
  const type = mimeType?.toLowerCase() ?? "";
  const typeOk = ALLOWED_AUDIO_TYPES.some((t) =>
    type.includes(t.replace("audio/", ""))
  );
  const extOk = fileName.match(ALLOWED_EXTENSIONS) !== null;
  return typeOk || extOk;
}

function parseQualificationResponse(text: string): LeadQualification {
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(cleaned) as LeadQualification;
  if (
    typeof parsed.summary !== "string" ||
    typeof parsed.score !== "number" ||
    typeof parsed.nextStep !== "string"
  ) {
    throw new Error("Invalid qualification JSON shape");
  }
  if (parsed.bantReasons == null || typeof parsed.bantReasons !== "string") {
    parsed.bantReasons = "";
  }
  if (parsed.profileInsight1 == null || typeof parsed.profileInsight1 !== "string") {
    parsed.profileInsight1 = "";
  }
  if (parsed.profileInsight2 == null || typeof parsed.profileInsight2 !== "string") {
    parsed.profileInsight2 = "";
  }
  return parsed;
}

function normalizeTranscriptionResult(transcription: unknown): string {
  if (typeof transcription === "string") return transcription;
  return (transcription as { text?: string })?.text ?? "";
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface AnalyzeAudioResult {
  transcript: string;
  qualification: LeadQualification;
}

interface BatchAudioItemInput {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  timestamp?: number;
}

type TranscriptionOutcome =
  | { index: number; ok: true; transcript: string; label: string }
  | { index: number; ok: false; label: string; error: string };

type BatchSection = { label: string; snippet: string; failed?: string };

// -----------------------------------------------------------------------------
// Formatting (labels, WhatsApp text)
// -----------------------------------------------------------------------------

function formatAudioTimeLabel(
  timestampSec: number | undefined,
  indexOneBased: number
): string {
  if (timestampSec != null && Number.isFinite(timestampSec)) {
    const dateStr = new Date(timestampSec * 1000).toLocaleString(TIME_LABEL_LOCALE, {
      timeZone: TIME_LABEL_TZ,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${dateStr} (áudio ${indexOneBased})`;
  }
  return `Áudio ${indexOneBased}`;
}

function truncateForSnippet(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

// -----------------------------------------------------------------------------
// Whisper (transcription only)
// -----------------------------------------------------------------------------

async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName = "audio.mp3"
): Promise<string> {
  if (!isAllowedAudioType(mimeType, fileName)) {
    throw new Error("Formato não suportado. Use MP3, OGG, WebM ou WAV.");
  }
  if (buffer.length > MAX_AUDIO_SIZE_BYTES) {
    throw new Error("Arquivo muito grande. Tamanho máximo: 25MB.");
  }

  const blob = new Blob([new Uint8Array(buffer)], {
    type: mimeType || "audio/mpeg",
  });
  const file = new File([blob], fileName, { type: mimeType || "audio/mpeg" });
  const openai = createOpenAIClient();

  const raw = await withRetry(() =>
    openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "text",
    })
  );

  const transcript = normalizeTranscriptionResult(raw).trim();
  if (!transcript) {
    throw new Error("Não foi possível transcrever o áudio (vazio ou inaudível).");
  }
  return transcript;
}

// -----------------------------------------------------------------------------
// GPT qualification (single & batch)
// -----------------------------------------------------------------------------

async function qualifyTranscript(
  transcript: string,
  profileType: string = "default"
): Promise<LeadQualification> {
  const openai = createOpenAIClient();
  const completion = await withRetry(() =>
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildQualificationSystemPrompt(profileType) },
        { role: "user", content: buildQualificationUserPrompt(transcript, profileType) },
      ],
      response_format: { type: "text" },
    })
  );

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("A IA não retornou uma análise.");
  return parseQualificationResponse(raw);
}

async function qualifyBatchTranscript(
  labeledTranscripts: string,
  profileType: string = "default"
): Promise<LeadQualification> {
  const openai = createOpenAIClient();
  const completion = await withRetry(() =>
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: buildQualificationBatchSystemPrompt(profileType),
        },
        {
          role: "user",
          content: buildQualificationBatchUserPrompt(labeledTranscripts, profileType),
        },
      ],
      response_format: { type: "text" },
    })
  );

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("A IA não retornou uma análise.");
  return parseQualificationResponse(raw);
}

function parseBatchAudioSummaryResponse(text: string, expectedCount: number): string[] {
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(cleaned) as { summaries?: unknown };
  if (!Array.isArray(parsed?.summaries)) {
    throw new Error("Formato inválido no resumo por áudio.");
  }
  const out = parsed.summaries
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .slice(0, expectedCount)
    .map((value) => truncateForSnippet(value, BATCH_AUDIO_SUMMARY_MAX_CHARS));
  while (out.length < expectedCount) out.push("");
  return out;
}

async function summarizeBatchTranscripts(
  successes: (TranscriptionOutcome & { ok: true })[]
): Promise<Map<number, string>> {
  const openai = createOpenAIClient();
  const ordered = [...successes].sort((a, b) => a.index - b.index);
  const transcriptList = ordered
    .map((s, i) => `${i + 1}. ${s.label}\n${s.transcript}`)
    .join("\n\n");

  const completion = await withRetry(() =>
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Você resume transcrições de áudio para WhatsApp. Responda APENAS JSON válido no formato {\"summaries\":[\"...\"]}. Cada item deve ser curto (1 frase, máximo ~20 palavras), em português do Brasil e sem inventar informações.",
        },
        {
          role: "user",
          content: `Resuma cada transcrição abaixo mantendo a mesma ordem. Retorne exatamente ${ordered.length} itens em "summaries".\n\n${transcriptList}`,
        },
      ],
      response_format: { type: "text" },
    })
  );

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("A IA não retornou resumos por áudio.");

  const summaries = parseBatchAudioSummaryResponse(raw, ordered.length);
  const map = new Map<number, string>();
  ordered.forEach((s, i) => {
    const summary = summaries[i] ?? "";
    map.set(s.index, summary);
  });
  return map;
}

// -----------------------------------------------------------------------------
// Single audio: full pipeline
// -----------------------------------------------------------------------------

export async function analyzeAudioBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName = "audio.mp3",
  /** Perfil para instruções extras ao GPT (site usa default) */
  profileType: string = "default"
): Promise<AnalyzeAudioResult> {
  const transcript = await transcribeAudioBuffer(buffer, mimeType, fileName);
  const qualification = await qualifyTranscript(transcript, profileType);
  return { transcript, qualification };
}

// -----------------------------------------------------------------------------
// Batch: concurrent transcription pool
// -----------------------------------------------------------------------------

async function transcribeWithConcurrency(
  items: BatchAudioItemInput[],
  concurrency: number
): Promise<TranscriptionOutcome[]> {
  const results: TranscriptionOutcome[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      const item = items[i]!;
      const label = formatAudioTimeLabel(item.timestamp, i + 1);
      const fileName = item.fileName ?? `audio_${i + 1}.ogg`;
      try {
        const transcript = await transcribeAudioBuffer(
          item.buffer,
          item.mimeType,
          fileName
        );
        results[i] = { index: i, ok: true, transcript, label };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        results[i] = { index: i, ok: false, label, error };
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function buildBatchSections(
  outcomes: TranscriptionOutcome[],
  transcriptMode: BotReplyFormat["transcriptMode"],
  summariesByIndex: Map<number, string> = new Map()
): BatchSection[] {
  return outcomes.map((o) => {
    if (o.ok) {
      if (transcriptMode === "full") {
        return { label: o.label, snippet: o.transcript };
      }
      if (transcriptMode === "snippet") {
        const summary = summariesByIndex.get(o.index)?.trim();
        return {
          label: o.label,
          snippet:
            summary && summary.length > 0
              ? summary
              : truncateForSnippet(o.transcript, BATCH_TRANSCRIPT_SNIPPET_LENGTH),
        };
      }
      return { label: o.label, snippet: "" };
    }
    return { label: o.label, snippet: "", failed: o.error };
  });
}

function buildLabeledTranscriptForGpt(
  successes: (TranscriptionOutcome & { ok: true })[]
): string {
  return successes
    .sort((a, b) => a.index - b.index)
    .map((s) => `### ${s.label}\n${s.transcript}`)
    .join("\n\n");
}

function buildAllFailedMessage(failures: (TranscriptionOutcome & { ok: false })[]): string {
  const lines = failures.map((f) => `❌ *${f.label}*: ${f.error}`);
  return ["Não foi possível transcrever nenhum áudio.", "", ...lines].join("\n");
}

// -----------------------------------------------------------------------------
// Batch: full pipeline & WhatsApp formatting
// -----------------------------------------------------------------------------

function insightTextWorthShowing(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t === "—" || t === "-" || t === "–") return false;
  return true;
}

function formatBatchAnalysisForWhatsApp(
  qualification: LeadQualification,
  sections: BatchSection[],
  format: BotReplyFormat
): string {
  const labels = getProfileInsightLabels(format.profileType);
  const headerLines: (string | null)[] = [
    "📋 *Análise*",
    "",
    `*Resumo:* ${qualification.summary}`,
  ];
  if (format.includeScore) {
    headerLines.push(`*Score:* ${qualification.score}/10`);
  }
  if (format.includeBant && qualification.bantReasons) {
    headerLines.push(`*BANT:* ${qualification.bantReasons}`);
  }
  if (
    format.includeProfileInsight1 &&
    insightTextWorthShowing(qualification.profileInsight1)
  ) {
    headerLines.push(
      `*${labels.insight1Title}:* ${qualification.profileInsight1.trim()}`
    );
  }
  if (
    format.includeProfileInsight2 &&
    insightTextWorthShowing(qualification.profileInsight2)
  ) {
    headerLines.push(
      `*${labels.insight2Title}:* ${qualification.profileInsight2.trim()}`
    );
  }
  headerLines.push(`*Próximo passo:* ${qualification.nextStep}`, "");

  const showSuccessSnippets = format.transcriptMode !== "off";
  const bodyParts: string[] = [];
  for (const s of sections) {
    if (s.failed) {
      bodyParts.push(`❌ *${s.label}*`, s.failed, "");
    } else if (showSuccessSnippets && s.snippet.length > 0) {
      bodyParts.push(`*${s.label}*`, s.snippet, "");
    }
  }

  const header = headerLines.filter((l): l is string => l !== null);
  if (bodyParts.length === 0) {
    return header.join("\n").trim();
  }
  return [...header, "---", `_Obs.: ${BATCH_MIXED_AUDIO_NOTICE}_`, "", "*Por áudio:*", "", ...bodyParts]
    .join("\n")
    .trim();
}

export async function analyzeAudioBatch(
  items: BatchAudioItemInput[],
  format: BotReplyFormat = DEFAULT_BOT_REPLY_FORMAT
): Promise<string> {
  if (items.length === 0) throw new Error("Nenhum áudio no lote.");
  if (items.length > BATCH_MAX_ITEMS) {
    throw new Error(`Máximo de ${BATCH_MAX_ITEMS} áudios por lote.`);
  }

  const outcomes = await transcribeWithConcurrency(items, WHISPER_CONCURRENCY);
  const successes = outcomes.filter((o): o is TranscriptionOutcome & { ok: true } => o.ok);
  const failures = outcomes.filter((o): o is TranscriptionOutcome & { ok: false } => !o.ok);
  let summariesByIndex = new Map<number, string>();
  if (format.transcriptMode === "snippet" && successes.length > 0) {
    try {
      summariesByIndex = await summarizeBatchTranscripts(successes);
    } catch (err) {
      console.error("[analyze-audio-batch] summary fallback", err);
    }
  }
  const sections = buildBatchSections(outcomes, format.transcriptMode, summariesByIndex);

  if (successes.length === 0) {
    return buildAllFailedMessage(failures);
  }

  const labeledForGpt = buildLabeledTranscriptForGpt(successes);
  const qualification = await qualifyBatchTranscript(
    labeledForGpt,
    format.profileType
  );
  return formatBatchAnalysisForWhatsApp(qualification, sections, format);
}
