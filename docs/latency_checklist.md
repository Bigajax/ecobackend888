# Checklist de Medição de Latência

Este checklist padroniza a coleta de métricas de latência para backend, frontend e analytics, garantindo comparabilidade entre ciclos.

## 1. Preparação Geral
- [ ] Confirmar janela de coleta (data/hora) e ambiente-alvo (`stg` ou `prod`).
- [ ] Limpar caches locais (Chrome DevTools > Application > Clear storage) e invalidar CDN se aplicável.
- [ ] Registrar versão do commit e configuração de feature flags ativas.

## 2. Backend (API)
1. [ ] Ativar nível de log `debug` em `server/config/logging.ts` antes da coleta.
2. [ ] Executar 10 requisições quentes para aquecer caches: `curl -N https://stg-api.ecobackend.internal/api/v2/chat/stream -d @fixtures/prompt.json -H "Content-Type: application/json" -H "Authorization: Bearer <token>"`.
3. [ ] Capturar 30 requisições em modo frio (sem pré-aquecimento) e 30 em modo quente, salvando resposta e headers (`time curl ... -D headers.txt -o body.ndjson`).
4. [ ] Registrar métricas no `docs/latency_audit_report.md`: TTFB, TTLC, tamanho do payload, tokens totais (ver item Analytics).
5. [ ] Validar streaming: garantir que `Transfer-Encoding: chunked` esteja presente e que o primeiro chunk chegue < 1.0s.
6. [ ] Conferir logs de `ModuleStore` para confirmar hits de cache e contagem de módulos anexados.

## 3. Frontend (Web)
1. [ ] Rodar `npm run dev -- --host 0.0.0.0` e acessar via `https://localhost:5173` com VPN corporativa.
2. [ ] Abrir Chrome DevTools > Performance e gravar fluxo "Enviar mensagem".
3. [ ] Salvar métricas: `DOMContentLoaded`, `First Contentful Paint`, `TTFB`, `Largest Contentful Paint`, tempo para primeiro token renderizado no chat.
4. [ ] Validar que o componente de chat processa streaming (`ReadableStream`) sem blocos > 200ms entre chunks.
5. [ ] Exportar HAR do fluxo e anexar ao diretório `docs/har/<data>-chat.har`.

## 4. Analytics e Telemetria
1. [ ] Rodar `npm run analytics:pull -- --from=<YYYY-MM-DD> --to=<YYYY-MM-DD>` para coletar eventos de latência agregados.
2. [ ] Confirmar ingestão de eventos `chat_response_started` e `chat_response_completed` com atributos `ttfb_ms`, `ttlc_ms`, `tokens_total`, `rag_bytes`.
3. [ ] Validar consistência entre números de telemetria e medições manuais (<5% de discrepância aceitável).
4. [ ] Atualizar dashboards no Metabase (`Latência Conversa > Últimos 14 dias`) com filtros do ambiente analisado.

## 5. Consolidação
- [ ] Preencher tabela comparativa em `docs/latency_audit_report.md`.
- [ ] Registrar observações chave e ações pendentes.
- [ ] Compartilhar resumo no canal `#latency-watch` e anexar link para PR correspondente.

## 6. Critérios de Reexecução
- Repetir checklist após qualquer PR que altere `server/services/promptContext`, `server/routes/*` ou o pipeline de embeddings.
- Reabrir medição se TTLC > 4s por dois ciclos consecutivos ou se tokens por resposta > 2.5k.
- Programar auditoria completa quinzenalmente, mesmo sem regressão aparente.
