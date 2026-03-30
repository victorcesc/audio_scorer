# Plan: Batch audio analysis (whatsapp-bot → one reply)

**Source:** [docs/brainstorms/20260318003825-multi-audio-batch-whisper-brainstorm.md](../brainstorms/20260318003825-multi-audio-batch-whisper-brainstorm.md)

**Goal:** User forwards several audios in quick succession; bot responds **once** with merged analysis. Single-audio flow stays unchanged.

## Implementation status

| Milestone | Status |
|-----------|--------|
| Full plan (steps 1–5) | ✅ Completed |

## ✅ Master checklist

- [x] Step 1: `transcribeAudioBuffer`, `qualifyTranscript`, refactor `analyzeAudioBuffer`
- [x] Step 2: Batch prompts, `analyzeAudioBatch`, `formatBatchAnalysisForWhatsApp`
- [x] Step 3: `POST /api/bot/analyze-audio-batch`, `maxDuration = 300`
- [x] Step 4: `whatsapp-bot/index.cjs` debounce + `postAudioBatch` + split 3800
- [x] Step 5: Docs (`WHATSAPP-BOT-FLOW`, bot README, `docs/features/whatsapp-bot-batch.md`)
- [ ] Step 6: Manual QA (forward 3–5 audios; single user delay 4s) — operator

---

## 1. Scope

| In scope | Out of scope (v1) |
|----------|-------------------|
| `whatsapp-bot/index.cjs` debounce + batch POST | Dashboard multi-upload |
| `POST /api/bot/analyze-audio-batch` | Queue / async job / second “results ready” message |
| `lib/analyze-audio.ts` helpers + batch formatting | New `leads` rows / Supabase persistence |
| Docs: `WHATSAPP-BOT-FLOW.md`, bot README | E2E/unit tests (per project convention) |

---

## 2. Locked defaults (resolve open questions from brainstorm)

| Topic | Choice |
|-------|--------|
| Debounce | **4 s** after last audio before flush |
| Max audios per batch | **5** |
| Max window from first audio | **30 s** — if 6th arrives, start new batch or drop with notice (see bot behavior) |
| GPT strategy | **One** qualification on **concatenated labeled transcripts** (cheaper, one summary for the “bundle”) |
| Partial failure | If Whisper fails on one clip: include `❌ Audio N (time): error` in merged message; still run GPT on successful transcripts if ≥1 OK; if all fail, return single error text |
| Whisper concurrency | **2** parallel transcriptions in API (pool), then one GPT |
| `maxDuration` | **300** (5 min) on `analyze-audio-batch` only (Railway-friendly; adjust if host caps lower) |
| Message length | Truncate per-audio transcript snippet (~150 chars) in body; full analysis header from combined GPT; if still > **3800** chars, append second WhatsApp message from bot (“…continuação”) |

---

## 3. API contract — `POST /api/bot/analyze-audio-batch`

**Path:** `app/api/bot/analyze-audio-batch/route.ts`

**Auth:** Bot token: `X-Bot-Token` / `Authorization: Bearer`.

**Body (JSON only for v1 — simplest from bot):**

```json
{
  "items": [
    { "audio": "<base64>", "mimeType": "audio/ogg", "timestamp": 1710000000 }
  ]
}
```

- `timestamp`: optional Unix seconds (whatsapp-web.js `msg.timestamp`); if missing, use index `1..N`.
- **Validation:** `items.length` between 1 and 5; each decoded buffer ≤ `MAX_AUDIO_SIZE_BYTES`; sum of sizes ≤ 5×25MB cap; reject empty arrays.

**Response:** `{ "text": "<WhatsApp markdown/plain for single message>" }` — same shape as single endpoint so bot can `edit()` once.

**Errors:** 401 unauthorized, 400 validation, 500 generic (log server-side).

---

## 4. Library changes — `lib/analyze-audio.ts`

1. **`transcribeAudioBuffer(buffer, mimeType, fileName)`**  
   - Whisper only; returns `string` transcript or throws.  
   - Reuse validation + `withRetry` + same OpenAI transcription call as today.

2. **`qualifyTranscript(transcript: string)`**  
   - GPT step only (existing prompts). Used for single-audio internally if refactored, and for **batch** after building mega-transcript.

3. **Refactor `analyzeAudioBuffer`** (optional but DRY):  
   - `transcribe` → `qualify` to preserve behavior.

4. **`formatBatchAnalysisForWhatsApp(params)`**  
   - Input: ordered list `{ label: string, transcriptSnippet: string }[]` + one `LeadQualification` from combined GPT.  
   - Output: one string with header (summary, score, BANT, next step) + sections per audio: `*Audio (HH:mm)*` + snippet.  
   - **Label:** format timestamp with `Intl` or simple `new Date(ts*1000)` in **America/São_Paulo** (or UTC+label) — document in code; user is BR-heavy.

5. **`analyzeAudioBatch(items: { buffer, mimeType, fileName?, timestamp? }[])`**  
   - Run transcriptions with **concurrency 2** (simple async pool).  
   - Collect successes + per-item errors.  
   - Build labeled full transcript for GPT (only successful parts); if zero success, throw or return error-only text.  
   - One `qualifyTranscript(combined)`.  
   - Return final WhatsApp string via `formatBatchAnalysisForWhatsApp`.

6. **Prompt tweak (if needed):** Extend `QUALIFICATION_USER_PROMPT` or add batch variant: system message that input may be **multiple forwarded audios labeled by time** — still output **one** JSON qualification for the overall opportunity.

---

## 5. Bot changes — `whatsapp-bot/index.cjs`

**State per chat ID** (private chats only, existing `chat.isGroup` skip):

- `pending: Array<{ buffer, mimeType, timestamp }>`
- `flushTimer: NodeJS.Timeout | null`
- `processing: boolean` — while true, queue incoming audios to `pendingNext` or ignore with short reply (choose: **queue** second batch after current finishes)

**Flow:**

1. On audio message (after auth): append to `pending` for `msg.from` / chat id.
2. If `pending.length >= 5`, **flush immediately** (cancel debounce).
3. Else clear previous timer; set **4 s** timer to `flushBatch(chatId)`.
4. On flush: if `processing`, defer (see below).
5. **Flush:** copy `pending`, clear `pending`, send **one** `msg.reply("⏳ Analisando N áudio(s)...")` (or first message in batch — prefer reply to **last** message for UX, or use chat.sendMessage).
6. `POST /api/bot/analyze-audio-batch` with `items`.
7. If `text.length > 3800`, split: first chunk `edit`, second `msg.reply` continuation.
8. On error, `edit` with `❌ ...`.

**Edge cases:**

- **30 s wall:** If first item older than 30s when flushing, split: process first 5 as batch or flush oldest first — **simplest:** max 5 items; when adding 6th, flush first 5 then keep 1 in pending (document).
- **Single audio after 4s wait:** Batch endpoint accepts `items.length === 1` — same code path.

**Env:** `AUDIO_SCORER_API_URL` — append `/api/bot/analyze-audio-batch`.

**Constants at top:** `BATCH_DEBOUNCE_MS = 4000`, `BATCH_MAX = 5`, `BATCH_MAX_WINDOW_MS = 30000`.

---

## 6. Implementation order

| Step | Task |
|------|------|
| 1 | Add `transcribeAudioBuffer`, `qualifyTranscript`; refactor `analyzeAudioBuffer` to use them (no behavior change). |
| 2 | Add batch prompt support + `analyzeAudioBatch` + `formatBatchAnalysisForWhatsApp`. |
| 3 | Add `app/api/bot/analyze-audio-batch/route.ts` with validation, `maxDuration = 300`. |
| 4 | Update `whatsapp-bot/index.cjs` with debounce map + `postAudioBatch`. |
| 5 | Update `docs/WHATSAPP-BOT-FLOW.md`, `whatsapp-bot/README.md` (forwarding behavior, limits). |
| 6 | Manual test: forward 3–5 short audios; single reply; single audio still works. |

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| OpenAI 429 on parallel Whisper | Concurrency 2 + existing `withRetry` |
| Host `maxDuration` < 300 | Check Railway/Vercel plan; reduce to parallel 3 or shorten only if needed |
| Combined GPT confuses multiple speakers | Prompt states “multiple clips, one lead/opportunity”; iterate if quality drops |
| User sends audio + waits >30s + sends more | Second batch is separate (acceptable) |

---

## 8. Rollback

- Bot: revert to per-message `postAudio` only (git).  
- API: bot uses only `/api/bot/analyze-audio-batch`; the former single-audio bot route was removed as unused.

---

## 9. Commit

After implementation: `[TICKET-XXXX] ✨ feat(bot): batch forwarded audios, single reply` (ask ticket before commit per project rules).
