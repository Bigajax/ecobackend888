# Runbook de deploy

## Pré-deploy (checklist)
1. **Sincronizar assets** – Garanta que o diretório configurado em `ECO_ASSETS_ROOT` contenha todos os módulos obrigatórios (`modulos_core/*.txt`, `modulos_extras/*.txt`). Rode `npm run verify:assets` para validar antes do build; o boot abortará se faltar algum arquivo.【F:server/server.ts†L38-L133】【F:server/package.json†L12-L14】
2. **Variáveis** – Revise `.env` (ver [ENVIRONMENT.md](ENVIRONMENT.md)). Sem `OPENROUTER_API_KEY` ou `SUPABASE_*` o serviço falhará ao atender conversas/analytics.【F:server/services/ConversationOrchestrator.ts†L41-L74】【F:server/lib/supabaseAdmin.ts†L12-L24】
3. **Dependências** – `npm install` na pasta `server` (Node 18.17–20.x conforme `package.json`).【F:server/package.json†L6-L33】
4. **Testes opcionais** – Execute suites relevantes (`npm test -- ask-eco` etc.) caso haja mudanças no fluxo conversacional.

## Build
```bash
npm run build
```
Esse comando transpila TypeScript com `tsc` e copia assets para `dist/` via `copy:assets`. Saída esperada: diretório `dist/` com `server.js` e assets prontos para deploy.【F:server/package.json†L12-L17】

## Deploy (Render/Vercel/Node server)
1. **Subir bundle** – Faça upload do repositório (ou branch) para o ambiente. Certifique-se de que `npm install` e `npm run build` são executados no build step.
2. **Configurar start** – Comando de start padrão: `npm start` (executa `node dist/server.js` com `NODE_ENV=production`).【F:server/package.json†L12-L17】 Se usar PM2 ou systemd, envolva o comando equivalente.
3. **Configurar proxies/timeouts** – Ajuste `keepAliveTimeout`/`headersTimeout` do proxy (Nginx, Render) para ≥ 75s em linha com o contrato `/api/_eco-contract` para evitar corte de streams.【F:server/core/http/app.ts†L215-L309】
4. **Variáveis** – Defina envs sensíveis no painel do provedor (OpenRouter, Supabase, Mixpanel, SSE). Para ambientes com analytics desabilitado, espere logs `[analytics] tabela: "skipped"` indicando que o serviço continua saudável.【F:server/services/analytics/analyticsOrchestrator.ts†L97-L165】

## Pós-deploy (smoke tests)
1. `curl https://<host>/readyz` → esperar `{"status":"ready"}`. Se `no-admin-config`, verifique chaves Supabase.【F:server/core/http/app.ts†L209-L214】
2. `curl -N -G https://<host>/api/ask-eco ...` com UUIDs fake e `USE_STUB_ECO=true` em staging para validar CORS + SSE (deve receber `prompt_ready` + `done`).【F:server/routes/promptRoutes.ts†L592-L847】
3. `curl -X POST https://<host>/api/feedback` com `interaction_id` existente para confirmar integrações analytics.【F:server/controllers/feedbackController.ts†L32-L200】
4. Checar logs de boot (`Servidor Express rodando na porta ...`, `CORS allowlist`) para confirmar inicialização correta.【F:server/server.ts†L153-L176】

## Rollback
1. **Identificar versão estável** – Use commit anterior verificado (ou imagem Docker anterior).
2. **Redeploy** – Reaplique `npm run build && npm start` na revisão estável (ou acione redeploy automático no provedor com commit anterior).
3. **Limpeza de caches** – Limpe locks de streams ativos (`activeStreamSessions`) reiniciando a instância; o mapa em memória é resetado ao reiniciar o processo.【F:server/deduplication/activeStreamManager.ts†L16-L86】
4. **Verificações** – Repetir smoke tests (`/readyz`, `/api/ask-eco`) para garantir que o rollback restabeleceu o comportamento esperado.

## Operações contínuas
- **Sincronização de bandits** – O scheduler roda automaticamente após boot. Monitorar logs `bandit.sync` (ver arquivo `services/banditRewardsSync.ts`) para garantir que recompensas continuam atualizando.【F:server/server.ts†L135-L177】
- **Atualização de módulos** – Ao adicionar novos prompts, atualize o diretório referenciado por `ECO_PROMPT_ROOTS` e reexecute `npm run verify:assets` antes do próximo deploy.【F:server/bootstrap/modules.ts†L1-L200】
- **Rotação de chaves** – Ao trocar `OPENROUTER_API_KEY` ou `SUPABASE_*`, reinicie o serviço para garantir que novos valores sejam carregados (o boot lê envs uma vez).【F:server/server.ts†L5-L22】
