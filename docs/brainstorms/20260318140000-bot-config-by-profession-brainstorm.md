# Brainstorm: Bot configurável por necessidade do usuário (resumo + próximo passo fixos)

## 1. What We're Building

**Objetivo:** Permitir que o usuário configure o bot de acordo com a sua necessidade. Hoje o bot está fixo com **resumo**, **score**, **BANT** e (no single/dashboard) trecho de **transcrição**. Em algumas profissões o BANT não faz sentido; o botão de transcrever áudio no WhatsApp é ruim, então a pessoa pode querer **só resumo** ou **só transcrição** na resposta. Outras profissões podem precisar de outros campos específicos.

**Fixos (por decisão do produto):** **Resumo** e **Próximo passo** — sempre presentes na resposta do bot.

**Configurável (a definir no plano):** inclusão ou não de **Score**, **BANT**, **Transcrição** (trecho ou integral), e no futuro campos por **profissão** (dois pontos-chave por perfil).

**Para quem:** Usuários do bot WhatsApp (vendedores, corretores, consultores, RH, etc.) que já ativam o número e enviam áudios — cada um poderá escolher um “perfil” (ex.: Corretor imobiliário, Corretor de seguros) e quais blocos quer na resposta (resumo + próximo passo + opcionalmente score, BANT, transcrição e, por perfil, dois pontos específicos).

**Como configurar:** O usuário altera a config **pela conversa no WhatsApp** (ex.: comando, menu ou fluxo por mensagem) **e**, no futuro, **pelo dashboard** (a desenvolver). As duas superfícies leem/gravam a **mesma fonte de verdade** no BD por número (phone).

---

## 2. Current State

### Backend

| Área | Caminho | Comportamento atual |
|------|---------|---------------------|
| Tipos | `lib/types.ts` | `LeadQualification`: summary, score, bantReasons, nextStep (todos fixos) |
| Prompts | `lib/prompts/qualification.ts` | Um único prompt BANT (single + batch); GPT retorna sempre os 4 campos |
| Pipeline | `lib/analyze-audio.ts` | `analyzeAudioBuffer` (dashboard) / `analyzeAudioBatch` (bot) → Whisper + GPT; formato WhatsApp agregado só no fluxo batch |
| API bot | `app/api/bot/analyze-audio-batch/route.ts` | POST com `items[]` → `analyzeAudioBatch` → `{ text }` (sem parâmetro de configuração) |

### Bot (cliente)

| Caminho | Comportamento atual |
|---------|---------------------|
| `whatsapp-bot/index.cjs` | Envia áudios para `/api/bot/analyze-audio-batch`; não envia preferências nem perfil. Resposta é sempre o formato fixo. |

### Base de dados

- `supabase/migrations/001_leads.sql` — leads (user_id do dashboard).
- `supabase/migrations/002_profiles_subscription.sql` — `profiles` (assinatura).
- `supabase/migrations/003_activation.sql` — `activation_tokens`, `authorized_whatsapp_numbers` (por telefone); **não há configuração de bot por número**.

### Documentação

- `docs/WHATSAPP-BOT-FLOW.md` — fluxo bot → API; ativação por link.
- Brainstorm batch: `docs/brainstorms/20260318003825-multi-audio-batch-whisper-brainstorm.md`.
- Plan batch: `docs/plans/20260318120000-multi-audio-batch-plan.md`.

---

## 3. Profissões que mais usam WhatsApp para vendas/negócios (e 2 pontos importantes por uma)

Com base em adoção no Brasil (WhatsApp em ~70% das estratégias de vendas/marketing, forte em B2C e B2B) e uso típico por canal:

| # | Profissão | 2 pontos mais importantes a extrair do áudio |
|---|-----------|-----------------------------------------------|
| 1 | **Corretores imobiliários** | (1) **Perfil do imóvel** — quartos, região, faixa de preço, finalidade (morar/investir); (2) **Timeline e decisão** — quando quer mudar, se já vendeu/imobilizado, quem decide. |
| 2 | **Corretores de seguros / planos de saúde** | (1) **Necessidade de cobertura** — vida, saúde, auto, residencial; perfil de risco; (2) **Budget e autoridade** — quem paga, quem decide, prazo para fechar. |
| 3 | **Vendas B2B / consultores comerciais** | (1) **BANT** — orçamento, autoridade, necessidade, prazo (já coberto hoje); (2) **Objeções e dúvidas** — principais resistências ou perguntas do lead. |
| 4 | **RH / Recrutamento** | (1) **Fit vaga–candidato** — experiência, habilidades e expectativa em relação à vaga; (2) **Disponibilidade e remuneração** — quando pode começar, pretensão salarial, home/escritório. |
| 5 | **Prestadores de serviço (advogados, contadores)** | (1) **Tipo de demanda e prazo** — tipo de caso/serviço, urgência; (2) **Quem contrata e orçamento** — quem decide e paga, se há teto de honorários. |
| 6 | **Marketing / equipes comerciais (inbound)** | (1) **Nível de interesse e estágio** — descoberta, consideração, decisão; (2) **Melhor próximo passo** — já coberto por “próximo passo”; complementar com **canal preferido** (liga, reunião, e-mail). |
| 7 | **Clínicas / saúde (agendamento e planos)** | (1) **Motivo do contato** — sintoma, check-up, dúvida sobre plano; (2) **Disponibilidade** — melhores dias/horários para agendamento. |

**Resumo:** Manter **resumo** e **próximo passo** fixos. Por profissão, além de poder ligar/desligar Score, BANT e Transcrição, no futuro podemos acrescentar **dois campos específicos** por perfil (ex.: imobiliário = perfil do imóvel + timeline; seguros = necessidade + budget/autoridade). A primeira versão pode ser só “quais blocos mostrar” (resumo, próximo passo, score, BANT, transcrição); os dois pontos por profissão podem ser fase 2.

---

## 4. Architecture & Infrastructure

### Onde fica a lógica

- **Backend (API):** Escolha de prompt (com/sem BANT, com/sem score) e de formato de resposta (quais blocos incluir). Ao processar áudio, a API **carrega a config do número** (BD) ou aceita override apenas do bot autenticado; monta o texto conforme essa config. Endpoints adicionais (Next.js) podem **ler/atualizar** essa config: chamada pelo bot (fluxo WhatsApp) e, no futuro, pelo dashboard do utilizador autenticado (ligação número ↔ `user_id` quando existir).
- **Bot (whatsapp-bot):** Para cada áudio, envia o **número** do remetente na chamada à API (ou a API identifica o número via payload); o servidor aplica a config persistida. Mensagens de texto podem acionar o fluxo de **ajuste de config** (conversa) em vez de apenas rejeitar texto.
- **Persistência:** Uma linha por telefone autorizado — ex.: coluna `bot_config jsonb` em `authorized_whatsapp_numbers` ou tabela `bot_user_config(phone, ...)` — atualizada pelo fluxo no WhatsApp e no futuro pelo dashboard (**fonte única**).

### Serviços de nuvem

- Nenhum serviço novo obrigatório. Supabase já existe; se a config for por número, usa-se a mesma instância (nova coluna ou tabela). Secrets já existem (bot token, OpenAI).

### Modelo de dados

- **Decisão (por número):** Em `authorized_whatsapp_numbers`: coluna `bot_config jsonb` (ou colunas booleanas) com `profile_type`, `include_score`, `include_bant`, `include_transcript`, ou nova tabela `bot_user_config(phone, ...)`.
- **Perfis por profissão:** Pode ser um enum ou tabela de “profiles” (id, name, slug) com dois “extraction points” (labels/chaves) por perfil; na v1 dá para fixar em código (sem BD).
- **Ligação dashboard (futuro):** Opcional `user_id` por número ou tabela de associação para permitir ao utilizador logado editar no painel a mesma config que o bot usa.

### Infraestrutura

- Nenhum novo repo, fila ou bucket. Alterações: rotas de análise recebem identificação do número (quando aplicável); servidor **resolve config no BD**; formatadores condicionais em `lib/analyze-audio.ts`. Rotas **`GET/PATCH /api/bot/...-config`** (nomes no plano) protegidas por bot token e/ou sessão (dashboard futuro) para leitura e atualização da config.

### Segurança

- Auth igual à atual: `X-Bot-Token` (ou Bearer). Se a config for por número, a API pode validar o número (ex.: extraído do body pelo bot, ou enviado no request) e carregar config do BD com service role; não expor config de outros números.

---

## 5. Integration Impact

| Camada | Impacto |
|--------|---------|
| **lib/types.ts** | Manter `LeadQualification` com todos os campos (score, bantReasons); o GPT pode continuar retornando tudo; a decisão de “mostrar ou não” é só na formatação. Ou definir tipo “qualification output” configurável (abstrair quais campos existem). |
| **lib/prompts/qualification.ts** | Possível prompt alternativo quando BANT/score estiverem desativados (ex.: só summary + nextStep + campos do perfil). Ou um único prompt que sempre preenche tudo e a API só omite na saída. |
| **lib/analyze-audio.ts** | Formatadores de texto WhatsApp (batch) passam a receber opções (ex.: `{ includeScore, includeBant, includeTranscript }`) e montam as linhas condicionalmente. |
| **app/api/bot/analyze-audio-batch/route.ts** | Ler config (body/header/query ou BD por número); repassar para `analyzeAudioBatch` (ou wrapper) e formatador. |
| **whatsapp-bot/index.cjs** | Enviar **phone**/chat id no POST de análise (ou manter token + número no body); implementar fluxo de **mensagens de texto** para alterar config (menu / comandos). |
| **Supabase** | Migração: coluna `bot_config` (ou equivalente) em `authorized_whatsapp_numbers` + associação opcional para `user_id` (dashboard). RLS: API com service role; dashboard usa políticas por utilizador quando existir o link. |
| **Dashboard (futuro)** | Ecrã “Configuração do bot” (perfil + toggles score/BANT/transcrição) que persiste na mesma `bot_config` do número; requer modelo de “meu número WhatsApp” ou convite de vinculação. |

### Breaking changes

- **Nenhum** desde que **defaults no BD** (config ausente ou `null`) reproduzam o comportamento atual (todos os blocos visíveis). Bot passa a enviar **identificação do número** nas rotas de análise; clientes legados sem esse campo podem ser tratados com defaults até o bot ser atualizado em todos os ambientes.

---

## 6. Key Decisions

1. **DECIDED:** Resumo e Próximo passo são **sempre** exibidos; o resto (Score, BANT, Transcrição) é configurável.
2. **DECIDED:** Lista inicial de profissões e “2 pontos por profissão” definidos como referência; implementação dos dois pontos por profissão pode ser **fase 2**; v1 pode ser só “blocos” (score, BANT, transcrição).
3. **DECIDED:** Nenhum breaking change na API de análise: número sem linha de config explícita pode usar **defaults** iguais ao comportamento atual até migração/backfill.
4. ✅ **DECIDED:** O utilizador configura **pela conversa no WhatsApp** e, **no futuro, pelo dashboard** (a desenvolver); ambos escrevem na mesma config persistida por número.
5. ✅ **DECIDED:** Config **por número** (BD) na v1 — cada número ativado tem sua própria configuração; exige persistência (coluna ou tabela).
6. **OPEN:** Incluir transcrição na resposta: trecho (snippet) como hoje, opção “transcrição integral”, ou ambos como opções.

---

## 7. Open Questions

1. ~~Onde configurar (ativação vs depois)~~ → **Resolvido:** WhatsApp (chat) + dashboard futuro; opcional escolha também no **link de ativação** (melhora onboarding) — decidir no plano se v1 inclui passo extra no ativar ou só após ativo via chat.
2. ~~Config global vs por número~~ → **Resolvido:** config por número em BD.
3. **Transcrição:** só snippet, só integral, ou escolha entre os dois?
4. **Dois pontos por profissão:** implementar já na v1 (prompts e campos por perfil) ou deixar para v2 após validar blocos (score/BANT/transcrição)?
5. **Nome do “perfil” na UX:** usar “profissão” (Corretor imobiliário, Seguros, etc.) ou termos mais neutros (Perfil vendas, Perfil recrutamento)?

*Se não houver preferência: ao implementar, defaults no BD = comportamento atual; transcrição como “snippet” ou “não incluir”; dois pontos por profissão em fase 2.*

---

## 8. Next Steps

- Rodar **`/plan`** com este brainstorm.
- Definir no plano: (1) schema `bot_config` + migração; (2) como o bot identifica o número na análise e como a API carrega a config; (3) UX mínima no WhatsApp (comandos/menu) para alterar perfil e toggles; (4) contrato da API `GET/PATCH` de config e hooks futuros do dashboard.
- Prerequisites: OpenAI, Supabase, bot token; opcional evolução do link de ativação com um passo de “escolher perfil”.
