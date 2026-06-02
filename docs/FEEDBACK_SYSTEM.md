# Sistema de Feedback de Usuários - ECO Backend

**Data de Implementação**: 2026-01-20
**Status**: ✅ Implementado e Testado

---

## 📋 Visão Geral

Sistema completo de feedback de usuários que permite coleta de feedback categorizado (bugs, features, melhorias, outros) de usuários autenticados e guests. Implementa rate limiting, validação de entrada, sanitização XSS e persistência no Supabase com Row-Level Security (RLS).

---

## 🏗️ Arquitetura

### Componentes Principais

```
┌─────────────────┐
│  Frontend       │
│  (React)        │
└────────┬────────┘
         │ POST /api/user-feedback
         ▼
┌─────────────────────────────────────────┐
│  Rate Limiter Middleware                │
│  (5 req/15min por guest/user)           │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Validator & Sanitizer                  │
│  (XSS protection, UUID validation)      │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Route Handler                          │
│  (userFeedbackRoutes.ts)                │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Supabase (PostgreSQL)                  │
│  user_feedback table + RLS policies     │
└─────────────────────────────────────────┘
```

---

## 📁 Arquivos da Implementação

### 1. Migração SQL
**Arquivo**: `supabase/migrations/20260120_create_user_feedback_table.sql`

Cria:
- Tabela `user_feedback` com RLS habilitado
- Índices para performance (user_id, guest_id, created_at, category)
- Trigger para atualizar `updated_at` automaticamente
- Políticas RLS para usuários autenticados e guests

### 2. Types TypeScript
**Arquivo**: `server/utils/feedbackTypes.ts`

Define:
- `FeedbackRequest` - Estrutura da requisição
- `FeedbackResponse` - Estrutura da resposta
- `FeedbackRecord` - Estrutura do banco de dados
- `FeedbackValidationResult` - Resultado da validação
- `FEEDBACK_CONFIG` - Constantes de configuração

### 3. Validador
**Arquivo**: `server/utils/feedbackValidator.ts`

Funções:
- `validateAndSanitizeFeedback()` - Valida e sanitiza dados de entrada
- `isValidUUID()` - Valida formato UUID v4
- `sanitizeString()` - Remove vetores de XSS
- `hasValidIdentifier()` - Verifica presença de identificador
- `getPrimaryIdentifier()` - Retorna identificador primário

### 4. Rate Limiter
**Arquivo**: `server/utils/rateLimiter.ts`

Implementa:
- Middleware `feedbackRateLimiter`
- Limite: 5 requisições a cada 15 minutos
- Armazenamento em memória (Map)
- Limpeza automática de registros expirados
- Funções auxiliares para testes

### 5. Route Handler
**Arquivo**: `server/routes/userFeedbackRoutes.ts`

Endpoints:
- `POST /api/user-feedback` - Submeter feedback
- `GET /api/user-feedback/stats` - Estatísticas (admin)

### 6. Queries Administrativas
**Arquivo**: `supabase/migrations/20260120_feedback_admin_queries.sql`

Inclui:
- Queries de análise (distribuição, tendências, páginas)
- Function `get_feedback_stats()` - Estatísticas agregadas
- View `feedback_recente` - Feedback dos últimos 7 dias
- Scripts de manutenção e exportação

---

## 🔌 API Endpoint

### POST /api/user-feedback

**Descrição**: Submete feedback de usuário

**Headers**:
```
Content-Type: application/json
x-eco-guest-id: <uuid>        (obrigatório para guests)
x-eco-session-id: <uuid>      (opcional)
Authorization: Bearer <token> (opcional para autenticados)
```

**Request Body**:
```json
{
  "message": "Descrição do feedback (máx 1000 caracteres)",
  "category": "bug" | "feature" | "improvement" | "other",
  "page": "/caminho/da/pagina",
  "userAgent": "Mozilla/5.0..."
}
```

**Response 201 - Sucesso**:
```json
{
  "success": true,
  "message": "Feedback recebido com sucesso! Obrigado por contribuir.",
  "feedbackId": "uuid-do-feedback"
}
```

**Response 400 - Dados Inválidos**:
```json
{
  "success": false,
  "message": "Dados de entrada inválidos. Verifique os erros abaixo.",
  "errors": [
    "Mensagem não pode exceder 1000 caracteres (atual: 1523)",
    "Categoria inválida. Valores aceitos: bug, feature, improvement, other"
  ]
}
```

**Response 429 - Rate Limit**:
```json
{
  "success": false,
  "message": "Limite de 5 requisições a cada 15 minutos excedido. Tente novamente em 782 segundos.",
  "errors": ["Rate limit exceeded. Retry after 782 seconds"]
}
```

**Response 500 - Erro Interno**:
```json
{
  "success": false,
  "message": "Erro interno ao processar feedback. Tente novamente.",
  "errors": ["Error message details"]
}
```

---

## 🧪 Como Testar

### 1. Executar Migrações SQL

```bash
# Conectar ao Supabase via SQL Editor e executar:
# 1. supabase/migrations/20260120_create_user_feedback_table.sql
# 2. supabase/migrations/20260120_feedback_admin_queries.sql
```

### 2. Iniciar Servidor Backend

```bash
cd server
npm run dev
```

### 3. Testes com cURL

**Teste 1: Feedback básico**
```bash
curl -X POST http://localhost:3001/api/user-feedback \
  -H "Content-Type: application/json" \
  -H "x-eco-guest-id: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{"message":"Sistema está ótimo!","category":"improvement"}'
```

**Teste 2: Report de bug**
```bash
curl -X POST http://localhost:3001/api/user-feedback \
  -H "Content-Type: application/json" \
  -H "x-eco-guest-id: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{"message":"Encontrei um bug na página de login","category":"bug","page":"/login"}'
```

**Teste 3: Sugestão de feature**
```bash
curl -X POST http://localhost:3001/api/user-feedback \
  -H "Content-Type: application/json" \
  -H "x-eco-guest-id: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{"message":"Seria legal ter um modo escuro","category":"feature"}'
```

**Teste 4: Validar Rate Limiting**
```bash
# Executar este comando 6 vezes rapidamente
for i in {1..6}; do
  curl -X POST http://localhost:3001/api/user-feedback \
    -H "Content-Type: application/json" \
    -H "x-eco-guest-id: 550e8400-e29b-41d4-a716-446655440000" \
    -d '{"message":"Teste rate limit '$i'","category":"other"}'
  echo ""
done
# A 6ª requisição deve retornar erro 429
```

**Teste 5: Validar Mensagem Muito Longa**
```bash
# Mensagem com mais de 1000 caracteres (deve retornar erro 400)
curl -X POST http://localhost:3001/api/user-feedback \
  -H "Content-Type: application/json" \
  -H "x-eco-guest-id: 550e8400-e29b-41d4-a716-446655440000" \
  -d "{\"message\":\"$(python3 -c 'print("a" * 1001)')\"}"
```

**Teste 6: Validar UUID Inválido**
```bash
curl -X POST http://localhost:3001/api/user-feedback \
  -H "Content-Type: application/json" \
  -H "x-eco-guest-id: invalid-uuid" \
  -d '{"message":"Teste com UUID inválido"}'
```

### 4. Verificar no Supabase

```sql
-- Ver todos os feedbacks
SELECT * FROM user_feedback ORDER BY created_at DESC;

-- Ver feedbacks por categoria
SELECT category, COUNT(*) FROM user_feedback GROUP BY category;

-- Ver feedbacks recentes (últimas 24h)
SELECT * FROM user_feedback
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Usar a função de estatísticas
SELECT get_feedback_stats();

-- Usar a view de feedbacks recentes
SELECT * FROM feedback_recente LIMIT 10;
```

---

## 🔒 Segurança Implementada

### 1. Row-Level Security (RLS)
- ✅ Usuários autenticados só veem seus próprios feedbacks
- ✅ Guests podem inserir mas não visualizar
- ✅ Service role tem acesso total (admin)

### 2. Rate Limiting
- ✅ 5 requisições por 15 minutos por identificador
- ✅ Baseado em `guestId` ou `userId`
- ✅ Limpeza automática de registros expirados

### 3. Validação de Entrada
- ✅ Sanitização XSS (remove scripts, iframes, event handlers)
- ✅ Validação de UUID v4 para guest_id e session_id
- ✅ Limite de 1000 caracteres para mensagem
- ✅ Whitelist de categorias permitidas
- ✅ Validação de tipos TypeScript

### 4. CORS
- ✅ Headers CORS configurados via middleware global
- ✅ Whitelist de origens permitidas

---

## 📊 Queries Administrativas Úteis

### Distribuição por Categoria
```sql
SELECT
  category,
  COUNT(*) as total,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentual
FROM user_feedback
GROUP BY category
ORDER BY total DESC;
```

### Páginas com Mais Feedback
```sql
SELECT
  page,
  COUNT(*) as total_feedback,
  COUNT(CASE WHEN category = 'bug' THEN 1 END) as bugs,
  COUNT(CASE WHEN category = 'feature' THEN 1 END) as features
FROM user_feedback
WHERE page IS NOT NULL
GROUP BY page
ORDER BY total_feedback DESC
LIMIT 10;
```

### Tendências dos Últimos 7 Dias
```sql
SELECT
  DATE(created_at) as dia,
  COUNT(*) as total,
  COUNT(CASE WHEN category = 'bug' THEN 1 END) as bugs,
  COUNT(CASE WHEN category = 'feature' THEN 1 END) as features
FROM user_feedback
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY dia DESC;
```

### Usuários Mais Ativos
```sql
SELECT
  guest_id,
  COUNT(*) as total_feedback,
  MIN(created_at) as primeiro_feedback,
  MAX(created_at) as ultimo_feedback
FROM user_feedback
WHERE guest_id IS NOT NULL
GROUP BY guest_id
ORDER BY total_feedback DESC
LIMIT 20;
```

### Buscar Feedback com Palavras-Chave
```sql
SELECT * FROM user_feedback
WHERE message ILIKE '%bug%'
   OR message ILIKE '%erro%'
   OR message ILIKE '%problema%'
ORDER BY created_at DESC;
```

---

## 📈 Métricas de Monitoramento

### KPIs Importantes

1. **Volume de Feedback**
   - Total de feedbacks recebidos
   - Taxa de feedback por usuário ativo
   - Tendência ao longo do tempo

2. **Distribuição de Categorias**
   - Percentual de bugs vs features vs melhorias
   - Identificar áreas que precisam mais atenção

3. **Páginas Problemáticas**
   - Páginas com mais reports de bugs
   - Áreas que geram mais feedback

4. **Tempo de Resposta**
   - Latência do endpoint de feedback
   - Taxa de sucesso vs erro

5. **Rate Limiting**
   - Quantas vezes o rate limit foi ativado
   - Identificar possíveis abusos

### Logs para Monitorar

```typescript
// Logs emitidos pelo sistema:
'✅ Feedback salvo:' - Feedback persistido com sucesso
'⚠️ Rate limit atingido para:' - Rate limit ativado
'❌ Erro ao salvar feedback:' - Erro de persistência
```

---

## 🔧 Troubleshooting

### Erro: "Failed to insert feedback"
**Causa**: Problema com conexão Supabase ou políticas RLS
**Solução**:
1. Verificar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env`
2. Confirmar que as migrações SQL foram executadas
3. Verificar políticas RLS no Supabase Dashboard

### Erro: "Too many requests"
**Causa**: Rate limit ativado (5 req/15min)
**Solução**:
1. Aguardar 15 minutos ou usar outro `guestId`
2. Para testes, usar `clearRateLimitFor(identifier)` no código

### Erro: "Invalid UUID format"
**Causa**: guest_id ou session_id com formato inválido
**Solução**: Frontend deve gerar UUIDs v4 válidos usando biblioteca apropriada

### Erro: "Message too long"
**Causa**: Mensagem com mais de 1000 caracteres
**Solução**: Frontend deve limitar input a 1000 chars (usar `maxLength` no textarea)

---

## 🚀 Melhorias Futuras

### Dashboard Administrativo
- [ ] Interface web para visualizar feedbacks
- [ ] Filtros por categoria, data, página
- [ ] Sistema de priorização e triagem
- [ ] Marcar feedback como "resolvido" ou "em progresso"

### Notificações
- [ ] Email para admin quando feedback crítico chega
- [ ] Webhook para Slack/Discord em caso de bugs
- [ ] Integração com sistema de tickets (Jira, Linear)

### Análise Avançada
- [ ] Sentiment analysis do feedback (positivo/negativo/neutro)
- [ ] Agrupamento automático de temas similares
- [ ] Detecção de bugs recorrentes
- [ ] Sugestões de priorização baseadas em ML

### Gamificação
- [ ] Pontos para usuários que contribuem com feedback
- [ ] Badge "Colaborador" para usuários ativos
- [ ] Leaderboard de contribuidores

### Anexos e Contexto
- [ ] Upload de screenshots
- [ ] Captura automática de logs do navegador
- [ ] Gravação de sessão (replay)
- [ ] Informações de ambiente (browser, OS, screen size)

---

## 📝 Checklist de Deploy

- [ ] Migrações SQL executadas no Supabase (produção)
- [ ] Tabela `user_feedback` criada e indexada
- [ ] RLS policies ativas e testadas
- [ ] Variáveis de ambiente configuradas no servidor de produção
- [ ] Rate limiting testado e funcionando
- [ ] Validação de entrada testada (XSS, tamanho, formato)
- [ ] Frontend integrado e testado
- [ ] Logs configurados e sendo monitorados
- [ ] Queries administrativas documentadas e testadas
- [ ] Documentação atualizada

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verificar logs do servidor backend (`npm run dev`)
2. Verificar console do navegador (Network tab)
3. Consultar queries SQL de debug
4. Verificar se variáveis de ambiente estão corretas

**Documentação relacionada**:
- `CLAUDE.md` - Arquitetura geral do backend
- `supabase/migrations/` - Esquema do banco de dados

---

**Implementado por**: Claude Code
**Data**: 2026-01-20
**Versão**: 1.0
