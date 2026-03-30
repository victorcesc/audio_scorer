# WhatsApp bot — batch de áudios (uma resposta)

## Purpose

Quando o utilizador **encaminha vários áudios** seguidos, o bot deve responder **uma vez** com análise agregada (Whisper por ficheiro + uma qualificação GPT sobre o conjunto).

## Source of truth files

| Piece | Path |
|-------|------|
| Bot (debounce, fila, POST) | `whatsapp-bot/index.cjs` |
| API batch | `app/api/bot/analyze-audio-batch/route.ts` |
| Pipeline | `lib/analyze-audio.ts` — `analyzeAudioBatch` (Whisper + GPT agregado) |
| Prompts multi-áudio | `lib/prompts/qualification.ts` — `QUALIFICATION_BATCH_*` |

## Current implementation snapshot

- **Bot:** estado por `msg.from`: `pending[]`, `queued[]`, timer 4 s, `processing`. Máx. **5** áudios por lote; se chega o 6.º, processa os 5 primeiros e o 6.º inicia novo lote. Se passam **>30 s** desde o primeiro áudio pendente e chega outro, descarrega o lote antigo primeiro.
- **API:** JSON `{ fromPhone: string, items: [{ audio: base64, mimeType?, timestamp?, filename? }] }` (1–5 itens). **`fromPhone`** recomendado: dígitos do remetente; sem ele, formato de resposta legado (padrão completo). `maxDuration = 300`. Erros user-facing enquanto possível em **português (Brasil)** no batch route (alinhado às regras do projeto).
- **Lib:** Whisper com concorrência **2**; falhas parciais aparecem no texto final; se todos falham, mensagem só com erros.

## Phase scope (plan 20260318120000)

**Implemented:** debounce bot, batch endpoint, lib batch, docs.

**Not implemented (v1 plan):** fila assíncrona, persistência em `leads`, dashboard multi-upload.

## Invariants and gotchas

- **Um áudio isolado** espera **4 s** após a receção antes da API (debounce). Não alterar sem documentar — UX tradeoff.
- **4096** limite WhatsApp: bot corta em **3800** + segunda mensagem “continuação”.
- **Timestamps:** API formata rótulos em `America/Sao_Paulo` (helpers internos em `lib/analyze-audio.ts`).

## Safe change checklist for future AI work

- Ajustar debounce: constantes no topo de `whatsapp-bot/index.cjs` (`BATCH_DEBOUNCE_MS`, `BATCH_MAX`, `BATCH_WINDOW_SEC`).
- Aumentar lote: alinhar `BATCH_MAX_ITEMS` em `lib/analyze-audio.ts` com o bot e validação da rota.
- Novo cliente HTTP que replique o bot deve usar o contrato batch (`/api/bot/analyze-audio-batch`).

## Related plan and docs

- [docs/plans/20260318120000-multi-audio-batch-plan.md](../plans/20260318120000-multi-audio-batch-plan.md)
- [docs/WHATSAPP-BOT-FLOW.md](../WHATSAPP-BOT-FLOW.md)
