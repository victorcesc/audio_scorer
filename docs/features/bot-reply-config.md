# Feature: Configuração do formato de resposta do bot (por número)

## Purpose

Permitir que cada número autorizado no WhatsApp tenha um formato de resposta configurável (score, BANT, transcrição por áudio: off/snippet/full), persistido no Supabase, sem mudar o pipeline GPT na v1.

## Source of Truth Files

| Artefato | Caminho |
|----------|---------|
| Tipos e normalização | `lib/bot-config.ts` |
| Lookup BD | `lib/bot-authorized-phone.ts` |
| Pipeline batch | `lib/analyze-audio.ts` |
| API batch + `fromPhone` | `app/api/bot/analyze-audio-batch/route.ts` |
| API config | `app/api/bot/reply-config/route.ts` |
| Cliente WhatsApp | `whatsapp-bot/index.cjs` |
| Plano | `docs/plans/20260318160000-bot-reply-config-per-phone-plan.md` |

## Current implementation snapshot

- **BD:** `authorized_whatsapp_numbers.bot_config` (JSONB, nullable). Migração: `supabase/migrations/004_bot_config.sql`. Merge com defaults: `getEffectiveBotReplyFormat` / `normalizeBotConfig` em `lib/bot-config.ts`.
- **Ativação:** em `/ativar`, o utilizador escolhe **modo normal** (`default`) ou uma das **três profissões** do brainstorm (§3). O `POST /api/activate` envia `profileType` (`default` \| `real_estate` \| `insurance` \| `b2b_sales`) e grava `bot_config` normalizado. Lista canónica: `lib/activation-professions.ts`.
- **`POST /api/bot/analyze-audio-batch`:** aceita **`fromPhone`** (string com dígitos). Se **omitido** ou inválido vazio → formato **padrão** (`DEFAULT_BOT_REPLY_FORMAT`) para clientes legados; se **presente e válido** → lookup em `authorized_whatsapp_numbers` via variantes (Brasil); **404** se não existir linha autorizada. O bot em produção **envia sempre** `fromPhone`.
- **`GET` / `PATCH /api/bot/reply-config`:** mesmo token de bot que batch; **404** `Não encontrado.` se o número não estiver autorizado.
- **`whatsapp-bot/index.cjs`:** `postAudioBatch(batch, fromPhoneDigits)` com `{ items, fromPhone }`; `handleConfigTextMessage` para comandos PT-BR (e aliases em inglês onde indicado).

## JSON schema (`bot_config` / `BotReplyFormat`)

Definido em `lib/bot-config.ts`. Campos aceites em `PATCH` dentro de `patch`:

| Campo | Tipo | Significado |
|-------|------|-------------|
| `profileType` | `string` | Slug do perfil (metadado para evolução dos prompts). Valores de exemplo no plano: `default`, `real_estate`, … — v1 grava qualquer slug normalizado (alfanumérico + `_`/`-`, limite prático no bot). |
| `includeScore` | `boolean` | Incluir linha de score na mensagem |
| `includeBant` | `boolean` | Incluir linha BANT |
| `includeProfileInsight1` | `boolean` | Incluir 1.º bloco do perfil (rótulo em `lib/profile-insights.ts` por `profileType`) |
| `includeProfileInsight2` | `boolean` | Incluir 2.º bloco do perfil |
| `transcriptMode` | `"off" \| "snippet" \| "full"` | Por áudio: sem transcrição / trecho truncado / transcrição completa do Whisper |

**Defaults (`DEFAULT_BOT_REPLY_FORMAT`):** `profileType: "default"`, `includeScore: true`, `includeBant: true`, `includeProfileInsight1: true`, `includeProfileInsight2: true`, `transcriptMode: "snippet"`.

**GPT:** o JSON de qualificação inclui sempre `profileInsight1` e `profileInsight2`; o *system prompt* varia com `profileType` (`lib/prompts/qualification.ts` + `lib/profile-insights.ts`).

**Trecho (`snippet`):** truncado com `BATCH_TRANSCRIPT_SNIPPET_LENGTH` (**150** caracteres) em `lib/analyze-audio.ts` — alinhar docs se esse valor mudar.

**Invariável na saída formatada:** *Resumo* e *próximo passo* sempre presentes; score/BANT/blocos *Por áudio* seguem a config. Falhas de transcrição: mantêm linhas de erro mesmo com `transcriptMode: "off"` (utilizador precisa saber que um clip falhou).

**Exemplo `GET` (resposta):**

```json
{
  "replyFormat": {
    "profileType": "default",
    "includeScore": true,
    "includeBant": true,
    "transcriptMode": "snippet"
  }
}
```

**Exemplo `PATCH` (corpo):**

```json
{
  "phone": "5548999123456",
  "patch": {
    "includeScore": false,
    "transcriptMode": "full"
  }
}
```

## Comandos no WhatsApp (texto)

Ver também [docs/WHATSAPP-BOT-FLOW.md](../WHATSAPP-BOT-FLOW.md) § 7 e [whatsapp-bot/README.md](../../whatsapp-bot/README.md).

| Intenção | Exemplos |
|----------|----------|
| Ajuda | `config`, `menu`, `help`, `ajuda` |
| Ver config | `mostrar`, `show`, `ver` |
| Score | `score ligado` / `score desligado` (ou `on` / `off`) |
| BANT | `bant ligado` / `bant desligado` |
| Focos do perfil | `foco1 ligado` / `foco1 desligado`, `foco2 …` (ou `focus1` / `focus2`) — nomes dos blocos em *mostrar* |
| Transcrição | `transcricao nenhuma` \| `trecho` \| `completa` (ou `transcript off\|snippet\|full`) |
| Perfil | `perfil default`, `perfil insurance`, `perfil real_estate`, … (ou `profile …`) |

## Dashboard / futuro

- **v1:** configuração via **comandos no WhatsApp** ou HTTP autenticado (`GET`/`PATCH reply-config`). Não há UI neste repositório para editar `bot_config`.
- **Futuro:** dashboard administrativo pode reutilizar o mesmo contrato e `normalizeBotConfig`.

## Phase scope (plan 20260318160000)

| Phase | Estado |
|-------|--------|
| 1–6 | ✅ Concluída — incl. documentação operacional (WHATSAPP flow, README do bot, este ficheiro, README raiz). |

## Invariants and gotchas

- **`fromPhone` na batch:** recomendado para o bot; omissão = legado com defaults completos. Se enviado e número não autorizado → **404**.
- Comandos usam `msg.body` normalizado para tokens; *perfil* valida slug no bot (regex + tamanho).
- `apiRequest` no bot envia `X-Bot-Token`; erros da API são mostrados com prefixo `❌`.
- Incoerência teórica: `check-authorized` vs somente `authorized_whatsapp_numbers` — se houver divergência de dados entre fluxos, tratar no produto.

## Safe change checklist for future AI work

1. Novos comandos: estender `handleConfigTextMessage` e ajuda em `whatsapp-bot/index.cjs`.
2. Mudar contrato PATCH/GET: alinhar bot, `lib/bot-config.ts` e esta doc.
3. Mudar truncamento de snippet: atualizar `BATCH_TRANSCRIPT_SNIPPET_LENGTH` e referência aqui.

## Related plan and docs

- [Plano](../plans/20260318160000-bot-reply-config-per-phone-plan.md)
- [Brainstorm](../brainstorms/20260318140000-bot-config-by-profession-brainstorm.md)
- [WHATSAPP-BOT-FLOW.md](../WHATSAPP-BOT-FLOW.md) — § 7
- [whatsapp-bot-batch.md](whatsapp-bot-batch.md)
