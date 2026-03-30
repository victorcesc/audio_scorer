---
title: "Bot reply configuration per WhatsApp number (DB + API + WhatsApp chat)"
type: enhancement
status: active
date: 2026-03-18
phased: true
---

## Overview

**Problem:** Every bot reply includes *Resumo*, *Score*, *BANT*, *Próximo passo*, and per-audio transcript snippets. Different professions need different blocks (e.g. hide BANT/score); some want more transcript, some none.

**Solution:** Persist a per-phone **reply format** in Supabase (`authorized_whatsapp_numbers.bot_config` JSONB). The batch analysis route loads it by `fromPhone` and formats output accordingly. The WhatsApp bot sends the sender’s normalized digits on each batch request and implements a **text command / menu** to read and update config (same contract a future dashboard will use). **Summary** and **Next step** stay always on.

**Source:** [docs/brainstorms/20260318140000-bot-config-by-profession-brainstorm.md](../brainstorms/20260318140000-bot-config-by-profession-brainstorm.md)

**Locked defaults (resolves brainstorm open items for this plan):**

| Topic | Choice |
|-------|--------|
| `bot_config` null/absent | Same as today: `includeScore=true`, `includeBant=true`, `transcriptMode=snippet`, `profileType=default` |
| Transcription | `transcriptMode`: `off` \| `snippet` \| `full` (per-audio section; snippet uses existing ~150 char cap; full sends full Whisper text per clip — bot split at 3800 unchanged) |
| Profile (v1) | `profileType` stored as string slug only for future GPT; **no** extra qualification fields in v1 |
| User-facing copy (new strings) | **Português (Brasil)** — cliente final no Brasil |
| Auth for config API | v1: `X-Bot-Token` only; dashboard later: separate route or PATCH with Supabase session + phone linkage |

---

## Scope / Work Breakdown

| Group | Contents | Phase |
|-------|----------|-------|
| Data | SQL migration, types, merge defaults | 1 |
| Server utilities | `normalizeBotConfig`, load/save via admin client | 1 |
| HTTP | `GET`/`PATCH` bot reply-config; batch route loads config by phone | 2–3 |
| Library | `analyzeAudioBatch` + formatters accept `BotReplyFormat` | 3 |
| WhatsApp client | Send `fromPhone` on batch; text menu for config | 4 |
| Docs | `WHATSAPP-BOT-FLOW.md`, bot README, feature doc, README raiz | 5–6 |

---

## Proposed Solution

### Data model

- Table `authorized_whatsapp_numbers` — add nullable column:

```sql
bot_config jsonb default null
```

- JSON shape (stored merged with defaults in application code never written back unless PATCH):

```typescript
// lib/bot-config.ts (conceptual)
export type TranscriptMode = "off" | "snippet" | "full";

export type BotReplyFormat = {
  profileType: string; // default "default" — slugs: default | real_estate | insurance | b2b_sales | hr_recruiting | professional_services | commercial_inbound | healthcare
  includeScore: boolean;
  includeBant: boolean;
  transcriptMode: TranscriptMode;
};
```

### Flow

1. **Activate:** `POST /api/activate` envia `profileType` (uma das profissões em `lib/activation-professions.ts`) e faz `upsert` de `phone` + `bot_config` normalizado; utilizador escolhe a profissão na página `/ativar`.
2. **Audio batch:** Client POST body includes `fromPhone` (digits, any format) → server `normalizeBrazilianPhone` → `SELECT bot_config FROM authorized_whatsapp_numbers WHERE phone IN (variants)` (reuse variant strategy from check-authorized or shared helper) → `normalizeBotConfig(row?.bot_config)` → `analyzeAudioBatch(items, format)` → formatted `{ text }`.
3. **Config via chat:** User sends text e.g. `config` or `menu` → bot calls `GET /api/bot/reply-config?phone=...` → replies **in Portuguese** with instructions; user sends commands (e.g. `score off`, `bant on`, `transcript full` or numeric menu — defined in implementation) → `PATCH /api/bot/reply-config` with partial JSON → bot confirms in Portuguese.

### Security

- All new routes require bot token (same as batch).
- **PATCH/GET** must verify phone is authorized (same variant matching as `check-authorized`) before returning or writing config; return `404` with message in Portuguese (e.g. "Não encontrado.") for unauthorized phone (do not leak existence).
- Do not allow PATCH to change `phone` to another user’s number without authorization check on target phone.

---

## Technical Considerations

- **Supabase:** Use `createAdminClient()` from `lib/supabase/admin.ts` (service role) — consistent with `app/api/activate/route.ts` and `check-authorized`.
- **Phone normalization:** Reuse `normalizeBrazilianPhone` from `lib/phone.ts`; consider extracting **variant list** builder from `app/api/bot/check-authorized/route.ts` into `lib/phone.ts` (e.g. `getBrazilianPhoneLookupVariants(digits: string): string[]`) to avoid triple duplication across check-authorized, batch, reply-config.
- **Breaking change mitigation:** If `fromPhone` missing on batch POST, use **default** `BotReplyFormat` (current behavior) and optional server log once; bot MUST send `fromPhone` after deploy.
- **No new unit/E2E tests** (project convention) unless already required — manual QA listed in checklist.
- **GPT:** Keep single BANT qualification prompt; omit score/BANT **lines** in formatted output when flags false (still parse JSON with score/bant from model).
- **Idioma:** Texto para o usuário final em **português (Brasil)** — ver `.cursor/rules/pt-br-user-facing.mdc`.

---

## Acceptance Criteria

**Given** the bot is authorized and `fromPhone` is sent on batch:

- **AC1:** When `bot_config` is null, batch reply matches current layout (summary, score, BANT, next step, per-audio snippets).
- **AC2:** When `includeScore` is false, no `*Score:*` line in the WhatsApp text.
- **AC3:** When `includeBant` is false, no `*BANT:*` line (even if model returns reasons).
- **AC4:** When `transcriptMode=off`, no `---` / `*Por áudio:*` body; header still has summary + next step; failed clips still show errors OR only header — **decide in implementation: show error lines for failed transcriptions even if transcript off** (recommended: yes, user still needs to know a clip failed).
- **AC5:** When `transcriptMode=full`, per-audio body uses full transcript (not 150-char truncate).
- **AC6:** Unauthorized phone cannot read/update config via reply-config API.
- **AC7:** User can change config from WhatsApp text flow and subsequent audio analysis reflects new settings.

**Edge:** Batch with only failures → same as today (error message); config must not break that path.

---

## Implementation Plan

| Phase | Name | Depends On | Status |
|-------|------|------------|--------|
| 1 | Schema + `BotReplyFormat` helpers | None | ✅ Completed |
| 2 | Phone variants helper + reply-config API | Phase 1 | ✅ Completed |
| 3 | Batch pipeline + formatters | Phase 1 | ✅ Completed |
| 4 | Wire batch route: phone → DB → `analyzeAudioBatch` | Phase 2–3 | ✅ Completed |
| 5 | WhatsApp bot: `fromPhone` + config chat UX | Phase 4 | ✅ Completed |
| 6 | Documentation | Phase 5 | ✅ Completed |

---

### Phase 1: Schema + `BotReplyFormat` helpers

**Status**: ✅ Completed  
**Objective:** Store nullable JSON config and centralize defaults/normalization in TypeScript.

**Tasks**:

1. **SQL migration** (`supabase/migrations/004_bot_config.sql`):
   - `alter table public.authorized_whatsapp_numbers add column if not exists bot_config jsonb;`
   - No RLS change (table already service-role–oriented like 003).
   - Operator runs `node scripts/run-supabase-migrations.cjs` (or project’s documented apply path) after merge.

2. **`BotReplyFormat` module** (`lib/bot-config.ts`):
   - Export types `TranscriptMode`, `BotReplyFormat`.
   - Export `DEFAULT_BOT_REPLY_FORMAT: BotReplyFormat` with `profileType: "default"`, `includeScore: true`, `includeBant: true`, `transcriptMode: "snippet"`.
   - Export `normalizeBotConfig(input: unknown): BotReplyFormat` — accepts partial object; validates booleans and `transcriptMode` enum; fills defaults; invalid keys ignored.

**After completing this phase:** `npm run build` at repo root; fix TS errors.

---

### Phase 2: Phone variants + reply-config API

**Status**: ✅ Completed  
**Objective:** Single lookup key list for DB queries; secured read/write of `bot_config`.

**Tasks**:

1. **Phone variants helper** (`lib/phone.ts`):
   - Add `getBrazilianPhoneLookupVariants(digits: string): string[]` — port logic from `app/api/bot/check-authorized/route.ts` (lines building `variants` from normalized + 55 strip + mobile-9 variant).
   - Refactor `app/api/bot/check-authorized/route.ts` to use this helper (behavior unchanged).

2. **`GET /api/bot/reply-config`** (`app/api/bot/reply-config/route.ts`):
   - Auth: same `validateBotToken` pattern as `analyze-audio-batch`.
   - Query `phone` required; normalize; loop variants `maybeSingle` on `authorized_whatsapp_numbers` selecting `phone, bot_config`; if no row → `404` JSON `{ error: "Não encontrado." }`.
   - Response `{ replyFormat: BotReplyFormat }` using `normalizeBotConfig`.

3. **`PATCH /api/bot/reply-config`** (`app/api/bot/reply-config/route.ts`):
   - Auth: bot token.
   - Body JSON: `{ phone: string, patch: Partial<{ profileType, includeScore, includeBant, transcriptMode }> }`.
   - Resolve row by variants; if none authorized → 404.
   - Read current `bot_config` from DB, merge with `patch`, run `normalizeBotConfig`, write **subset** back as JSON (store only non-default keys **or** store full normalized object — **choose full normalized object** for simpler debugging).
   - Response `{ replyFormat: BotReplyFormat }`.

**After completing this phase:** `npm run build`.

---

### Phase 3: Batch pipeline + formatters

**Status**: ✅ Completed  
**Objective:** Formatting respects `BotReplyFormat`; GPT output unchanged.

**Tasks**:

1. **Formatting** (`lib/analyze-audio.ts`):
   - Export type import of `BotReplyFormat` from `@/lib/bot-config` (or pass as parameter type).
   - Replace internal `formatBatchAnalysisForWhatsApp` with `formatBatchAnalysisForWhatsApp(qualification, sections, format: BotReplyFormat)`:
     - Header: keep **Portuguese** labels consistent with the product today (`📋 *Análise*`, `*Resumo:*`, `*Score:*`, `*BANT:*`, `*Próximo passo:*`, `*Por áudio:*`).
     - Conditionally include score/BANT lines.
     - Body: if `transcriptMode === "off"`, omit per-audio success snippets; **keep** failed transcriptions as error lines.
     - If `snippet`, keep `BATCH_TRANSCRIPT_SNIPPET_LENGTH`; if `full`, pass full text in `sections` (adjust `buildBatchSections` to take max snippet length or build two code paths).
   - Change `analyzeAudioBatch(items, format: BotReplyFormat)` to pass `format` into formatter; build sections with appropriate truncation per clip.

2. **Exports:** Ensure `analyzeAudioBatch` is the single entry used by route; signature `(items, format = DEFAULT_BOT_REPLY_FORMAT)` optional default.

**After completing this phase:** `npm run build`.

---

### Phase 4: Batch route wiring

**Status**: ✅ Completed

**Objective:** Resolve config from DB per request.

**Tasks**:

1. **`app/api/bot/analyze-audio-batch/route.ts`**:
   - After parsing JSON body, read optional `fromPhone` (string). If absent, use `DEFAULT_BOT_REPLY_FORMAT` (and optional `console.warn` in development only if desired).
   - If present: normalize + `createAdminClient` + lookup authorized row via variants + `normalizeBotConfig(row.bot_config)`.
   - Call `analyzeAudioBatch(parsed.items, format)`.

2. **Validation:** Reject `fromPhone` invalid (empty after strip) with `400` and **mensagem em português** (ex.: número obrigatório); bot must always send a valid phone after deploy.

**After completing this phase:** `npm run build`.

---

### Phase 5: WhatsApp bot client

**Status**: ✅ Completed  

**Objective:** Send phone; replace plain “text not allowed” with config flow.

**Tasks**:

1. **`postAudioBatch`** (`whatsapp-bot/index.cjs`):
   - Add parameter `fromPhoneDigits` (normalized string without `@`).
   - POST body: `{ items, fromPhone: fromPhoneDigits }`.

2. **`runAudioBatch`**:
   - Pass digits into `postAudioBatch` (capture from first message in batch via existing normalization — same as auth path).

3. **Text messages** (`msg.type === "chat"`):
   - If message is `help`, `config`, `menu` (case-insensitive), reply with **Portuguese** instructions listing commands (e.g. `score on|off`, `bant on|off`, `transcript off|snippet|full`, `profile default|real_estate|...`, `show` for current settings).
   - Parse simple commands; call `GET`/`PATCH` `reply-config` using `apiRequest` with new URL `new URL("/api/bot/reply-config", API_URL)`.
   - Unknown text: reply short hint `Send a voice note to analyze, or type "config" for bot settings.`

4. **`MESSAGES`**: Update `textNotAllowed` usage — remove or repurpose; ensure user-facing strings for new flow are **Portuguese (Brazil)**.

**After completing this phase:** Manual test: audio still works; `config` shows settings; toggles persist after Supabase write.

---

### Phase 6: Documentation

**Status**: ✅ Completed  
**Objective:** Operators know env, migration, and UX.

**Tasks**:

1. **`docs/WHATSAPP-BOT-FLOW.md`**: Document `fromPhone` on batch body; `reply-config` endpoints; config commands in Portuguese.
2. **`whatsapp-bot/README.md`**: Same summary.
3. **`docs/features/bot-reply-config.md`** (new): JSON schema, defaults, profile slugs (future use), dashboard hook note.

**After completing this phase:** Review links from main README if appropriate (one line).

---

## ✅ Master Checklist

### Phase 1: Schema + helpers
- [x] Add `supabase/migrations/004_bot_config.sql` with `bot_config jsonb`
- [x] Add `lib/bot-config.ts` (`DEFAULT_BOT_REPLY_FORMAT`, `normalizeBotConfig`)
- [x] Build passes

### Phase 2: Phone + reply-config API
- [x] Add `getBrazilianPhoneLookupVariants` to `lib/phone.ts`
- [x] Refactor `app/api/bot/check-authorized/route.ts` to use helper
- [x] Add `app/api/bot/reply-config/route.ts` (`GET`, `PATCH`)
- [x] Build passes

### Phase 3: Analyze + format
- [x] Update `lib/analyze-audio.ts` (`formatBatchAnalysisForWhatsApp`, `buildBatchSections`, `analyzeAudioBatch`)
- [x] Portuguese labels / conditional blocks per `BotReplyFormat`
- [x] Build passes

### Phase 4: Batch route
- [x] Parse `fromPhone` in `app/api/bot/analyze-audio-batch/route.ts` + Supabase load
- [x] Build passes

### Phase 5: Bot
- [x] `whatsapp-bot/index.cjs`: `fromPhone` in body + text config commands + `apiRequest` to reply-config
- [ ] Manual QA (audio + config + toggle + second audio) — operador

### Phase 6: Docs
- [x] `docs/WHATSAPP-BOT-FLOW.md`, `whatsapp-bot/README.md`, `docs/features/bot-reply-config.md`, linha no README raiz (`bot_config` / `reply-config`)


## Implementation status

| Milestone | Status |
|-----------|--------|
| Phase 1 | ✅ Completed |
| Phase 2 | ✅ Completed |
| Phase 3 | ✅ Completed |
| Phase 4 | ✅ Completed |
| Phase 5 | ✅ Completed |
| Phase 6 | ✅ Completed |

## Commit

After implementation: `[TICKET-XXXX] ✨ feat(bot): per-phone reply config and WhatsApp config commands` (ask ticket before commit per project rules).
