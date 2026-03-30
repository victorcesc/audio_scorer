/**
 * Bot WhatsApp (whatsapp-web.js) para Audio Scorer.
 * Recebe áudios, agrupa por chat (debounce) e responde uma vez com análise agregada.
 *
 * Env: AUDIO_SCORER_API_URL, AUDIO_SCORER_BOT_TOKEN
 * Primeira execução: escaneie o QR (Dispositivos conectados). Sessão em .wwebjs_auth/ (ou WWEBJS_DATA_PATH).
 */

require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");

// -----------------------------------------------------------------------------
// Config & constants
// -----------------------------------------------------------------------------

const API_URL = process.env.AUDIO_SCORER_API_URL || "http://localhost:3000";
const BOT_TOKEN = process.env.AUDIO_SCORER_BOT_TOKEN;

const BATCH_DEBOUNCE_MS = 4000;
const BATCH_MAX = 5;
const BATCH_WINDOW_SEC = 30;
const WHATSAPP_MSG_LIMIT = 3800;
const DEDUP_TTL_MS = 30_000;
/** Evita pendurar para sempre se a API estiver inacessível (ex.: URL errada no container). */
const API_TIMEOUT_CHECK_MS = 25_000;
const API_TIMEOUT_CONFIG_MS = 30_000;
/** Lote pode levar vários minutos (Whisper + IA); alinhar com maxDuration da rota (~300s). */
const API_TIMEOUT_BATCH_MS = 280_000;

const MESSAGES = {
  /** Quando o texto não corresponde a nenhum comando conhecido */
  textHint:
    "Envie um *áudio de voz* para analisar ou digite *config* para ver os comandos do bot.",
  notAuthorized:
    "Você não está ativado. Peça ao administrador um link de ativação. Após receber o link, acesse-o e informe seu número de WhatsApp.",
  sendVoice: "Envie um áudio de voz para receber a análise.",
  downloadFailed: "Não foi possível baixar o áudio. Tente enviar novamente.",
  analyzing: (n) => `⏳ Analisando ${n} áudio(s)... pode levar alguns minutos.`,
  errorGeneric:
    "Erro ao processar. Tente áudios mais curtos ou novamente mais tarde.",
  continuation: "\n\n_(continua na próxima mensagem)_",
};

if (!BOT_TOKEN) {
  console.error("Defina AUDIO_SCORER_BOT_TOKEN no .env");
  process.exit(1);
}

console.log(
  "[bot] AUDIO_SCORER_API_URL=" +
    API_URL +
    " (no Docker/Railway não use localhost; use a URL pública do serviço Next.js)"
);

const analyzeBatchUrl = new URL("/api/bot/analyze-audio-batch", API_URL).href;
const checkAuthUrl = new URL("/api/bot/check-authorized", API_URL);
const replyConfigUrl = new URL("/api/bot/reply-config", API_URL).href;

/** Ajuda de comandos de configuração (PT-BR) */
const CONFIG_HELP = `⚙️ *Configuração da resposta do bot*

*mostrar* — ver opções atuais (inclui os *dois focos* do seu perfil)

*score ligado* / *score desligado* — mostrar ou ocultar a nota (0–10)
*bant ligado* / *bant desligado* — mostrar ou ocultar o texto BANT

*foco1 ligado* / *foco1 desligado* — 1.º bloco extra do perfil (ex.: necessidade de cobertura em seguros)
*foco2 ligado* / *foco2 desligado* — 2.º bloco do perfil (nomes exatos em *mostrar*)

*transcricao nenhuma* — sem trechos por áudio
*transcricao trecho* — trecho curto por áudio (padrão)
*transcricao completa* — transcrição inteira por áudio

*perfil default* (ou *insurance*, *real_estate*, *b2b_sales*, …) — muda o perfil e os textos dos focos na análise

Também em inglês: *show*, *score on/off*, *bant on/off*, *focus1 on/off*, *focus2 on/off*, *transcript …*, *profile …*

📌 *Resumo* e *próximo passo* vêm sempre na análise.

Envie um *áudio* para receber a análise.`;

// -----------------------------------------------------------------------------
// Session cleanup (Chromium locks)
// -----------------------------------------------------------------------------

/** Caminho da pasta LocalAuth; em Railway use volume persistente + WWEBJS_DATA_PATH absoluto (ex.: /data/wwebjs_auth). */
const wwebjsDataRaw = process.env.WWEBJS_DATA_PATH || ".wwebjs_auth";
const wwebjsDataPath = path.isAbsolute(wwebjsDataRaw)
  ? wwebjsDataRaw
  : path.join(process.cwd(), wwebjsDataRaw);
const sessionDir = path.join(wwebjsDataPath, "session");
["SingletonLock", "SingletonCookie", "SingletonSocket"].forEach((name) => {
  try {
    fs.unlinkSync(path.join(sessionDir, name));
  } catch (_) {}
});

// -----------------------------------------------------------------------------
// HTTP: generic request helper
// -----------------------------------------------------------------------------

function apiRequest(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: {
        "X-Bot-Token": BOT_TOKEN,
        ...options.headers,
      },
    };

    const req = (isHttps ? https : http).request(reqOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(data.error || body || res.statusCode));
          } else {
            resolve(data);
          }
        } catch {
          reject(new Error(body || "Resposta inválida da API"));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(
        new Error(
          "Tempo esgotado ao contactar a API. Confira AUDIO_SCORER_API_URL (URL pública do Next.js, não localhost dentro do container) e se o serviço está no ar."
        )
      );
    });
    if (options.body) {
      req.setHeader("Content-Type", "application/json");
      req.setHeader("Content-Length", Buffer.byteLength(options.body));
      req.write(options.body);
    }
    req.end();
  });
}

// -----------------------------------------------------------------------------
// API: check authorized & post batch
// -----------------------------------------------------------------------------

function checkAuthorized(phone) {
  const url = new URL(checkAuthUrl);
  url.searchParams.set("phone", phone);
  return apiRequest(url.href, { timeoutMs: API_TIMEOUT_CHECK_MS }).then(
    (data) => data.authorized === true,
    (err) => {
      const msg = err && err.message ? String(err.message) : "";
      const low = msg.toLowerCase();
      if (low.includes("unauthorized") || msg.includes("Não autorizado")) {
        console.error(
          "[bot] check-authorized: a API rejeitou o token (401 Unauthorized). " +
            "Defina AUDIO_SCORER_BOT_TOKEN no .env do bot com o MESMO valor de AUDIO_SCORER_BOT_TOKEN na API (Railway/.env.local)."
        );
        return false;
      }
      if (
        low.includes("tempo esgotado") ||
        low.includes("econnrefused") ||
        low.includes("enotfound") ||
        low.includes("econnreset") ||
        low.includes("etimedout") ||
        low.includes("socket hang up")
      ) {
        return Promise.reject(err);
      }
      console.warn("[bot] check-authorized erro phone=" + phone + " mensagem=" + msg);
      return false;
    }
  );
}

function postAudioBatch(batch, fromPhoneDigits) {
  const items = batch.map((x) => ({
    audio: x.buffer.toString("base64"),
    mimeType: x.mimeType || "audio/ogg",
    timestamp: x.timestamp,
  }));
  return apiRequest(analyzeBatchUrl, {
    method: "POST",
    body: JSON.stringify({ items, fromPhone: fromPhoneDigits }),
    timeoutMs: API_TIMEOUT_BATCH_MS,
  }).then((data) => data.text || data.error || "Sem resposta.");
}

function fetchReplyConfig(phoneDigits) {
  const url = new URL(replyConfigUrl);
  url.searchParams.set("phone", phoneDigits);
  return apiRequest(url.href, { timeoutMs: API_TIMEOUT_CONFIG_MS });
}

function patchReplyConfig(phoneDigits, patch) {
  return apiRequest(replyConfigUrl, {
    method: "PATCH",
    body: JSON.stringify({ phone: phoneDigits, patch }),
    timeoutMs: API_TIMEOUT_CONFIG_MS,
  });
}

function formatReplyConfigForWhatsApp(data) {
  const r = data && data.replyFormat;
  if (!r) return "Não foi possível ler a configuração.";
  const lbl = (data && data.profileInsightLabels) || {};
  const title1 = lbl.insight1Title || "Foco 1 do perfil";
  const title2 = lbl.insight2Title || "Foco 2 do perfil";
  const ins1 = r.includeProfileInsight1 !== false;
  const ins2 = r.includeProfileInsight2 !== false;
  const tm =
    r.transcriptMode === "off"
      ? "nenhuma (só cabeçalho / erros)"
      : r.transcriptMode === "snippet"
        ? "trecho"
        : "completa";
  return (
    `*Configuração atual*\n\n` +
    `• Perfil: _${r.profileType}_\n` +
    `• Score: ${r.includeScore ? "ligado" : "desligado"}\n` +
    `• BANT: ${r.includeBant ? "ligado" : "desligado"}\n` +
    `• *${title1}* (_foco1_): ${ins1 ? "ligado" : "desligado"}\n` +
    `• *${title2}* (_foco2_): ${ins2 ? "ligado" : "desligado"}\n` +
    `• Transcrição por áudio: _${tm}_`
  );
}

/** null = token inválido; true/false para ligado/desligado */
function parseOnOff(token) {
  if (!token) return null;
  const t = String(token).toLowerCase();
  if (["on", "ligado", "sim", "true", "1"].includes(t)) return true;
  if (["off", "desligado", "nao", "não", "false", "0"].includes(t)) return false;
  return null;
}

function parseTranscriptMode(token) {
  if (!token) return null;
  const t = String(token).toLowerCase();
  if (["off", "nenhuma", "nenhum", "no"].includes(t)) return "off";
  if (["snippet", "trecho", "resumo"].includes(t)) return "snippet";
  if (["full", "completa", "completo", "integral"].includes(t)) return "full";
  return null;
}

async function handleConfigTextMessage(msg, fromDigits) {
  const raw = (msg.body || "").trim();
  if (!raw) {
    await msg.reply(MESSAGES.textHint);
    return;
  }
  const lower = raw.toLowerCase();
  const parts = lower.split(/\s+/).filter(Boolean);
  const a0 = parts[0] || "";
  const a1 = parts[1] || "";

  try {
    if (["config", "menu", "help", "ajuda"].includes(a0)) {
      await msg.reply(CONFIG_HELP);
      return;
    }
    if (["mostrar", "show", "ver"].includes(a0)) {
      const data = await fetchReplyConfig(fromDigits);
      await msg.reply(formatReplyConfigForWhatsApp(data));
      return;
    }
    if (a0 === "score") {
      const v = parseOnOff(a1);
      if (!a1 || v === null) {
        await msg.reply(
          "Use: *score ligado* ou *score desligado* (também *on* / *off*)."
        );
        return;
      }
      await patchReplyConfig(fromDigits, { includeScore: v });
      const data = await fetchReplyConfig(fromDigits);
      await msg.reply("✅ Score atualizado.\n\n" + formatReplyConfigForWhatsApp(data));
      return;
    }
    if (a0 === "bant") {
      const v = parseOnOff(a1);
      if (!a1 || v === null) {
        await msg.reply(
          "Use: *bant ligado* ou *bant desligado* (também *on* / *off*)."
        );
        return;
      }
      await patchReplyConfig(fromDigits, { includeBant: v });
      const data = await fetchReplyConfig(fromDigits);
      await msg.reply("✅ BANT atualizado.\n\n" + formatReplyConfigForWhatsApp(data));
      return;
    }
    if (a0 === "foco1" || a0 === "focus1") {
      const v = parseOnOff(a1);
      if (!a1 || v === null) {
        await msg.reply(
          "Use: *foco1 ligado* ou *foco1 desligado* (também *on* / *off*). O nome do bloco aparece em *mostrar*."
        );
        return;
      }
      await patchReplyConfig(fromDigits, { includeProfileInsight1: v });
      const data = await fetchReplyConfig(fromDigits);
      await msg.reply(
        "✅ 1.º foco do perfil atualizado.\n\n" + formatReplyConfigForWhatsApp(data)
      );
      return;
    }
    if (a0 === "foco2" || a0 === "focus2") {
      const v = parseOnOff(a1);
      if (!a1 || v === null) {
        await msg.reply(
          "Use: *foco2 ligado* ou *foco2 desligado* (também *on* / *off*)."
        );
        return;
      }
      await patchReplyConfig(fromDigits, { includeProfileInsight2: v });
      const data = await fetchReplyConfig(fromDigits);
      await msg.reply(
        "✅ 2.º foco do perfil atualizado.\n\n" + formatReplyConfigForWhatsApp(data)
      );
      return;
    }
    if (a0 === "transcript" || a0 === "transcricao" || a0 === "transcrição") {
      const mode = parseTranscriptMode(a1);
      if (!mode) {
        await msg.reply(
          "Use: *transcricao nenhuma* | *trecho* | *completa* (ou *transcript off|snippet|full*)."
        );
        return;
      }
      await patchReplyConfig(fromDigits, { transcriptMode: mode });
      const data = await fetchReplyConfig(fromDigits);
      await msg.reply(
        "✅ Transcrição por áudio atualizada.\n\n" + formatReplyConfigForWhatsApp(data)
      );
      return;
    }
    if (a0 === "profile" || a0 === "perfil") {
      if (!a1) {
        await msg.reply("Use: *perfil default* (ou outro slug, ex.: *real_estate*).");
        return;
      }
      const slug = parts[1];
      const profileType =
        String(slug)
          .replace(/[^a-z0-9_-]/gi, "")
          .slice(0, 64) || "default";
      await patchReplyConfig(fromDigits, { profileType });
      const data = await fetchReplyConfig(fromDigits);
      await msg.reply("✅ Perfil atualizado.\n\n" + formatReplyConfigForWhatsApp(data));
      return;
    }

    await msg.reply(MESSAGES.textHint);
  } catch (err) {
    const m = err && err.message ? err.message : MESSAGES.errorGeneric;
    await msg.reply("❌ " + m);
  }
}

// -----------------------------------------------------------------------------
// Batch state per chat
// -----------------------------------------------------------------------------

const chatBatchState = new Map();

function getBatchState(from) {
  if (!chatBatchState.has(from)) {
    chatBatchState.set(from, {
      pending: [],
      queued: [],
      timer: null,
      processing: false,
    });
  }
  return chatBatchState.get(from);
}

function clearFlushTimer(state) {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

/** Flush current pending and optionally add one item for next batch; then run afterBatchComplete. */
function flushThenEnqueue(from, batch, newItem, state) {
  state.processing = true;
  const onSettled = () => {
    state.processing = false;
    if (newItem) state.pending.push(newItem);
    afterBatchComplete(from);
  };
  runAudioBatch(from, batch).then(onSettled, (err) => {
    console.error("[bot] batch fatal from=" + from.replace(/@.*/, "") + " err=" + (err && err.message));
    onSettled();
  });
}

function scheduleDebounceFlush(from) {
  const state = getBatchState(from);
  clearFlushTimer(state);
  state.timer = setTimeout(() => {
    state.timer = null;
    if (state.processing || state.pending.length === 0) return;
    const batch = state.pending.splice(0);
    flushThenEnqueue(from, batch, null, state);
  }, BATCH_DEBOUNCE_MS);
}

function afterBatchComplete(from) {
  const state = getBatchState(from);
  state.processing = false;
  if (state.queued.length > 0) {
    state.pending.push(...state.queued.splice(0));
  }
  if (state.pending.length >= BATCH_MAX) {
    const batch = state.pending.splice(0, BATCH_MAX);
    state.processing = true;
    runAudioBatch(from, batch).then(
      () => afterBatchComplete(from),
      () => {
        state.processing = false;
        afterBatchComplete(from);
      }
    );
    return;
  }
  if (state.pending.length > 0) {
    scheduleDebounceFlush(from);
  }
}

async function runAudioBatch(from, batch) {
  const lastMsg = batch[batch.length - 1].message;
  const firstMsg = batch[0].message;
  const waitReply = await lastMsg.reply(MESSAGES.analyzing(batch.length));
  const fromPhoneDigits = await normalizePhoneForAuth(firstMsg);

  try {
    const text = await postAudioBatch(batch, fromPhoneDigits);
    if (text.length > WHATSAPP_MSG_LIMIT) {
      await waitReply.edit(
        text.slice(0, WHATSAPP_MSG_LIMIT) + MESSAGES.continuation
      );
      await lastMsg.reply(text.slice(WHATSAPP_MSG_LIMIT));
    } else {
      await waitReply.edit(text);
    }
  } catch (err) {
    const message = err.message || MESSAGES.errorGeneric;
    console.error("[bot] batch error", err && err.message);
    try {
      await waitReply.edit("❌ " + message);
    } catch {
      await lastMsg.reply("❌ " + message);
    }
  }
}

// -----------------------------------------------------------------------------
// Message: handle single audio (enqueue or flush)
// -----------------------------------------------------------------------------

function enqueueAudioAndSchedule(msg, from, item, state) {
  if (state.processing) {
    state.queued.push(item);
    console.log("[bot] queued audio while processing from=" + from.replace(/@.*/, ""));
    return;
  }

  const ts = item.timestamp;
  const firstPendingTs = state.pending.length > 0 ? state.pending[0].timestamp : null;

  // Window expired: flush old batch, then add current and schedule
  if (firstPendingTs != null && ts - firstPendingTs > BATCH_WINDOW_SEC) {
    clearFlushTimer(state);
    const batch = state.pending.splice(0);
    flushThenEnqueue(from, batch, item, state);
    return;
  }

  // Already at max: flush these, keep current for next
  if (state.pending.length >= BATCH_MAX) {
    clearFlushTimer(state);
    const batch = state.pending.splice(0);
    flushThenEnqueue(from, batch, item, state);
    return;
  }

  state.pending.push(item);
  scheduleDebounceFlush(from);
}

// -----------------------------------------------------------------------------
// WhatsApp client & handlers
// -----------------------------------------------------------------------------

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: wwebjsDataPath }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  },
});

// -----------------------------------------------------------------------------
// Message: phone normalization & auth (after client: needs getContactLidAndPhone)
// -----------------------------------------------------------------------------

/**
 * WhatsApp pode enviar `from` como `...@c.us` (telefone) ou `...@lid` (ID interno).
 * O número na BD deve ser o telefone; para @lid usa-se getContactLidAndPhone.
 */
async function normalizePhoneForAuth(msg) {
  const jid = String(msg.from || msg.author || "").trim();
  let digits = "";

  if (jid.toLowerCase().endsWith("@lid")) {
    try {
      if (typeof client.getContactLidAndPhone === "function") {
        const rows = await client.getContactLidAndPhone([jid]);
        const pn = rows && rows[0] && rows[0].pn;
        if (pn && typeof pn === "string") {
          const user = pn.split("@")[0] || "";
          digits = user.replace(/\D/g, "");
        }
      }
    } catch (e) {
      console.warn("[bot] getContactLidAndPhone failed", e && e.message);
    }
  }

  if (!digits) {
    try {
      const contact = typeof msg.getContact === "function" ? await msg.getContact() : null;
      if (contact && contact.number) {
        const num = String(contact.number).replace(/\D/g, "");
        if (num.length >= 10 && num.length <= 15) digits = num;
      }
    } catch (e) {
      console.warn("[bot] getContact failed", e && e.message);
    }
  }

  // Não usar o prefixo de @lid como telefone — não é o número real.
  if (!digits && jid && !jid.toLowerCase().endsWith("@lid")) {
    const userPart = jid.split("@")[0] || "";
    digits = userPart.replace(/\D/g, "");
  }

  if (digits.length === 12 && digits.startsWith("55")) {
    digits = digits.slice(0, 4) + "9" + digits.slice(4);
  }
  return digits;
}

/** JID de utilizador: sempre tem "@"; nunca rejeitar por isso. Grupos já são filtrados antes. */
function isPhoneValid(digits, rawJid) {
  if ((rawJid || "").includes("@g.us")) return false;
  if (!digits || digits.length < 10 || digits.length > 15) return false;
  return true;
}

const processedIds = new Set();

function getMessageId(msg) {
  if (msg.id && typeof msg.id === "object" && msg.id._serialized) return msg.id._serialized;
  if (typeof msg.id === "string") return msg.id;
  return `${msg.from}_${msg.timestamp || Date.now()}`;
}

client.on("qr", async (qr) => {
  console.log(
    "\n[bot] Escaneie no WhatsApp → Definições → Aparelhos ligados → Associar um aparelho."
  );
  console.log(
    "[bot] Nos logs do Railway o QR em ASCII costuma sair ilegível; use o PNG em base64 entre as marcas e converta online (base64 → imagem) ou data URL."
  );
  try {
    const dataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 320, errorCorrectionLevel: "M" });
    const base64Png = dataUrl.replace(/^data:image\/png;base64,/, "");
    console.log("[bot] QR_PNG_DATA_URL (cole no browser ou num conversor):");
    console.log(dataUrl);
    console.log("[bot] QR_PNG_BASE64_ONLY_START");
    console.log(base64Png);
    console.log("[bot] QR_PNG_BASE64_ONLY_END");
  } catch (e) {
    console.error("[bot] Falha ao gerar QR em PNG/base64:", e && e.message);
  }
  console.log("\n[bot] QR em terminal (referência local; pode falhar em logs remotos):\n");
  qrcodeTerminal.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("[bot] Conectado. Aguardando mensagens...");
});

client.on("authenticated", () => {
  console.log("[bot] Autenticado.");
});

client.on("loading_screen", (percent, message) => {
  console.log("[bot] loading_screen " + percent + "% " + (message || ""));
});

client.on("disconnected", (reason) => {
  console.error(
    "[bot] disconnected " +
      (typeof reason === "string" ? reason : JSON.stringify(reason))
  );
});

client.on("remote_session_logged_out", () => {
  console.error(
    "[bot] remote_session_logged_out — sessão invalidada no telemóvel; apague a pasta da sessão (WWEBJS_DATA_PATH ou .wwebjs_auth) e escaneie o QR de novo."
  );
});

client.on("auth_failure", (msg) => {
  console.error("[bot] auth_failure", typeof msg === "string" ? msg : JSON.stringify(msg));
});

client.on("message", async (msg) => {
  const id = getMessageId(msg);
  if (processedIds.has(id)) return;
  processedIds.add(id);
  setTimeout(() => processedIds.delete(id), DEDUP_TTL_MS);

  if (msg.fromMe) return;

  const chat = await msg.getChat();
  if (chat.isGroup) return;

  console.log(
    "[bot] mensagem recebida type=" +
      (msg.type || "?") +
      " de=" +
      String(msg.from || "").replace(/@.*/, "")
  );

  const rawFrom = msg.from || msg.author || "";
  const fromDigits = await normalizePhoneForAuth(msg);
  if (!isPhoneValid(fromDigits, rawFrom)) {
    const hint = (rawFrom || "").toLowerCase().endsWith("@lid")
      ? " (JID @lid: atualize o whatsapp-web.js ou verifique se getContactLidAndPhone devolve o número)"
      : "";
    console.log("[bot] auth rejected phone_invalid from=" + (rawFrom || "").replace(/@.*/, "") + hint);
    await msg.reply(MESSAGES.notAuthorized);
    return;
  }

  let authorized;
  try {
    authorized = await checkAuthorized(fromDigits);
  } catch (e) {
    const m = e && e.message ? String(e.message) : MESSAGES.errorGeneric;
    console.error("[bot] API indisponível em check-authorized: " + m);
    await msg.reply("❌ " + m);
    return;
  }
  console.log("[bot] auth phone=" + fromDigits + " authorized=" + authorized);
  if (!authorized) {
    await msg.reply(MESSAGES.notAuthorized);
    return;
  }

  if (msg.type === "chat" || msg.type === "text") {
    await handleConfigTextMessage(msg, fromDigits);
    return;
  }

  if (msg.type !== "ptt" && msg.type !== "audio") {
    await msg.reply(MESSAGES.sendVoice);
    return;
  }

  if (!msg.hasMedia) {
    await msg.reply(MESSAGES.downloadFailed);
    return;
  }

  let media;
  try {
    media = await msg.downloadMedia();
  } catch (e) {
    console.error("[bot] downloadMedia err=" + (e && e.message));
    await msg.reply("❌ " + MESSAGES.downloadFailed);
    return;
  }
  if (!media || !media.data) {
    await msg.reply("❌ " + MESSAGES.downloadFailed);
    return;
  }

  const item = {
    buffer: Buffer.from(media.data, "base64"),
    mimeType: media.mimetype || "audio/ogg",
    timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
    message: msg,
  };
  const from = msg.from;
  const state = getBatchState(from);

  enqueueAudioAndSchedule(msg, from, item, state);
});

client.initialize().catch((err) => {
  console.error("[bot] startup failed", err && err.message);
  process.exit(1);
});
