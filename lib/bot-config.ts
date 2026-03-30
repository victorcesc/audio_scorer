/**
 * Formato de resposta do bot WhatsApp por número (persistido em authorized_whatsapp_numbers.bot_config).
 * null/absente no BD → usar DEFAULT_BOT_REPLY_FORMAT (comportamento legado: score, BANT, snippet).
 */

export const TRANSCRIPT_MODES = ["off", "snippet", "full"] as const;
export type TranscriptMode = (typeof TRANSCRIPT_MODES)[number];

export type BotReplyFormat = {
  /** Slug do perfil — altera instruções ao GPT e rótulos dos dois focos */
  profileType: string;
  includeScore: boolean;
  includeBant: boolean;
  /** Exibir bloco profileInsight1 na mensagem (rótulo varia por perfil) */
  includeProfileInsight1: boolean;
  /** Exibir bloco profileInsight2 */
  includeProfileInsight2: boolean;
  transcriptMode: TranscriptMode;
};

export const DEFAULT_BOT_REPLY_FORMAT: BotReplyFormat = {
  profileType: "default",
  includeScore: true,
  includeBant: true,
  includeProfileInsight1: true,
  includeProfileInsight2: true,
  transcriptMode: "snippet",
};

/** Campos opcionais num PATCH (body da API). */
export type BotReplyFormatPatch = Partial<
  Pick<
    BotReplyFormat,
    | "profileType"
    | "includeScore"
    | "includeBant"
    | "includeProfileInsight1"
    | "includeProfileInsight2"
    | "transcriptMode"
  >
>;

export function mergeBotReplyFormat(
  current: BotReplyFormat,
  patch: BotReplyFormatPatch
): BotReplyFormat {
  const o: Record<string, unknown> = {
    profileType: current.profileType,
    includeScore: current.includeScore,
    includeBant: current.includeBant,
    includeProfileInsight1: current.includeProfileInsight1,
    includeProfileInsight2: current.includeProfileInsight2,
    transcriptMode: current.transcriptMode,
  };
  if (patch.profileType !== undefined) o.profileType = patch.profileType;
  if (patch.includeScore !== undefined) o.includeScore = patch.includeScore;
  if (patch.includeBant !== undefined) o.includeBant = patch.includeBant;
  if (patch.includeProfileInsight1 !== undefined)
    o.includeProfileInsight1 = patch.includeProfileInsight1;
  if (patch.includeProfileInsight2 !== undefined)
    o.includeProfileInsight2 = patch.includeProfileInsight2;
  if (patch.transcriptMode !== undefined) o.transcriptMode = patch.transcriptMode;
  return normalizeBotConfig(o);
}

function isTranscriptMode(x: unknown): x is TranscriptMode {
  return typeof x === "string" && (TRANSCRIPT_MODES as readonly string[]).includes(x);
}

/**
 * Mescla objeto parcial do BD (ou desconhecido) com os defaults.
 * Chaves inválidas ou de tipo errado são ignoradas.
 */
export function normalizeBotConfig(input: unknown): BotReplyFormat {
  const out: BotReplyFormat = { ...DEFAULT_BOT_REPLY_FORMAT };
  if (input == null || typeof input !== "object") return out;

  const o = input as Record<string, unknown>;

  if (typeof o.profileType === "string") {
    const t = o.profileType.trim();
    if (t.length > 0) out.profileType = t.slice(0, 64);
  }
  if (typeof o.includeScore === "boolean") out.includeScore = o.includeScore;
  if (typeof o.includeBant === "boolean") out.includeBant = o.includeBant;
  if (typeof o.includeProfileInsight1 === "boolean")
    out.includeProfileInsight1 = o.includeProfileInsight1;
  if (typeof o.includeProfileInsight2 === "boolean")
    out.includeProfileInsight2 = o.includeProfileInsight2;
  if (isTranscriptMode(o.transcriptMode)) out.transcriptMode = o.transcriptMode;

  return out;
}
