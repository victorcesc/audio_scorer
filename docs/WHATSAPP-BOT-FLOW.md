# Fluxo: Bot WhatsApp (whatsapp-web.js) → Sua API

Este documento descreve o fluxo em que um bot rodando com **whatsapp-web.js** (ou similar) recebe áudios no WhatsApp e encaminha para a API do Audio Scorer, e como manter a lib atualizada quando o WhatsApp mudar.

---

## 1. Fluxo geral

```
┌─────────────┐     áudio      ┌──────────────────────────────────────────────────┐
│   Usuário   │ ──────────────►│  WhatsApp (servidores)                             │
│  (celular)  │                └──────────────────────────────────────────────────┘
└─────────────┘                                    │
       ▲                                           │ entrega
       │                                           ▼
       │                ┌──────────────────────────────────────────────────┐
       │                │  Bot (whatsapp-web.js)                            │
       │                │  - Conecta via WhatsApp Web (QR / sessão)         │
       │                │  - Escuta evento "message" (tipo voice/audio)     │
       │                │  - Baixa o arquivo de mídia                        │
       │                └──────────────────────────────────────────────────┘
       │                                    │
       │                                    │ POST /api/bot/analyze-audio-batch
       │                                    │ (items + fromPhone + token; ver § lote e § 7)
       │                                    ▼
       │                ┌──────────────────────────────────────────────────┐
       │                │  Sua API (Audio Scorer)                           │
       │                │  - Valida token (X-Bot-Token ou Authorization)     │
       │                │  - analyzeAudioBatch() → N× Whisper + 1× GPT      │
       │                │  - Responde JSON: { text }                        │
       │                └──────────────────────────────────────────────────┘
       │                                    │
       │                                    │ 200 + { text: "📋 Análise..." }
       │                                    ▼
       │                ┌──────────────────────────────────────────────────┐
       │                │  Bot (whatsapp-web.js)                            │
       │                │  - Envia msg.reply(text) no mesmo chat            │
       └────────────────│  - Ou envia para o número de origem              │
                         └──────────────────────────────────────────────────┘
```

---

## 2. Sequência passo a passo

| # | Quem | Ação |
|---|------|------|
| 1 | Usuário | Envia mensagem de **voz/áudio** para o número do bot no WhatsApp. |
| 2 | WhatsApp | Entrega a mensagem para o cliente conectado (o bot, via whatsapp-web.js). |
| 3 | Bot | Recebe evento `message` com `message.type === 'ptt'` ou `'audio'`. |
| 4 | Bot | Obtém a mídia: `message.downloadMedia()` → buffer do áudio. |
| 5 | Bot | Agrupa áudios do mesmo chat (debounce 4 s, máx. 5, janela 30 s); `POST /api/bot/analyze-audio-batch` com corpo JSON descrito em **§ 7** (`items` + **`fromPhone`**) e header `X-Bot-Token` (ou `Authorization: Bearer`). |
| 6 | API | Valida o token; resolve **`bot_config`** do número (`fromPhone`) em `authorized_whatsapp_numbers`; Whisper (até 2 em paralelo) por áudio; uma qualificação GPT no texto concatenado; formata o texto conforme a config (resumo + próximo passo sempre; score/BANT/transcrição por áudio opcionais). Resposta `{ text: "..." }`. |
| 7 | Bot | Edita a mensagem “Analisando…” com o texto; se >3800 caracteres, envia continuação numa segunda mensagem. |
| 8 | Usuário | Vê **uma** resposta agregada conforme a configuração guardada para o seu número. |

**Lote (encaminhar vários):** o bot **não** chama a API por mensagem. Acumula áudios e só após **4 s** sem novo áudio (ou ao atingir 5 áudios, ou após 30 s desde o primeiro do lote) envia o lote. Durante o processamento, novos áudios entram numa fila para o próximo lote. Ver [docs/features/whatsapp-bot-batch.md](features/whatsapp-bot-batch.md).

**Mensagens de texto:** após o número estar **autorizado**, o utilizador pode enviar comandos para ver ou alterar a **configuração da resposta** (ver **§ 7**). Isto chama `GET`/`PATCH /api/bot/reply-config` no mesmo host, com o mesmo token.

---

## 3. Onde cada coisa roda

- **Sua API (Audio Scorer):** já está no Railway (Next.js). A análise pelo bot usa `POST /api/bot/analyze-audio-batch` (protegida por token; ver § 1–2).
- **Bot (whatsapp-web.js):** roda em **outro processo** (VPS, sua máquina, ou outro serviço). Pode ser um script Node.js separado ou um pequeno servidor. Ele **não** precisa estar no mesmo deploy do Next.js; só precisa conseguir fazer HTTP para a URL da API.

---

## 4. Estratégia para manter a lib atualizada quando o WhatsApp mudar

O WhatsApp Web muda de vez em quando; a whatsapp-web.js (e similares) precisa de atualizações para continuar funcionando. Abaixo uma forma de lidar com isso de forma contínua.

### 4.1 Versão e dependência

- Use **versão fixa** no `package.json` do projeto do bot (ex.: `"whatsapp-web.js": "1.23.0"`), não `"*"` ou `"latest"`.
- Mantenha o bot em um **repositório separado** (ou uma pasta separada, ex.: `whatsapp-bot/`) com seu próprio `package.json`, para não misturar com o Next.js e facilitar atualizar só o bot.

### 4.2 Saber quando há nova versão

- **GitHub:** “Watch” o repositório da lib (ex.: `pedroslopez/whatsapp-web.js`) → “Releases only”. Assim você recebe notificação quando sair release nova.
- **npm:** `npm outdated` no diretório do bot mostra se existe versão mais nova da lib.
- **Dependabot / Renovate:** no GitHub, ative Dependabot (ou Renovate) no repositório do bot; ele abre PRs quando houver atualizações de dependências (incluindo whatsapp-web.js).

### 4.3 Atualizar com cuidado

- **Changelog / release notes:** antes de atualizar, leia o CHANGELOG ou as release notes no GitHub da lib para ver breaking changes (ex.: mudança de nome de evento, de `downloadMedia()`, etc.).
- **Atualizar em ambiente de teste primeiro:** rode o bot localmente (ou em um ambiente de teste), faça login com um número de teste, envie um áudio e confira se ainda recebe e encaminha para a API e se a resposta volta. Só depois aplique a mesma versão em produção.
- **Versão mínima no package.json:** depois de testar, fixe a nova versão no `package.json` do bot (ex.: `"1.24.0"`) e faça deploy.

### 4.4 Detectar quando algo quebrou

- **Healthcheck simples:** um script ou job (cron) que, a cada X minutos:
  - Verifica se o processo do bot está de pé.
  - Opcional: envia uma mensagem de teste para o próprio número do bot (ou um número de monitoramento) e verifica se a resposta da API chegou (ex.: um endpoint que retorna “ok” e o bot repete).
- **Logs:** o bot deve logar erros (ex.: falha ao fazer login, falha ao baixar mídia, falha ao chamar a API). Se aparecer muitos erros de “sessão inválida” ou “mídia não disponível” após uma atualização do WhatsApp Web, é sinal de que a lib pode precisar de update.
- **Alertas:** se usar um serviço de monitoramento (Uptime Robot, Better Stack, etc.), monitore a URL da API; e, se possível, um “ping” do próprio bot (ex.: endpoint que o bot chama quando está saudável) para saber se o bot caiu.

### 4.5 Plano B se a lib parar de funcionar

- **Issue / PR no GitHub da lib:** verifique se já existe issue aberta sobre a quebra; às vezes a correção está em um branch ou em uma versão canary.
- **Fork ou alternativa:** em último caso, você pode acompanhar um fork ativo ou outra lib (ex.: Baileys) que tenha suporte mais rápido; aí o fluxo (bot → sua API) continua igual, só troca a implementação do “cliente WhatsApp”.
- **API oficial (Meta):** não há webhook Cloud API neste repositório; o caminho suportado é **whatsapp-web.js → `/api/bot/analyze-audio-batch`**. Se no futuro quiser Meta, seria um cliente novo chamando o mesmo endpoint (ou outro), não o fluxo atual.

---

## 5. Resumo do fluxo + atualização

- **Fluxo:** Usuário envia áudio no WhatsApp → Bot (whatsapp-web.js) recebe, baixa o áudio e faz POST para sua API → API analisa e devolve o texto → Bot envia a resposta no chat.
- **Atualização:** Bot em pasta `whatsapp-bot/`, versão fixa da lib, “Watch” releases no GitHub, Dependabot/Renovate para PRs de update, testar antes de produção, healthcheck + logs + alertas, e plano B (fork/outra lib) se a lib ficar obsoleta.

---

## 6. Como rodar o bot (implementado)

### 6.1 Na API (Railway / .env.local)

Defina a variável **`AUDIO_SCORER_BOT_TOKEN`** — uma string secreta longa (ex.: `openssl rand -hex 32`). Quem chamar as rotas abaixo deve enviar esse valor no header `X-Bot-Token` ou `Authorization: Bearer <token>`:

| Rota | Método | Uso |
|------|--------|-----|
| `/api/bot/analyze-audio-batch` | POST | Análise de lote de áudios |
| `/api/bot/check-authorized` | GET | Bot verifica se o número pode usar o serviço |
| `/api/bot/reply-config` | GET, PATCH | Ler ou atualizar `bot_config` do número (ver **§ 7**) |

### 6.2 No bot (pasta `whatsapp-bot/`)

1. Entre na pasta: `cd whatsapp-bot`
2. Instale: `npm install`
3. Crie `.env` (copie de `.env.example`): `AUDIO_SCORER_API_URL` (URL da API) e `AUDIO_SCORER_BOT_TOKEN` (mesmo valor da API).
4. Rode: `npm start`
5. Na primeira vez, escaneie o **QR code** com o WhatsApp do número do chip (Dispositivos conectados → Conectar um aparelho). A sessão fica em `.wwebjs_auth/`. Depois pode desligar o celular.
6. Para 24/7: rode o script em um VPS, Raspberry Pi ou use PM2/systemd.

### 6.3 Ativação por link

Só números **autorizados** podem usar o bot. Fluxo:

1. **Gerar link:** chame `POST /api/admin/generate-token` com header `X-Bot-Token: <AUDIO_SCORER_BOT_TOKEN>`. A resposta traz `{ link: "https://seu-dominio/ativar?token=..." }`. Defina `NEXT_PUBLIC_APP_URL` na API para o link correto.
2. **Enviar o link** ao usuário (por WhatsApp, e-mail, etc.).
3. **Usuário:** abre o link, **escolhe um perfil**: modo normal (`default` / “Nenhuma profissão”) ou uma das profissões do brainstorm (imobiliário, seguros/planos de saúde, B2B — `real_estate`, `insurance`, `b2b_sales`), informa o número de WhatsApp (com DDD) e clica em Ativar. O `POST /api/activate` grava `bot_config` com `profileType` escolhido (demais opções = defaults; ajuste por comandos no WhatsApp).
4. O bot, ao receber qualquer mensagem, chama `GET /api/bot/check-authorized?phone=<numero>` (com `X-Bot-Token`). Se não autorizado, responde: "Você não está ativado. Peça ao administrador um link de ativação..."

### 6.4 Testar

1. Envie um **áudio** para o número do bot (após ativar). O bot responde com a análise (formato conforme `bot_config` no Supabase).
2. Envie **`config`** ou **`ajuda`** no chat para ver os comandos de personalização.
3. Exemplos: **`mostrar`**, **`score desligado`**, **`transcricao completa`**, **`perfil default`**. Detalhes: [docs/features/bot-reply-config.md](features/bot-reply-config.md).

---

## 7. `fromPhone`, `reply-config` e formato da resposta

### 7.1 Corpo do `POST /api/bot/analyze-audio-batch`

O bot envia sempre **`fromPhone`**: string com dígitos do remetente (normalização alinhada a `check-authorized`), por exemplo:

```json
{
  "fromPhone": "5548999123456",
  "items": [
    {
      "audio": "<base64>",
      "mimeType": "audio/ogg",
      "timestamp": 1710000000
    }
  ]
}
```

- **Com `fromPhone` válido** e linha existente em `authorized_whatsapp_numbers`, a API aplica `bot_config` (JSONB) ao formatar a resposta.
- **404** se `fromPhone` não corresponder a nenhuma linha autorizada (o fluxo normal do bot só envia após `check-authorized`; trate divergências de dados se ocorrerem).
- **Omissão de `fromPhone`** (apenas clientes legados): a API usa o formato **padrão** completo (score + BANT + trechos por áudio). Não recomendado para o bot em produção.

### 7.2 Rotas `GET` / `PATCH /api/bot/reply-config`

- **GET** `?phone=<dígitos>` → `{ replyFormat }` com valores efetivos (defaults fusionados com `bot_config` da BD). **404** se o número não estiver em `authorized_whatsapp_numbers`.
- **PATCH** corpo `{ "phone": "<dígitos>", "patch": { ... } }` → grava objeto normalizado em `bot_config`. Campos permitidos em `patch`: `profileType`, `includeScore`, `includeBant`, `transcriptMode`. Ver schema em [docs/features/bot-reply-config.md](features/bot-reply-config.md).

Autenticação: mesmo **`AUDIO_SCORER_BOT_TOKEN`** que as outras rotas do bot.

### 7.3 Comandos no WhatsApp (texto)

Implementados em `whatsapp-bot/index.cjs` (`handleConfigTextMessage`). Resumo (PT-BR; aliases em inglês indicados na ajuda `config`):

| Intenção | Exemplos de mensagem |
|----------|----------------------|
| Ajuda | `config`, `menu`, `help`, `ajuda` |
| Ver config atual | `mostrar`, `show`, `ver` |
| Score na resposta | `score ligado` / `score desligado` (ou `on` / `off`) |
| BANT na resposta | `bant ligado` / `bant desligado` |
| Dois focos do perfil | `foco1 ligado` / `foco1 desligado`, `foco2 …` (`focus1` / `focus2`) — rótulos em *mostrar* dependem de `profileType` |
| Transcrição por áudio | `transcricao nenhuma` \| `trecho` \| `completa` (ou `transcript off|snippet|full`) |
| Perfil | `perfil insurance`, `perfil real_estate`, `perfil b2b_sales`, … (ou `profile …`) — altera prompt GPT + nomes dos focos |

*Resumo* e *próximo passo* na análise **sempre** presentes; o resto depende de `bot_config`.

### 7.4 Base de dados

Coluna **`authorized_whatsapp_numbers.bot_config`** (JSONB, nullable). Migração: `supabase/migrations/004_bot_config.sql`. Aplicar no Supabase antes de usar em produção.
