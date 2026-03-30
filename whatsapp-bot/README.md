# Bot WhatsApp (whatsapp-web.js) para Audio Scorer

Recebe áudios no WhatsApp, envia para a API do Audio Scorer e responde com a análise. **Vários áudios encaminhados seguidos** são agrupados: após ~4 s sem novo áudio (máx. 5 por lote), o bot chama `POST /api/bot/analyze-audio-batch` com `fromPhone` e responde **uma vez**. **Mensagens de texto** (número já ativado): digite `config` para ver comandos de personalização (score, BANT, transcrição por áudio, perfil); outros textos recebem uma dica para enviar áudio ou `config`. Detalhes: [docs/features/bot-reply-config.md](../docs/features/bot-reply-config.md).

## Pré-requisitos

- Node.js 18+
- Um número de WhatsApp exclusivo para o bot (chip em um celular; na primeira vez você escaneia o QR e depois pode desligar o aparelho)

## Configuração

1. **Na API (Railway):** defina a variável `AUDIO_SCORER_BOT_TOKEN` (string secreta longa).

2. **Aqui no bot:**
   ```bash
   cp .env.example .env
   ```
   Edite `.env`:
   - `AUDIO_SCORER_API_URL` — URL da API (ex.: https://audioscorer-production.up.railway.app)
   - `AUDIO_SCORER_BOT_TOKEN` — **o mesmo valor** que está na API

3. Instale e rode:
   ```bash
   npm install
   npm start
   ```

4. Na primeira execução, escaneie o QR code com o WhatsApp do número do chip (Dispositivos conectados → Conectar um aparelho). A sessão será salva em `.wwebjs_auth/`.

5. Para rodar em segundo plano (Linux): `nohup npm start &` ou use PM2/systemd.

## Endpoints da API (mesmo host que `AUDIO_SCORER_API_URL`)

| Método | Caminho | Uso |
|--------|---------|-----|
| GET | `/api/bot/check-authorized?phone=<dígitos>` | Ver se o número pode usar o bot |
| GET | `/api/bot/reply-config?phone=<dígitos>` | Ler `bot_config` efetivo |
| PATCH | `/api/bot/reply-config` | Atualizar `bot_config` (corpo `{ "phone", "patch" }`) |
| POST | `/api/bot/analyze-audio-batch` | Lote de áudios (`fromPhone` + `items[]`) |

Autenticação: header `X-Bot-Token` ou `Authorization: Bearer` com o mesmo `AUDIO_SCORER_BOT_TOKEN` da API.

**Nota:** Em contas com privacidade mais recente, o WhatsApp pode enviar o remetente como JID `...@lid` (ID interno), não `...@c.us`. O bot usa `getContactLidAndPhone` (whatsapp-web.js ≥ 1.34.x) para obter o número real antes de chamar `check-authorized`. Se ainda falhar, atualize `whatsapp-web.js` e reinicie o bot.

## Comandos de texto no WhatsApp (após ativar o número)

O utilizador pode personalizar a resposta sem sair do chat. Resumo (PT-BR; aliases em inglês na ajuda `config`):

| Mensagem (exemplos) | Efeito |
|---------------------|--------|
| `config`, `ajuda`, `help`, `menu` | Lista de comandos |
| `mostrar`, `ver`, `show` | Mostra a config atual |
| `score ligado` / `score desligado` | Liga/desliga score na resposta |
| `bant ligado` / `bant desligado` | Liga/desliga BANT |
| `foco1 ligado` / `foco1 desligado` (e `foco2` / `focus1` / `focus2`) | Liga/desliga os dois blocos extras do perfil (títulos em *mostrar*) |
| `transcricao nenhuma` / `trecho` / `completa` | Transcrição por áudio: off / snippet / full |
| `perfil insurance` (ou `real_estate`, `b2b_sales`, …) | Grava `profileType` e muda instruções da IA + rótulos dos focos |

*Resumo* e *próximo passo* na análise **sempre** aparecem. Detalhes e schema JSON: [docs/features/bot-reply-config.md](../docs/features/bot-reply-config.md).

## Se o processo do bot cair

- **Sessão salva:** Os dados de login ficam em `.wwebjs_auth/`. Se o processo cair, **basta subir de novo** (`npm start`). Não precisa escanear o QR de novo; o bot reconecta com a sessão existente.
- **Reinício automático:** Para o bot voltar sozinho após crash, use um gerenciador de processos:
  - **PM2:** `npm install -g pm2` e depois `pm2 start index.cjs --name whatsapp-bot`. O PM2 reinicia o processo se cair. Comandos: `pm2 status`, `pm2 logs whatsapp-bot`, `pm2 restart whatsapp-bot`.
  - **systemd:** Crie um unit que rode `node index.cjs` no diretório do bot com `Restart=on-failure`.
- **Sessão inválida:** Se após reiniciar o bot não conectar (erro de autenticação ou pedir QR de novo), a sessão pode ter expirado. Apague a pasta `.wwebjs_auth/`, rode `npm start` de novo e escaneie o QR com o WhatsApp do número do chip outra vez.

## Documentação completa

Veja [../docs/WHATSAPP-BOT-FLOW.md](../docs/WHATSAPP-BOT-FLOW.md) para o fluxo, estratégia de atualização da lib e detalhes.
