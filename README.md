# Audio Scorer — Qualificador de Leads por Áudio

Painel onde o vendedor (ou secretária) faz upload de áudios de leads e, em segundos, recebe **resumo executivo**, **lead score (0–10)** baseado em BANT e **próximo passo sugerido**.

**Idioma:** o produto é para clientes no Brasil — mensagens ao usuário (site, bot, erros da API usados no fluxo do app) em **português (Brasil)**. Ver `.cursor/rules/pt-br-user-facing.mdc`.

---

## Como usar o app

### Primeira vez (configuração)

1. **Instale e suba o projeto**
   ```bash
   npm install
   touch .env.local
   npm run dev
   ```
2. **Preencha o `.env.local`** com pelo menos:
   - `OPENAI_API_KEY` (obrigatório para analisar áudio)
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (para login e salvar leads)
3. **Configure o Supabase**: crie um projeto, rode as migrations em `supabase/migrations/` no SQL Editor e deixe Auth por e-mail ativo (veja [Supabase](#supabase) abaixo).
4. Acesse **http://localhost:3000**.

### Uso no dia a dia

1. **Abra o site** (localhost ou o endereço em produção).
2. **Cadastre-se** (dados completos); em seguida o site leva para **Entrar**, onde você usa **e-mail e senha**. Já tem conta? **Entre** direto.
3. No **dashboard** (protegido por login): **Números no WhatsApp** — veja os números cadastrados, quantos **áudios o bot já processou** (por lote) e **cadastre** ou **remova** números (pode remover e cadastrar de novo o mesmo telefone).
4. **Use o bot no WhatsApp:** envie áudio de voz na conversa com o número do bot; a análise usa a mesma API do produto (Whisper + GPT), conforme a configuração do seu número.

**Dica:** Use no celular como PWA: abra o site no navegador e adicione à tela inicial para usar como app.

---

## Testar localmente (passo a passo)

Siga estes passos para rodar o app na sua máquina.

### 1. Instalar dependências e criar o `.env.local`

No diretório do projeto:

```bash
npm install
touch .env.local
```

Edite `.env.local` e preencha as variáveis (veja a tabela em [Variáveis de ambiente](#variáveis-de-ambiente)).

### 2. Conseguir as chaves necessárias

**OpenAI (obrigatório)**

- Acesse [platform.openai.com](https://platform.openai.com) → API keys.
- Crie uma chave e cole em `.env.local` em `OPENAI_API_KEY=sk-...`.

**Supabase (obrigatório para login e salvar leads)**

- Acesse [supabase.com](https://supabase.com) e crie um projeto (plano gratuito).
- Em **Project Settings → API** copie:
  - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
  - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (guarde em segredo; usado pelo webhook do Stripe).
- No **SQL Editor**, execute **na ordem** os arquivos:
  - `supabase/migrations/001_leads.sql`
  - `supabase/migrations/002_profiles_subscription.sql`
- Em **Authentication → Providers** deixe **Email** habilitado.
- Para **não** enviar link de confirmação (após cadastrar, o usuário só precisa ir para **Entrar** com e-mail e senha): no mesmo e-mail, **desligue** **Confirm email** (às vezes aparece como “Confirm signup”).

**Stripe (opcional)**

- Só é necessário se no futuro reativar fluxos de assinatura no app.
- Pode deixar em branco para testar login, cadastro e uso pelo WhatsApp.

### 3. Subir o servidor

```bash
npm run dev
```

Abra o navegador em **http://localhost:3000**.

### 4. Testar o fluxo

1. Clique em **Cadastre-se** e preencha nome, sobrenome, CPF ou CNPJ, e-mail e senha.
2. Após **Cadastre-se**, faça **Entrar** com o mesmo e-mail e senha; aí abre o **dashboard** (com confirmação de e-mail desligada no Supabase).
3. Cadastre seu **número do WhatsApp** no painel (perfil do bot + telefone). Teste **Remover** e cadastrar de novo, se quiser.
4. Com o **bot** (`whatsapp-bot`) rodando e autorizado, envie um áudio pelo WhatsApp e confira a resposta.

**Se o bot não analisar:** confira `OPENAI_API_KEY`, token do bot e se o número está cadastrado no painel.  
**Se não conseguir logar ou cadastrar:** confira as variáveis do Supabase e se as migrations foram executadas.

---

## Stack

- **Next.js 14** (App Router), **Tailwind CSS**, **shadcn/ui**
- **Supabase** (Auth + PostgreSQL)
- **OpenAI** Whisper (transcrição) + GPT-4o-mini (qualificação)
- **Stripe** (assinatura)
- **Railway** (deploy; domínio gratuito `*.up.railway.app`)

## Setup local

```bash
npm install
touch .env.local
# Preencha as variáveis em .env.local (tabela abaixo)
npm run dev
```

### Variáveis de ambiente

| Variável                        | Obrigatório                | Descrição                                                  |
| ------------------------------- | -------------------------- | ---------------------------------------------------------- |
| `OPENAI_API_KEY`                | Sim                        | Chave da API OpenAI                                        |
| `NEXT_PUBLIC_SUPABASE_URL`      | Sim (a partir da Semana 2) | URL do projeto Supabase                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim                        | Chave anônima do Supabase                                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Sim (API servidor)         | Chave de serviço: webhook Stripe, ativação por token, cadastro de números no painel |
| `STRIPE_SECRET_KEY`             | Semana 3                   | Chave secreta do Stripe                                    |
| `STRIPE_WEBHOOK_SECRET`         | Semana 3                   | Segredo do webhook Stripe                                  |
| `STRIPE_PRICE_ID`               | Semana 3                   | ID do preço de assinatura (ex.: `price_xxx`)               |
| `AUDIO_SCORER_BOT_TOKEN`        | Bot WhatsApp (whatsapp-web.js) | Token para rotas `/api/bot/*` do bot: batch, `check-authorized`, `reply-config` |

### Bot WhatsApp (whatsapp-web.js)

O fluxo de WhatsApp usa **whatsapp-web.js** (número próprio + QR). O usuário envia áudio na conversa; o bot chama sua API e devolve o resumo. **Não** é usada a API oficial da Meta (Cloud API / webhook) neste projeto.

Cada número **autorizado** pode ter **`bot_config`** no Supabase (formato da resposta: score, BANT, transcrição por áudio). O utilizador **cadastra o número no painel** após login (ou ainda pode usar o fluxo legado **/ativar** com token gerado pelo admin). Ajustes finos continuam possíveis por comandos de texto (`config`, `mostrar`, …) — ver [docs/features/bot-reply-config.md](docs/features/bot-reply-config.md).

1. **Na API (Railway):** defina `AUDIO_SCORER_BOT_TOKEN` (ex.: `openssl rand -hex 32`).
2. **No bot:** `cd whatsapp-bot`, `cp .env.example .env`, preencha `AUDIO_SCORER_API_URL` e `AUDIO_SCORER_BOT_TOKEN`, depois `npm install` e `npm start`.
3. Escaneie o QR code com o WhatsApp do número do chip; a sessão fica em `.wwebjs_auth/`. Depois pode desligar o celular.
4. Detalhes: [docs/WHATSAPP-BOT-FLOW.md](docs/WHATSAPP-BOT-FLOW.md) (§ 7 — `fromPhone` e `reply-config`), [whatsapp-bot/README.md](whatsapp-bot/README.md) e [docs/features/bot-reply-config.md](docs/features/bot-reply-config.md).

### Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Aplique o schema, **por uma** destas formas:
   - **SQL Editor** (recomendado se der erro 401 no script): execute os ficheiros em `supabase/migrations/` **em ordem numérica** (`001`, `002`, `003`, `004`, …). Já aplicados = pode saltar ou usar `IF NOT EXISTS` onde existir.
   - **`npm run db:migrate`**: exige `NEXT_PAT_SUPABASE_TOKEN` no `.env.local` — é um [Personal Access Token](https://supabase.com/dashboard/account/tokens) da **conta** (não use `anon` nem `service_role`; costuma ser `sbp_...`). Se aparecer **401 Unauthorized**, o token está errado ou expirado.
3. Em Authentication > Providers, deixe Email habilitado e **desligue Confirm email** se quiser cadastro sem link de confirmação (recomendado para desenvolvimento e enquanto não houver SMTP próprio).

### Stripe

1. Crie um produto e um preço de assinatura recorrente no [Stripe Dashboard](https://dashboard.stripe.com).
2. Copie o **Price ID** (`price_xxx`) para `STRIPE_PRICE_ID`.
3. Em Developers > Webhooks, adicione um endpoint:
   - URL: `https://seu-dominio.com/api/webhooks/stripe`
   - Eventos: `checkout.session.completed`, `customer.subscription.deleted`
4. Copie o **Signing secret** para `STRIPE_WEBHOOK_SECRET`.

## Deploy no Railway

O [Railway](https://railway.app) oferece **domínio gratuito** (ex.: `seu-projeto.up.railway.app`) e suporta Next.js nativamente.

1. Crie uma conta em [railway.app](https://railway.app) e **New Project**.
2. Escolha **Deploy from GitHub repo** e conecte o repositório do projeto.
3. O Railway detecta Next.js e usa `npm run build` + `npm run start` (ou `npx next start`). Se precisar, defina em **Settings** o comando de build e o de start.
4. Em **Variables**, adicione todas as variáveis de ambiente (OpenAI, Supabase, Stripe, `AUDIO_SCORER_BOT_TOKEN`, etc.).
5. Em **Settings** do serviço, em **Networking** / **Public Networking**, gere um domínio. O Railway gera uma URL como `seu-projeto.up.railway.app`.
6. Após o primeiro deploy, configure o webhook do **Stripe:** `https://seu-projeto.up.railway.app/api/webhooks/stripe`

O plano gratuito do Railway inclui créditos mensais; para uso leve (site + webhooks) costuma ser suficiente.

## Fluxo do produto

1. Usuário **registra-se** e, na sequência, **entra** com e-mail e senha (Supabase Auth).
2. No **dashboard**, cadastra um ou mais **números de WhatsApp**, pode **remover** e cadastrar de novo, e acompanha o uso pelo bot.
3. Pelo **WhatsApp**, o lead envia áudio ao bot; o pipeline (Whisper + GPT-4o-mini) gera resumo, score e próximo passo conforme a configuração do número.
4. **Stripe / assinatura** permanecem disponíveis na base de código para evoluções futuras (ex.: limites ou planos).

## Precificação: quanto cobrar por usuário

Premissas (valores em USD, preços OpenAI 2024–2025):

| Item                                | Custo                 |
| ----------------------------------- | --------------------- |
| Whisper (transcrição)               | ~\$0,006/min de áudio |
| GPT-4o-mini (resumo + score)        | ~\$0,0002 por áudio   |
| **Custo por áudio (média 1,5 min)** | **~\$0,01**           |

**Por usuário pagante/mês** (exemplo: 30 áudios/mês, 1,5 min cada):

- Custo OpenAI: 30 × \$0,01 ≈ **\$0,30**
- Stripe: ~2,9% + \$0,30 por cobrança
- Supabase/Railway: free tier ou créditos até dezenas de usuários

**Para ter lucro:**

- Cobrar **pelo menos 3–5× o custo variável** (API) + margem para suporte e tempo. Ex.: \$0,30 × 4 = **\$1,20** só de API; com margem e taxa Stripe, **\$9–15/mês** (cerca de **R$ 50–85**) já gera margem confortável.
- Faixa sugerida para **Brasil** (corretores/advogados): **R$ 97–197/mês** (ou R$ 997/ano com desconto). Isso cobre muitos áudios e deixa margem alta.
- Se quiser plano “light”: **R$ 47–67/mês** para ~20–30 áudios; plano “ilimitado” ou teto alto: **R$ 147–197/mês**.

**Resumo:** Com **R$ 97/mês** por usuário e uso médio de 30 áudios (custo ~\$0,30), o custo de API fica em torno de **2% da receita**; o resto é margem após Stripe e infra. Ajuste o preço conforme o perfil do cliente (volume de áudios) e a concorrência.

## Go-to-market (Semana 4)

- **Deploy**: coloque o site no ar (ex.: `seu-projeto.up.railway.app` ou domínio próprio).
- **Vídeo de 1 minuto**: mostre o upload de um áudio de “lead ruim” e um de “lead bom” e o resumo/score/próximo passo.
- **Aquisição**: abordagem direta no LinkedIn e Instagram para corretores e advogados; ofereça os primeiros 5 usuários como beta testers.

## Testes

Antes do deploy, rode os testes:

```bash
npm test
```

Cobertura: prompts de qualificação (lib), rota `POST /api/analyze-audio`, componentes legados do dashboard (`LeadList`, `UploadForm`) e outros. O arquivo **audios/teste_1.ogg** não é versionado (está no `.gitignore`); coloque-o localmente se quiser rodar o teste de áudio real e o script `test:openai`.

## Scripts

- `npm run dev` — desenvolvimento
- `npm run build` — build de produção
- `npm run start` — servidor de produção
- `npm run lint` — ESLint
- `npm test` — testes Jest
- `npm run test:watch` — testes em modo watch
- `npm run test:openai` — testa conexão com a API OpenAI (lê `.env.local`): GET /v1/models e POST Whisper com `audios/teste_1.ogg` se existir localmente (não vem no clone).
- `npm run db:migrate` — aplica as migrations do Supabase via Management API (requer `NEXT_PAT_SUPABASE_TOKEN` no `.env.local`).
