# Brainstorm: Vários áudios encaminhados → **uma** resposta (whatsapp-bot)

## 1. What We're Building

**Pergunta do produto:** O utilizador encaminha **~5 áudios de uma vez** para o bot (whatsapp-web.js). Em vez de o bot responder **5 vezes** (comportamento atual: 1 evento → 1 API → 1 mensagem), queremos **uma única mensagem** com o resultado agregado.

**É possível?** **Sim.** O WhatsApp entrega cada áudio como **mensagem separada**; o bot não recebe “um pacote com 5 ficheiros”. A solução é **não responder por mensagem**: acumular áudios numa **janela de agrupamento** (debounce após o último áudio) e só então chamar a API **uma vez** com N ficheiros e enviar **uma** resposta (ex.: editar um único “⏳ A analisar…” ou enviar um texto consolidado).

Cada áudio continua a exigir **uma chamada Whisper** (API OpenAI = 1 ficheiro por pedido). O texto final junta transcrições (e opcionalmente qualificação GPT) com **identificação por timestamp** de cada mensagem (`msg.timestamp` no whatsapp-web.js) ou por ordem (1/5, 2/5…).

**Fora de escopo imediato (opcional mais tarde):** multi-upload no dashboard; pode reutilizar o mesmo endpoint batch.

---

## 2. Current State

### Backend

| Area | Path | Behavior |
|------|------|----------|
| Core pipeline | `lib/analyze-audio.ts` | `analyzeAudioBuffer()` → `whisper-1` + `gpt-4o-mini`; `MAX_AUDIO_SIZE_BYTES` (25MB); `withRetry` |
| Prompts | `lib/prompts/qualification.ts` | Qualification from transcript |
| Types | `lib/types.ts` | `LeadQualification`, `Lead` |
| Dashboard API | `app/api/analyze-audio/route.ts` | `POST`, campo `audio`, resposta única; `maxDuration = 60` |
| Bot API | `app/api/bot/analyze-audio-batch/route.ts` | 1–N áudios por pedido → `{ text }`; `maxDuration = 300` |

### Bot (cliente)

| Path | Behavior **hoje** |
|------|-------------------|
| `whatsapp-bot/index.cjs` | *(estado atual)* debounce + lote → `POST /api/bot/analyze-audio-batch` → uma resposta agregada. |

### DB / docs

- `supabase/migrations/001_leads.sql` — um lead por análise (batch pode gerar N linhas ou 1 linha agregada — decisão em `/plan`).
- `docs/WHATSAPP-BOT-FLOW.md` — fluxo bot → API.
- API oficial Meta (webhook) **removida** do repo; só whatsapp-web.js.

---

## 3. Architecture & Infrastructure

### Camada 1 — `whatsapp-bot/` (agrupamento)

- Manter **Mapa por chat** (ex.: `chatId` → lista pendente: `{ buffer, mimeType, timestamp }[]`).
- Ao chegar um áudio (ptt/audio): **não** chamar a API de imediato; **adicionar à lista** e **reiniciar um timer** (debounce: ex. 2–5 s após o **último** áudio).
- Quando o timer dispara: se houver 1 item → pode usar fluxo atual ou batch unificado; se N itens → **um** `POST` com N áudios (novo endpoint).
- **Uma** mensagem de espera por lote (ex.: criar/atualizar só no início do lote ou no flush).
- **Limites no bot:** máx. **5** (ou 6) itens por lote; máx. tempo desde o primeiro áudio (ex. 30 s) para evitar fundir dois envios distintos.
- **Concorrência:** ignorar ou enfileirar novos áudios enquanto um lote desse chat está “a processar”.

### Camada 2 — API (novo endpoint recomendado)

- **`POST /api/bot/analyze-audio-batch`** (ou nome equivalente): body com array de `{ audio: base64, mimeType?, timestamp? }` (ou multipart múltiplo), header `X-Bot-Token`, **cap** de N ficheiros e tamanho total.
- Servidor: para cada item → Whisper (+ GPT conforme estratégia); montar **um** `text` com secções por timestamp/ordem; devolver `{ text }` (mesmo formato consumível pelo bot).
- **`maxDuration`:** 5× pipeline pode exceder 60 s → subir limite (Vercel/Railway), **Whisper em paralelo** com concorrência limitada (ex. 2–3), ou fila + segunda mensagem “resultado pronto” (fase 2).

### Whisper (factos)

- **N áudios = N pedidos** à API de transcrição.
- Custo ≈ minutos totais + N qualificações GPT; paralelismo não altera o custo total, aumenta risco de 429.

### Limite WhatsApp

- Texto **4096** caracteres; transcrições longas podem exigir **2.ª mensagem** ou trechos truncados por áudio.

---

## 4. Integration Impact

| Layer | Impact |
|-------|--------|
| **whatsapp-bot** | Nova lógica de **buffer + debounce + flush**; novo `postAudioBatch()`; UX **1 resposta/lote**. |
| **Bot API** | Endpoint batch único (`/api/bot/analyze-audio-batch`); rota single-audio do bot removida depois. |
| **lib/analyze-audio** | Reutilizar `analyzeAudioBuffer` por ficheiro; função auxiliar para **formatar** multi-bloco (timestamps). |
| **Dashboard** | Opcional; não bloqueia v1. |
| **DB** | Opcional N inserts ou 1 registo agregado. |

---

## 5. Key Decisions

1. ✅ **DECIDED:** **Sim**, 5 encaminhados podem gerar **1 mensagem** — via **janela de agrupamento no bot** + **uma chamada API** com N áudios + texto merged.
2. ✅ **DECIDED:** **N Whisper calls** por lote; resposta única com secções por **timestamp** (ou ordem).
3. ✅ **DECIDED:** Implementação **whatsapp-bot primeiro**; endpoint batch dedicado; rota single-audio **inalterada** para compatibilidade.
4. ✅ **DECIDED:** Problema “5 eventos seguidos” resolve-se com **debounce após último áudio**, não com webhook Meta.
5. ⚠️ **OPEN:** Valores exatos — **silêncio** após último áudio (2 s vs 5 s), **máx. áudios** (5 fixo?), **máx. duração do lote**.
6. ⚠️ **OPEN:** **GPT** — uma qualificação sobre transcrições concatenadas vs N qualificações e resumo na mensagem.
7. ⚠️ **OPEN:** **Timeout** — aumentar `maxDuration`, paralelizar Whisper (com teto), ou job assíncrono + 2 mensagens.

---

## 6. Open Questions

1. Janela de debounce e caps (tempo / contagem) finais.
2. Estratégia GPT (1 vs N) e formato do texto para o utilizador.
3. Comportamento se **1 áudio falhar** no lote (falhar tudo vs partial success na mesma mensagem).
4. Persistência em `leads` (N linhas vs uma linha com JSON).

*Se não houver preferência: debounce 3–4 s, máx. 5 áudios, Whisper paralelo 2, uma GPT no texto completo etiquetado.*

---

## 7. Next Steps

- **`/plan`** com este ficheiro: implementar debounce em `whatsapp-bot/index.cjs`, `POST /api/bot/analyze-audio-batch`, formatação multi-timestamp, limites e `maxDuration`/paralelismo.
- Testar encaminhar 5 áudios curtos e validar uma única resposta.

**Prerequisites:** Nenhum além de OpenAI; opcional fila/storage se a fase 1 estourar timeout.
