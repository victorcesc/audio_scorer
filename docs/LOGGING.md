# Padrão de logs

Logs seguem o formato `[módulo] mensagem` ou `[módulo] chave=valor chave2=valor2` em uma linha, para facilitar busca e monitoramento.

## Convenções

- **Prefixo:** sempre `[nome-do-módulo]` (ex.: `[bot]`, `[check-authorized]`, `[activate]`).
- **Erros:** `console.error` com `message=` ou `error message=`; evitar stack completo em produção.
- **Monitoramento:** uma linha por evento relevante (auth, ativação, falha).
- **Debug:** não deixar logs verbosos em produção; contexto em `chave=valor`.

## Módulos e mensagens

| Módulo | Quando | Exemplo |
|--------|--------|---------|
| `[bot]` | WhatsApp bot (whatsapp-bot) | `[bot] auth phone=5548998627832 authorized=true` |
| `[bot]` | Rejeição por número inválido | `[bot] auth rejected phone_invalid from=...` |
| `[bot]` | Erro ao analisar áudio | `[bot] analyze error message=...` |
| `[bot]` | Falha ao iniciar / auth WhatsApp | `[bot] startup failed err=...` |
| `[check-authorized]` | Resultado da checagem | `phone=... authorized=true source=...` ou `authorized=false tried=...` |
| `[check-authorized]` | Erro Supabase | `supabase_error table=... message=...` |
| `[activate]` | Ativação concluída | `[activate] success phone=...` |
| `[activate]` | Erro ao ativar | `[activate] error ... message=...` |
| `[analyze-audio]` | Erro no processamento (dashboard) | `[analyze-audio] error message=...` |
| `[bot/analyze-audio-batch]` | Erro na rota batch do bot | `[bot/analyze-audio-batch] error message=...` |
| `[generate-token]` | Erro ao gerar token | `[generate-token] error ... message=...` |
| `[user/whatsapp-numbers]` | Número removido pelo painel | `delete success phone=...` |

## Onde ver os logs

- **Bot:** logs do processo do whatsapp-bot (Railway, PM2, terminal).
- **API:** logs do deploy do Next.js (Railway, Vercel, etc.) — rotas `/api/*` e `[check-authorized]`, `[activate]`, etc.
