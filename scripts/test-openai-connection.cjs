/**
 * Testa a conexão com a API da OpenAI usando o token do .env.local.
 * Rode: npm run test:openai
 *
 * Verifica:
 * 1. URL base e token
 * 2. GET /v1/models (conexão simples)
 * 3. POST /v1/audio/transcriptions com áudio de exemplo (se audios/teste_1.ogg existir)
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

function log(title, data) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
  if (typeof data === "object") console.log(JSON.stringify(data, null, 2));
  else console.log(data);
}

async function main() {
  console.log("\n[test-openai] Diagnóstico da conexão com a API OpenAI\n");

  if (!OPENAI_API_KEY) {
    log("ERRO", "OPENAI_API_KEY não encontrada no .env.local");
    process.exit(1);
  }

  const keyPreview =
    OPENAI_API_KEY.slice(0, 7) + "..." + OPENAI_API_KEY.slice(-4);
  log("Configuração", {
    OPENAI_API_KEY: keyPreview,
    OPENAI_BASE_URL,
    hasCustomBaseUrl: !!process.env.OPENAI_BASE_URL,
  });

  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };

  // Teste 1: GET /v1/models (conexão simples, sem upload)
  try {
    const url = OPENAI_BASE_URL.replace(/\/v1\/?$/, "") + "/v1/models";
    log("Teste 1: GET " + url, "");
    const res = await fetch(url, { method: "GET", headers });
    const text = await res.text();
    log(
      "Resposta GET /v1/models",
      {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        bodyPreview: text.slice(0, 200) + (text.length > 200 ? "..." : ""),
      }
    );
    if (!res.ok) {
      log("Corpo completo da resposta", text);
      throw new Error(`GET models falhou: ${res.status} ${res.statusText}`);
    }
    console.log("  -> OK: conexão com a API funcionando (listagem de modelos).");
  } catch (e) {
    log("Falha no Teste 1", {
      message: e.message,
      cause: e.cause ? { message: e.cause.message, code: e.cause.code } : null,
      stack: e.stack,
    });
    console.error("\nPossíveis causas: URL errada (OPENAI_BASE_URL), rede, proxy ou firewall.\n");
    process.exit(1);
  }

  // Teste 2: POST /v1/audio/transcriptions (igual ao Whisper que o app usa)
  const audioPath = path.join(__dirname, "..", "audios", "teste_1.ogg");
  if (!fs.existsSync(audioPath)) {
    console.log("\n[test-openai] audios/teste_1.ogg não encontrado; pulando teste de transcrição.");
    console.log("\nResumo: GET /v1/models OK. Token e URL base estão corretos.\n");
    process.exit(0);
  }

  try {
    const url = OPENAI_BASE_URL.replace(/\/v1\/?$/, "") + "/v1/audio/transcriptions";
    log("Teste 2: POST " + url + " (Whisper)", "");

    const form = new FormData();
    const buffer = fs.readFileSync(audioPath);
    const blob = new Blob([buffer], { type: "audio/ogg" });
    form.append("file", blob, "teste_1.ogg");
    form.append("model", "whisper-1");
    form.append("response_format", "text");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        // não definir Content-Type; o fetch define com boundary para multipart
      },
      body: form,
    });

    const text = await res.text();
    log("Resposta POST /v1/audio/transcriptions", {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      bodyPreview: text.slice(0, 300) + (text.length > 300 ? "..." : ""),
    });

    if (!res.ok) {
      log("Corpo completo da resposta", text);
      let errMsg = `Whisper falhou: ${res.status} ${res.statusText}`;
      try {
        const errJson = JSON.parse(text);
        if (errJson.error?.code === "insufficient_quota") {
          errMsg =
            "QUOTA ESGOTADA: sua conta OpenAI não tem créditos. " +
            "Acesse https://platform.openai.com/account/billing e adicione um método de pagamento ou aguarde a renovação do plano.";
        }
      } catch (_) {}
      throw new Error(errMsg);
    }

    console.log("  -> OK: transcrição funcionando. Texto retornado:", text.slice(0, 80) + "...");
  } catch (e) {
    log("Falha no Teste 2 (Whisper)", {
      message: e.message,
      cause: e.cause ? { message: e.cause.message, code: e.cause.code } : null,
    });
    if (e.message && e.message.includes("QUOTA")) {
      console.error("\n  Solução: platform.openai.com → Billing → adicionar pagamento ou verificar uso.\n");
    } else {
      console.error("\nECONNRESET indica problema de rede durante o upload. Tente outra rede ou desativar VPN.\n");
    }
    process.exit(1);
  }

  console.log("\n[test-openai] Todos os testes passaram. API e token OK.\n");
}

main();
