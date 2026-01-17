# Feedback System - Backend to Frontend Error Mapping

## Problema
Frontend está recebendo `FeedbackRequestError: bandit_reward_failed` ao tentar enviar feedback.

---

## Raiz do Problema (Backend)

### ❌ Erro Original
```
[2025-11-05T19:06:17.742Z] [ERROR] [feedback-controller] feedback.bandit_reward_failed
{
  "response_id":"eco-4f38fd49-6e8c-4973-a242-e74eea5ec06b",
  "arm":"developer_prompt.txt",
  "message":"invalid input syntax for type uuid: \"eco-4f38fd49-6e8c-4973-a242-e74eea5ec06b\"",
  "code":"22P02"
}
```

### 🔍 Causa
O backend estava tentando inserir um `response_id` com formato inválido:
- **Recebido**: `"eco-4f38fd49-6e8c-4973-a242-e74eea5ec06b"` (com prefixo "eco-")
- **Esperado**: UUID puro (ex: `"4f38fd49-6e8c-4973-a242-e74eea5ec06b"`)
- **Campo no BD**: `bandit_rewards.response_id` é tipo `UUID`

---

## Correções Implementadas no Backend ✅

### 1. **Migração Supabase**
**Arquivo**: `supabase/migrations/add_feedback_columns.sql`

```sql
-- Adicionou colunas faltantes à tabela eco_feedback
ALTER TABLE analytics.eco_feedback
ADD COLUMN IF NOT EXISTS message_id TEXT,
ADD COLUMN IF NOT EXISTS arm TEXT,
ADD COLUMN IF NOT EXISTS pillar TEXT DEFAULT 'geral',
ADD COLUMN IF NOT EXISTS prompt_hash TEXT,
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ;
```

**Status**: ✅ Criado - Precisa executar no Supabase

### 2. **Correção no Controller**
**Arquivo**: `server/controllers/feedbackController.ts` (linha 166)

**Antes**:
```typescript
const rewardPayload = {
  response_id: responseId,  // ❌ Pode ter formato "eco-{uuid}"
  pilar: pillar,
  arm: armKey,
  recompensa: reward,
};
```

**Depois**:
```typescript
const rewardPayload = {
  response_id: interactionId,  // ✅ Sempre UUID puro
  pilar: pillar,
  arm: armKey,
  recompensa: reward,
};
```

**Status**: ✅ Corrigido

---

## O Que o Frontend Precisa Fazer

### 🚀 Passo 1: Aplicar Migração no Supabase
**Localização**: `supabase/migrations/add_feedback_columns.sql`

```bash
# Opção 1: CLI Supabase
supabase migration up

# Opção 2: Dashboard Manual
# 1. Acesse Supabase Dashboard
# 2. Vá para: SQL Editor
# 3. Cole o conteúdo do arquivo add_feedback_columns.sql
# 4. Execute
```

**Verificar**: As colunas foram adicionadas
```sql
-- No SQL Editor, execute:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'eco_feedback'
  AND table_schema = 'analytics'
ORDER BY ordinal_position;
```

Resultado esperado:
```
| column_name  | data_type                |
|--------------|------------------------|
| id           | uuid                   |
| interaction_id | uuid                 |
| message_id   | text                   | ← Novo
| arm          | text                   | ← Novo
| pillar       | text                   | ← Novo
| prompt_hash  | text                   | ← Novo
| timestamp    | timestamp with tz      | ← Novo
| user_id      | uuid                   |
| session_id   | text                   |
| vote         | user-defined           |
| reason       | text[]                 |
| created_at   | timestamp with tz      |
```

### 🚀 Passo 2: Aguardar Refresh do Schema Cache PostgREST
Após aplicar a migração:

```bash
# Opção 1: Aguardar (automático)
sleep 30  # PostgREST atualiza a cada ~30 segundos

# Opção 2: Reiniciar Backend
npm run dev  # ou npm start

# Opção 3: Forçar Refresh Manual (Supabase Dashboard)
# Project Settings → API → Schema Cache → Refresh
```

### 🚀 Passo 3: Testar Endpoint de Feedback
**URL**: `POST /api/feedback`

**Request Exemplo**:
```json
{
  "interaction_id": "12f9dab9-9cf2-4f21-9ff3-46146aceafe5",
  "message_id": "eco-d431d3c0-a930-4055-9776-177e1d955a46",
  "vote": "up",
  "reason": null,
  "arm": "baseline",
  "pillar": "geral",
  "prompt_hash": null,
  "user_id": "bdd819b4-d7b4-4700-b8e6-7172ab6fd68f",
  "session_id": "2d2686e5-e4b0-45eb-9491-f71c9a5a964a"
}
```

**Response Esperado**: `204 No Content`

**Não receber mais**:
```json
{
  "code": "22P02",
  "message": "invalid input syntax for type uuid"
}
```

---

## Fluxo Completo: Frontend → Backend → Banco

### ❌ Antes (Com Bug)

```
Frontend (EcoMessageWithAudio.tsx)
    ↓
POST /api/feedback
    ↓
feedbackController.ts
    ├─ Lê: message_id = "eco-d431d3c0-a930..."
    ├─ Cria: rewardPayload.response_id = "eco-d431d3c0-a930..."
    └─ Tenta inserir em bandit_rewards
        ↓
Supabase (bandit_rewards.response_id = UUID)
    ↓
❌ ERRO 22P02: "invalid input syntax for type uuid"
    ↓
Frontend recebe: FeedbackRequestError: bandit_reward_failed
```

### ✅ Depois (Corrigido)

```
Frontend (EcoMessageWithAudio.tsx)
    ↓
POST /api/feedback
    ↓
feedbackController.ts
    ├─ Lê: message_id = "eco-d431d3c0-a930..."
    ├─ Cria: rewardPayload.response_id = "12f9dab9-9cf2-4f21-9ff3-..." (interactionId)
    └─ Tenta inserir em bandit_rewards
        ↓
Supabase (bandit_rewards.response_id = UUID)
    ↓
✅ Sucesso: Reward inserido
    ├─ eco_feedback.message_id = "eco-d431d3c0-a930..." (salvo com "eco-")
    ├─ bandit_rewards.response_id = "12f9dab9-9cf2..." (UUID puro)
    └─ Feedback persistido corretamente
        ↓
Frontend recebe: 204 No Content
```

---

## Checklist de Verificação

- [ ] **Backend**: Migração criada em `supabase/migrations/add_feedback_columns.sql`
- [ ] **Backend**: Código corrigido em `feedbackController.ts` linha 166
- [ ] **Supabase**: Migração aplicada (via CLI ou dashboard)
- [ ] **PostgREST**: Schema cache refreshed (esperou 30s ou reiniciou)
- [ ] **Backend**: Redeployado (se em produção)
- [ ] **Frontend**: Tentar enviar feedback novamente
- [ ] **Verificação**: Feedback salvo em `analytics.eco_feedback`
- [ ] **Verificação**: Reward salvo em `analytics.bandit_rewards`

---

## Comandos de Debug (SQL)

### Verificar Feedback Inserido
```sql
SELECT
  id,
  interaction_id,
  message_id,
  arm,
  pillar,
  vote,
  created_at
FROM analytics.eco_feedback
ORDER BY created_at DESC
LIMIT 5;
```

### Verificar Reward Inserido
```sql
SELECT
  id,
  response_id,
  arm,
  pilar,
  recompensa,
  created_at
FROM analytics.bandit_rewards
ORDER BY created_at DESC
LIMIT 5;
```

### Verificar Unique Index (Não há duplicatas)
```sql
-- Deve retornar 1 linha por (response_id, arm)
SELECT response_id, arm, COUNT(*) as count
FROM analytics.bandit_rewards
GROUP BY response_id, arm
HAVING COUNT(*) > 1;
-- Se vazio, está correto (sem duplicatas)
```

---

## Possíveis Erros Remanescentes

### Erro 1: "PGRST204 Could not find the 'arm' column"
**Causa**: Schema cache não foi refreshed
**Solução**:
```bash
# Aguardar 30 segundos OU
npm run dev  # Reiniciar backend OU
# Forçar refresh no dashboard Supabase
```

### Erro 2: "Interação não encontrada (404)"
**Causa**: `interaction_id` está nulo ou incorreto
**Solução**:
- Verificar se `eco_interactions` tem o registro
- Verificar se o `interaction_id` está sendo passado corretamente do frontend

### Erro 3: "Constraint violation (23503)"
**Causa**: `interaction_id` não existe em `eco_interactions`
**Solução**:
```sql
-- Verificar se a interação existe
SELECT * FROM analytics.eco_interactions
WHERE id = '{seu_interaction_id}';
```

---

## Timeline Esperado

1. **Agora**: Backend corrigido + migração criada ✅
2. **Imediatamente**: Aplicar migração no Supabase (5 minutos)
3. **Depois**: Aguardar refresh do cache (30 segundos)
4. **Depois**: Testar feedback no frontend (1 minuto)
5. **Esperado**: ✅ Feedback funcionando

**Tempo total**: ~5-10 minutos

---

## Referências

- **Backend Code**: `server/controllers/feedbackController.ts:165-170`
- **Frontend Error**: `EcoMessageWithAudio.tsx:381` (feedback_send_error)
- **Database Schema**: `supabase/schema/analytics_schema.sql`
- **Migration**: `supabase/migrations/add_feedback_columns.sql`

---

## Dúvidas Frequentes

**P: Por que não usar `message_id` para `bandit_rewards.response_id`?**
R: Porque `message_id` pode ter formato "eco-{uuid}" (text), enquanto `bandit_rewards.response_id` espera UUID puro. `interactionId` é sempre UUID válido.

**P: Vai perder dados ao mudar para `interactionId`?**
R: Não! O `message_id` continua sendo salvo em `eco_feedback.message_id` com o formato "eco-". Apenas o bandit reward usa `interactionId`.

**P: Preciso fazer algo no frontend?**
R: Apenas aplicar a migração no Supabase. O frontend continua enviando os mesmos dados - o backend agora trata corretamente.

**P: Isso vai quebrar análises antigas?**
R: Não! Está apenas corrigindo dados futuros. Dados antigos permancem intactos.

