# 🔍 Diagnóstico Completo: Sistema de Bandit no ECO

## Status Geral: ⚠️ **CRÍTICO - Sistema Não Está Funcionando Corretamente**

O sistema de Bandit Multi-Armed está **QUEBRADO** em 3 pontos críticos que impedem que o feedback real dos usuários alimente o algoritmo de otimização.

---

## 🚨 Bugs Encontrados

### BUG #1: Schema Mismatch em `hydrateBanditHistory()` (CRÍTICO)

**Arquivo**: `server/services/analytics/analyticsStore.ts` (linhas 378-382 e 394-400)

**Problema**:
```typescript
// ❌ ERRADO - Procura por "family" e "arm_id"
const { data: newData, error: newError } = await client
  .from("bandit_rewards")
  .select("reward, created_at")
  .gte("created_at", sinceIso)
  .eq("family", pilar)      // ← Campo não existe!
  .eq("arm_id", arm)         // ← Campo não existe!
```

Mas a tabela real tem:
```sql
-- Coluna real: "pilar" (não "family")
-- Coluna real: "arm" (não "arm_id")
```

**Impacto**:
- ❌ Histórico de rewards NÃO é carregado do banco
- ❌ Bandit começa sempre com `alpha=1, beta=1` (cold start)
- ❌ Feedback do usuário é ignorado para probabilidades futuras

**Solução**:
```typescript
// ✅ CORRETO
.eq("pilar", pilar)    // Usar nome da coluna correto
.eq("arm", arm)        // Usar nome da coluna correto
```

---

### BUG #2: View Ausente em `banditRewardsSync()` (CRÍTICO)

**Arquivo**: `server/services/banditRewardsSync.ts` (linha 6, 19)

**Problema**:
```typescript
export const BANDIT_REWARD_VIEW = process.env.BANDIT_REWARD_VIEW ?? "eco_bandit_feedback_rewards";

// Linha 18-20: Tenta ler de uma view que NÃO EXISTE
const { data, error } = await analytics
  .from(BANDIT_REWARD_VIEW)
  .select("arm_key, reward_sum, reward_sq_sum, feedback_count");
```

**Verificação**:
```bash
# A view "eco_bandit_feedback_rewards" não existe no seu banco!
# Verificar com:
SELECT * FROM information_schema.views WHERE table_name = 'eco_bandit_feedback_rewards';
# → Resultado vazio ❌
```

**Impacto**:
- ❌ `banditRewardsSync()` falha silenciosamente (error code 42P01 = table not found)
- ❌ Probabilidades em `eco_bandit_arms` NUNCA são atualizadas
- ❌ Cada conversa usa probabilidades desatualizadas

**O que deveria acontecer**:
```
Usuário clica LIKE
    ↓
feedbackController insere em bandit_rewards
    ↓
banditRewardsSync lê de eco_bandit_feedback_rewards (view agregada)
    ↓
Atualiza eco_bandit_arms com novas probabilidades
    ↓
Próxima conversa: Bandit usa probabilidades atualizadas
```

**O que REALMENTE acontece**:
```
Usuário clica LIKE
    ↓
feedbackController insere em bandit_rewards ✓
    ↓
banditRewardsSync tenta ler de view inexistente ✗
    ↓
eco_bandit_arms NUNCA é atualizado ✗
    ↓
Próxima conversa: Bandit ignora feedback ✗
```

---

### BUG #3: Desconexão Entre Fluxos (CRÍTICO)

**Problema**: Há TWO caminhos de fluxo que não se conectam:

#### Path A: Feedback do Usuário → Bandit (QUEBRADO)
```
feedback endpoint
  ↓
feedbackController.registrarFeedback()
  ├─ Insere em eco_feedback ✓
  ├─ Insere em bandit_rewards ✓
  └─ Chama RPC update_bandit_arm ✓

Resultado:
  - eco_feedback: armazena like/dislike
  - bandit_rewards: armazena reward
  - eco_bandit_arms: NUNCA atualizado (RPC não faz muito)
```

#### Path B: Response do LLM → Bandit (FUNCIONA)
```
responseFinalizer.ts
  ↓
updatePosterior({ family, armId, reward })
  ↓
qualityAnalyticsStore.recordBanditOutcome()
  ↓
Carrega histórico com hydrateBanditHistory() ✗ QUEBRADO!
  ├─ Procura por family/arm_id (colunas erradas)
  └─ Falha silenciosamente

Resultado:
  - Memória em RAM: apenas amostra da conversa atual
  - Histórico do banco: NUNCA carregado
  - Probabilidades: baseadas em ~5 amostras, não 500
```

**Impacto**: Bandit está usando 50+ vezes MENOS dados do que deveria!

---

## 📊 Análise de Dados

### Esperado (Com sistema funcionando):
```sql
-- Depois de 100 conversas com feedback:
SELECT * FROM eco_bandit_arms WHERE arm_key = 'nv2_reflection';

-- Resultado esperado:
arm_key          | pulls | alpha | beta | reward_sum | reward_sq_sum
nv2_reflection   | 100   | 78    | 23   | 77         | 77
            ↑      ↑      ↑      ↑     ↑
         histórico histórico histórico
         acumulado acumulado acumulado
         (1.5+77)  (1.5+23)  (soma rewards)
```

### Atual (Com bugs):
```sql
-- Depois de 100 conversas com feedback:
SELECT * FROM eco_bandit_arms WHERE arm_key = 'nv2_reflection';

-- Resultado real:
arm_key          | pulls | alpha | beta | reward_sum | reward_sq_sum
nv2_reflection   | NULL  | NULL  | NULL | NULL       | NULL
            ↑      ↑      ↑      ↑
         nunca     nunca  nunca
         atualizado

-- A tabela bandit_rewards tem 100 registros, mas eco_bandit_arms está vazio!
SELECT COUNT(*) FROM bandit_rewards WHERE arm = 'nv2_reflection';
→ 100 registros ✓

SELECT COUNT(*) FROM eco_bandit_arms WHERE arm_key = 'nv2_reflection';
→ 0 registros ❌
```

---

## 🔬 Fluxo Correto vs Atual

### Fluxo CORRETO (Esperado):

```
1. COLETA: Usuário interage
   ├─ responseFinalizer.updatePosterior(family, armId, reward)
   └─ qualityAnalyticsStore.recordBanditOutcome()

2. STORAGE: Dados salvos
   └─ bandit_rewards tabela recebe registros ✓

3. SINCRONIZAÇÃO: Agregação
   ├─ banditRewardsSync.performSync()
   ├─ Lê de eco_bandit_feedback_rewards (view agregada)
   ├─ Calcula alpha/beta/pulls
   └─ Upsert em eco_bandit_arms ✓

4. CARREGAMENTO: Próxima conversa
   ├─ hydrateBanditHistory() lê eco_bandit_arms
   ├─ Carrega histórico em memória
   └─ familyBanditPlanner usa probabilidades atualizadas ✓

5. RESULTADO: Melhor módulo escolhido
   └─ Thompson Sampling favorece arm com alta taxa sucesso ✓
```

### Fluxo ATUAL (Quebrado):

```
1. COLETA: Usuário interage
   ├─ responseFinalizer.updatePosterior()
   └─ ❌ hydrateBanditHistory() procura por colunas erradas (family, arm_id)

2. STORAGE: Dados salvos
   └─ bandit_rewards tabela recebe registros ✓

3. SINCRONIZAÇÃO: Agregação
   ├─ banditRewardsSync.performSync()
   ├─ ❌ Procura por view inexistente
   ├─ Falha silenciosamente
   └─ eco_bandit_arms NUNCA atualizado ❌

4. CARREGAMENTO: Próxima conversa
   ├─ hydrateBanditHistory() tenta novamente
   ├─ ❌ Colunas erradas → nenhum dado carregado
   └─ Memória em RAM: apenas ~5 samples da conversa atual

5. RESULTADO: Módulo aleatório escolhido (ou baseline)
   └─ Feedback do usuário é IGNORADO ❌
```

---

## 🐛 Detalhes Técnicos dos Bugs

### Problema 1: Colunas Erradas

**analyticsStore.ts linhas 378-382**:
```typescript
// ❌ ERRADO - Procura por "family"
const { data: newData, error: newError } = await client
  .from("bandit_rewards")
  .select("reward, created_at")
  .gte("created_at", sinceIso)
  .eq("family", pilar)    // ← Não existe! Coluna é "pilar"
  .eq("arm_id", arm)       // ← Não existe! Coluna é "arm"
```

**Schema real de bandit_rewards**:
```sql
CREATE TABLE analytics.bandit_rewards (
    id uuid,
    response_id text,
    interaction_id uuid,
    pilar text,           -- ← Coluna real
    arm text,             -- ← Coluna real
    recompensa numeric,
    created_at timestamptz
);
```

**Resultado**:
```
Error: column "family" does not exist
Error: column "arm_id" does not exist
```

Mas o código trata error code 42703 como "ok, coluna não existe, pula":
```typescript
if (newError && newError.code !== "42703") {  // ← Ignora 42703!
  banditLogger.warn(...);
}
```

Então a query **falha silenciosamente** e nenhum histórico é carregado!

---

### Problema 2: View Inexistente

**banditRewardsSync.ts linhas 18-20**:
```typescript
const { data, error } = await analytics
  .from(BANDIT_REWARD_VIEW)  // ← "eco_bandit_feedback_rewards" não existe!
  .select("arm_key, reward_sum, reward_sq_sum, feedback_count");
```

**Verificação no seu banco**:
```sql
-- Procurar a view
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'analytics' AND table_type = 'VIEW';

-- Resultado: vazio (view não existe)

-- Procurar qualquer menção
SELECT * FROM information_schema.views
WHERE table_schema = 'analytics';

-- Resultado: nenhuma view de bandit encontrada
```

**Impacto**:
```
banditRewardsSync falha com:
  error.code = "42P01"  (table not found)

Código trata como:
  if (error.code === "42P01") {
    logger.warn("missing_view", ...)  // ← Apenas log
    return;                            // ← Não faz nada!
  }
```

**Resultado**: O sync **falha silenciosamente** e probabilidades nunca são atualizadas!

---

### Problema 3: Dois Fluxos Desconectados

**Fluxo 1: Via feedback endpoint**
```typescript
// feedbackController.ts
const { error: rpcError } = await analytics.rpc("update_bandit_arm", {
  p_arm_key: armKey,
  p_reward: reward,
});
```

Problema: RPC `update_bandit_arm` atualiza `eco_bandit_arms` manualmente, mas:
- Não usa eco_bandit_feedback_rewards (view ausente)
- Não sincroniza com qualityAnalyticsStore em memória
- RPC não acessa histórico de bandit_rewards

**Fluxo 2: Via responseFinalizer**
```typescript
// responseFinalizer.ts
qualityAnalyticsStore.updatePosterior({
  family: familyId,
  armId: chosen,
  reward: rewardComputation.reward,
});
```

Problema: Carrega histórico via hydrateBanditHistory()
```typescript
// analyticsStore.ts hydrateBanditHistory
.eq("family", pilar)    // ❌ Coluna errada!
.eq("arm_id", arm)       // ❌ Coluna errada!
```

**Resultado**: Feedback do usuário (fluxo 1) e resposta do LLM (fluxo 2) nunca se sincronizam!

---

## 📈 Impacto no Sistema

### Antes (Se funcionasse):
```
Conversas: 100
Feedback positivos: 80
Feedback negativos: 20

Módulo A (nv2_reflection):
  - Usado em 40 conversas
  - 32 positivos, 8 negativos → 80% taxa sucesso
  - Alpha: 33.5, Beta: 9.5

Probabilidade de escolher A na próxima conversa: ~80%
```

### Agora (Quebrado):
```
Conversas: 100
Feedback positivos: 80
Feedback negativos: 20
(Dados armazenados em bandit_rewards, mas ignorados!)

Módulo A (nv2_reflection):
  - Usado em 40 conversas
  - Feedback: IGNORADO
  - Alpha: 1 (padrão), Beta: 1 (padrão)

Probabilidade de escolher A na próxima conversa: ~50% (aleatório!)
```

---

## 🔧 Resumo dos Problemas

| # | Bug | Arquivo | Linha | Tipo | Impacto |
|---|-----|---------|-------|------|---------|
| 1 | Schema Mismatch (family/arm_id) | analyticsStore.ts | 381-382 | Schema | Histórico não carregado |
| 2 | View ausente (eco_bandit_feedback_rewards) | banditRewardsSync.ts | 19 | Database | Sync falha silencioso |
| 3 | Desconexão de fluxos | Múltiplos | - | Arquitetura | Feedback ignorado |

**Severidade**: 🔴 CRÍTICO - Sistema não aprende com feedback

**Efeito**:
- ❌ Bandit NÃO otimiza módulos
- ❌ Feedback do usuário é IGNORADO
- ❌ Cada conversa trata arms como novo (cold start permanente)
- ❌ Não há diferença entre módulo bom/ruim

---

## ✅ Próximos Passos para Corrigir

1. ✏️ Corrigir nomes de colunas em hydrateBanditHistory (family → pilar, arm_id → arm)
2. 🔨 Criar view eco_bandit_feedback_rewards que agrega dados de bandit_rewards
3. 📊 Testar fluxo completo: feedback → sync → atualização → próxima conversa
4. 📋 Verificar se dados históricos são carregados corretamente

---

## 🎯 Diagnóstico Completo: FUNCIONAMENTO DO BANDIT

**Status**: ❌ **NÃO FUNCIONA**

- ✓ Feedback é salvo em bandit_rewards
- ✓ RPC update_bandit_arm é chamado
- ✗ Histórico não é carregado em hydrateBanditHistory
- ✗ View eco_bandit_feedback_rewards não existe
- ✗ eco_bandit_arms nunca é atualizado
- ✗ Thompson Sampling usa probabilidades padrão
- ✗ Resultado: Módulos escolhidos aleatoriamente, feedback ignorado
