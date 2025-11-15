# 🔧 Guia Rápido: Aplicar Correções do Sistema Bandit

## Status: Fixes Desenvolvidas e Commitadas

Todos os 3 bugs críticos foram corrigidos. Agora você precisa **aplicar as mudanças ao seu banco de dados**.

---

## 📋 Mudanças Feitas

### 1. ✅ Code Fix (Já Aplicado)
- **Arquivo**: `server/services/analytics/analyticsStore.ts`
- **Mudança**: Corrigido hydrateBanditHistory para usar nomes de colunas corretos
- **Status**: Commitado ✓

### 2. ⏳ Database Fix #1 (Você Precisa Aplicar)
- **Arquivo**: `supabase/migrations/20251109_create_bandit_rewards_table.sql`
- **Ação**: Criar tabela `bandit_rewards` (se ainda não existe)
- **Status**: Migration criada, pronta para aplicar

### 3. ⏳ Database Fix #2 (Você Precisa Aplicar)
- **Arquivo**: `supabase/migrations/20251109_create_bandit_feedback_rewards_view.sql`
- **Ação**: Criar view `eco_bandit_feedback_rewards`
- **Status**: Migration criada, pronta para aplicar

---

## 🚀 Como Aplicar as Mudanças

### Opção 1: Via Supabase Dashboard (Recomendado)

#### Passo 1: Criar tabela bandit_rewards
```sql
-- Copie e execute no SQL Editor do Supabase

create table if not exists analytics.bandit_rewards (
    id uuid primary key default gen_random_uuid(),
    response_id text not null,
    interaction_id uuid references analytics.eco_interactions (id) on delete cascade,
    pilar text not null,
    arm text not null,
    recompensa numeric not null,
    created_at timestamptz not null default now()
);

-- Criar índices
create index if not exists bandit_rewards_response_id_idx on analytics.bandit_rewards (response_id);
create index if not exists bandit_rewards_arm_idx on analytics.bandit_rewards (arm);
create index if not exists bandit_rewards_created_at_idx on analytics.bandit_rewards (created_at desc);

-- Conceder permissões
grant select, insert, update, delete on analytics.bandit_rewards to service_role;
```

#### Passo 2: Criar view eco_bandit_feedback_rewards
```sql
-- Copie e execute no SQL Editor do Supabase

create or replace view analytics.eco_bandit_feedback_rewards as
select
  arm as arm_key,
  sum(case when recompensa >= 0.5 then 1 else 0 end)::bigint as feedback_count,
  sum(recompensa)::numeric as reward_sum,
  sum(recompensa * recompensa)::numeric as reward_sq_sum
from analytics.bandit_rewards
group by arm;

-- Conceder permissões
grant select on analytics.eco_bandit_feedback_rewards to service_role;
```

#### Passo 3: Verificar Sucesso
```sql
-- Verificar que tudo foi criado

-- 1. Tabela existe
SELECT COUNT(*) as table_exists FROM information_schema.tables
WHERE table_schema = 'analytics' AND table_name = 'bandit_rewards';
-- Resultado esperado: 1

-- 2. View existe
SELECT COUNT(*) as view_exists FROM information_schema.views
WHERE table_schema = 'analytics' AND table_name = 'eco_bandit_feedback_rewards';
-- Resultado esperado: 1

-- 3. Colunas corretas
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'analytics' AND table_name = 'bandit_rewards'
ORDER BY ordinal_position;
-- Esperado: id, response_id, interaction_id, pilar, arm, recompensa, created_at
```

---

### Opção 2: Via Supabase CLI (Se Disponível)

```bash
# Navegar ao diretório do projeto
cd ecobackend888

# Aplicar migrações pendentes
supabase db push

# Verificar status
supabase migration list
```

---

### Opção 3: Via Deploy no Render

1. **Fazer git push** (já tem os commits):
   ```bash
   git push origin main
   ```

2. **Render aplicará automaticamente** as migrações durante o deploy

3. **Verificar logs do Render** para confirmar sucesso

---

## ✅ Verificação Pós-Implementação

Depois de aplicar as correções, execute estas queries para verificar:

### Query 1: Confirmar Estrutura
```sql
-- Verificar tabela bandit_rewards
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'analytics' AND table_name = 'bandit_rewards'
ORDER BY ordinal_position;

-- Esperado:
-- id          | uuid                   | NO
-- response_id | text                   | NO
-- interaction_id | uuid               | YES
-- pilar       | text                   | NO
-- arm         | text                   | NO
-- recompensa  | numeric                | NO
-- created_at  | timestamp with tz      | NO
```

### Query 2: Confirmar View
```sql
-- Verificar view existe
SELECT table_name FROM information_schema.views
WHERE table_schema = 'analytics' AND table_name = 'eco_bandit_feedback_rewards';

-- Esperado: 1 linha com "eco_bandit_feedback_rewards"
```

### Query 3: Testar View
```sql
-- Testar que a view funciona
SELECT * FROM analytics.eco_bandit_feedback_rewards LIMIT 5;

-- Esperado: coluna (vazia se sem dados ainda)
-- arm_key | feedback_count | reward_sum | reward_sq_sum
```

### Query 4: Confirmar Índices
```sql
-- Verificar índices
SELECT indexname FROM pg_indexes
WHERE schemaname = 'analytics' AND tablename = 'bandit_rewards';

-- Esperado:
-- bandit_rewards_response_id_idx
-- bandit_rewards_arm_idx
-- bandit_rewards_created_at_idx
```

---

## 🧪 Teste Completo do Fluxo

Depois de aplicar as mudanças, teste este fluxo:

### Teste 1: Feedback é registrado
```bash
# 1. Enviar mensagem
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -H "X-Eco-Guest-Id: test-user" \
  -d '{"mensagem": "Estou triste"}'

# Resultado esperado: response com interaction_id (ex: abc123)
```

### Teste 2: Feedback é armazenado
```bash
# 2. Enviar feedback
curl -X POST http://localhost:3001/api/feedback \
  -H "Content-Type: application/json" \
  -H "X-Eco-Guest-Id: test-user" \
  -d '{"interaction_id": "abc123", "vote": "up"}'

# Esperado: HTTP 204 (sucesso)
```

### Teste 3: Dado está no banco
```sql
-- 3. Verificar dados no banco
SELECT * FROM analytics.bandit_rewards
ORDER BY created_at DESC LIMIT 5;

-- Esperado: 1+ linhas com pilar="behavioral", arm="...", recompensa=1
```

### Teste 4: View agrega dados
```sql
-- 4. Verificar agregação
SELECT * FROM analytics.eco_bandit_feedback_rewards
WHERE arm_key IS NOT NULL;

-- Esperado: feedback_count > 0, reward_sum > 0
```

### Teste 5: Sync atualiza eco_bandit_arms
```sql
-- 5. Checar se arm foi atualizado
SELECT * FROM analytics.eco_bandit_arms
WHERE arm_key IS NOT NULL
ORDER BY last_update DESC LIMIT 5;

-- Esperado: pulls > 0, alpha > 1, beta > 1
```

---

## 🔍 Troubleshooting

### Problema: "table 42P01: does not exist"
```
Solução: Você ainda não criou a tabela bandit_rewards
→ Execute a query do Passo 1 acima
```

### Problema: "view does not exist in eco_bandit_feedback_rewards"
```
Solução: Você ainda não criou a view
→ Execute a query do Passo 2 acima
```

### Problema: Feedback ainda retorna erro 500
```sql
-- 1. Verifique se tabela tem índices corretos
SELECT indexname FROM pg_indexes
WHERE tablename = 'bandit_rewards';

-- 2. Verifique permissões
SELECT grantee, privilege_type
FROM role_table_grants
WHERE table_name='bandit_rewards';

-- 3. Verifique constraints
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'bandit_rewards';
```

### Problema: banditRewardsSync não é executado
```
Logs esperados:
[bandit-reward-sync] bandit.sync (trigger, touched_arms, avg_reward, duration_ms)

Se não vê isso:
1. Verifique BANDIT_REWARD_SYNC_DISABLED != "1"
2. Verifique se startBanditRewardSyncScheduler() é chamado em server.ts
3. Verifique logs: ECO_DEBUG=true npm run dev
```

---

## 📊 Antes vs Depois

### Antes (Quebrado ❌)
```
User → Feedback → bandit_rewards (INSERT OK)
                  ↓
                  banditRewardsSync (procura view inexistente)
                  ↓
                  eco_bandit_arms (NUNCA atualizado)
                  ↓
                  Próxima conversa: Thompson Sampling usa padrão
```

### Depois (Funcionando ✅)
```
User → Feedback → bandit_rewards (INSERT OK)
                  ↓
                  eco_bandit_feedback_rewards (VIEW agrega)
                  ↓
                  banditRewardsSync (lê da view)
                  ↓
                  eco_bandit_arms (ATUALIZADO com alpha/beta/pulls)
                  ↓
                  Próxima conversa: Thompson Sampling usa dados reais
```

---

## 📝 Commits Relacionados

```bash
565e7b4 fix: Create missing bandit_rewards table
61f4ef8 fix: Critical bandit system bugs preventing feedback optimization
```

---

## 🎯 Status Pós-Implementação

Depois de completar estes passos:
- ✅ Sistema de Bandit estará funcionando
- ✅ Feedback do usuário será otimizado
- ✅ Módulos com melhor performance serão favorecidos
- ✅ Thompson Sampling usará dados reais

**Tempo para implementar**: ~15 minutos
**Dificuldade**: Baixa (copiar/colar SQL)
**Crítico**: Sim - sem isso, feedback é ignorado!
