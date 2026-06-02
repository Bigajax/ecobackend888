# 🔍 DIAGNÓSTICO: Por que Memórias NÃO estão sendo salvas

**Data**: 15 de Novembro de 2025
**Status**: ❌ **CRÍTICO - Evento SSE `memory_saved` NÃO está sendo enviado ao frontend**
**Root Cause**: Fluxo de salvação de memória incompleto e estrutura de evento inadequada

---

## 📊 RESUMO EXECUTIVO

### O que deveria acontecer:
```
1. User envia mensagem com intensidade >= 7
   ↓
2. Backend calcula decision.saveMemory = true
   ↓
3. Backend salva memória no banco
   ↓
4. Backend EMITE evento SSE: type="memory_saved" com dados completos
   ↓
5. Frontend recebe evento e chama registrarMemoria() automaticamente
```

### O que está acontecendo:
```
1. User envia mensagem com intensidade >= 7
   ↓
2. Backend calcula decision.saveMemory = true ✅
   ↓
3. Backend TENTA salvar memória (parcialmente) ⚠️
   ↓
4. Backend NÃO EMITE evento SSE corretamente ❌
   ↓
5. Frontend nunca sabe que memória foi salva ❌
```

---

## 🔴 PROBLEMAS ENCONTRADOS

### PROBLEMA #1: Salvação de memória ocorre durante geração de bloco técnico

**Localização**: `streamingOrchestrator.ts:398-415`

**Código atual**:
```typescript
// Apenas tenta salvar quando bloco técnico é gerado com sucesso
if (!isGuest && supabaseClient) {
  try {
    const rpcRes = await salvarMemoriaViaRPC({
      supabase: supabaseClient,
      userId,
      mensagemId: lastMessageId ?? null,
      meta: metaPayload,
      origem: "streaming_bloco",
    });

    if (rpcRes.saved && rpcRes.memoriaId) {
      await emitStream({
        type: "control",
        name: "memory_saved",
        meta: {
          memoriaId: rpcRes.memoriaId,
          primeiraMemoriaSignificativa: !!rpcRes.primeira,
          intensidade: metaPayload.intensidade,
        },
      });
    }
  } catch (error: any) {
    log.warn("[StreamingBloco] salvarMemoriaViaRPC falhou (ignorado)", ...);
  }
}
```

**Problemas**:
1. ❌ Salvação só ocorre se o bloco técnico for gerado com sucesso
2. ❌ Se o bloco falhar ou timeout, a memória NÃO é salva
3. ❌ Só é testada a condição `rpcRes.saved && rpcRes.memoriaId`, mas pode haver outros cenários

**Verificação em `memoryPersistence.ts:16`**:
```typescript
if (meta.intensidade < 7) {
  return { saved: false, primeira: false, memoriaId: null };
}
```
- Correto: só salva se intensidade >= 7 ✅

---

### PROBLEMA #2: Estrutura do evento SSE é inadequada

**Localização**: `streamingOrchestrator.ts:407-415`

**Evento atual enviado**:
```json
{
  "type": "memory_saved",
  "payload": {
    "saved": true,
    "meta": {
      "memoriaId": "uuid-123",
      "primeiraMemoriaSignificativa": false,
      "intensidade": 8
    }
  }
}
```

**Evento esperado pelo frontend** (veja `DIAGNOSTICO_MEMORIA_FRONTEND.md`):
```json
{
  "type": "memory_saved",
  "payload": {
    "memory": {
      "id": "uuid-123",
      "usuario_id": "user-uuid",
      "resumo_eco": "Usuário relatou sentimento de tristeza extrema...",
      "emocao_principal": "tristeza",
      "intensidade": 9,
      "contexto": "Contexto completo",
      "dominio_vida": "relacionamento",
      "padrao_comportamental": "Padrão identificado",
      "categoria": "emocional",
      "nivel_abertura": 3,
      "analise_resumo": "Análise completa",
      "tags": ["tristeza", "intenso"],
      "created_at": "2025-11-15T12:00:00Z"
    },
    "primeiraMemoriaSignificativa": false
  }
}
```

**Diferenças críticas**:
1. ❌ Falta campo `memory` wrapper
2. ❌ Falta `usuario_id` (crítico para o frontend saber a qual usuário atribuir)
3. ❌ Falta `resumo_eco` (conteúdo da memória)
4. ❌ Falta `emocao_principal` (emoção principal)
5. ❌ Falta `contexto` (contexto da conversa)
6. ❌ Falta `dominio_vida` (domain de vida)
7. ❌ Falta `padrao_comportamental` (padrão)
8. ❌ Falta `categoria` (categoria)
9. ❌ Falta `nivel_abertura` (nível de abertura)
10. ❌ Falta `analise_resumo` (análise)
11. ❌ Falta `tags` (tags)
12. ❌ Falta `created_at` (timestamp)

---

### PROBLEMA #3: Memória em background NUNCA envia evento

**Localização**: `responseFinalizer.ts:439-599`

**Função**: `persistirMemoriaEmBackground`

**Código**:
```typescript
private async persistirMemoriaEmBackground(params: {
  userId?: string;
  supabase?: any;
  // ... outras props
  ecoDecision: EcoDecisionResult;
}): Promise<void> {
  // ... validações ...

  const saveOutcome = await this.deps.saveMemoryOrReference({
    supabase,
    userId,
    lastMessageId,
    cleaned,
    bloco: blocoParaSalvar,
    ultimaMsg,
    decision: ecoDecision,
  });

  // ❌ NÃO EMITE EVENTO SSE NENHUM!
}
```

**Problemas**:
1. ❌ Salva memória mas NÃO tem acesso ao `emitStream` para enviar evento
2. ❌ É executada em background (line 1202), sem sincronização com SSE
3. ❌ Não há forma do frontend saber que memória foi salva por esse caminho

---

### PROBLEMA #4: Dois caminhos de salvação competindo

```
┌─ CAMINHO A: Via RPC durante streaming ──────────────────┐
│ streamingOrchestrator.ts:398                             │
│ ├─ Só funciona se bloco técnico for gerado com sucesso   │
│ ├─ Tenta emitir evento memory_saved (mas com formato errado)
│ └─ ✅ Tem acesso ao emitStream                           │
│                                                           │
├─ CAMINHO B: Via background após resposta ────────────────┤
│ responseFinalizer.ts:439                                 │
│ ├─ Sempre é executado (se não for guest)                 │
│ ├─ ❌ NÃO emite nenhum evento                            │
│ └─ ❌ Sem acesso ao emitStream                           │
│                                                           │
└─ RESULTADO: Confusão sobre qual caminho foi usado ───────┘
```

---

### PROBLEMA #5: Nenhum teste garante que evento é enviado

**Localização**: `server/tests/contract/askEco.sse.spec.ts:252`

```typescript
{
  name: "memory_saved",
  // ... test expectations ...
}
```

- ⚠️ Teste espera o evento, mas ninguém garante que seja enviado com a estrutura correta

---

## 📋 CHECKLIST: Verificações feitas

### ✅ Memória é identificada para salvamento?
- **Resposta**: SIM
- **Onde**: `ecoDecisionHub.ts` + `responseFinalizer.ts:539`
- **Condição**: `decision.saveMemory && intensity >= 7`

### ❌ Evento SSE memory_saved é enviado ao cliente?
- **Resposta**: PARCIALMENTE
- **Situação**: Apenas durante geração de bloco técnico, e com estrutura errada
- **Frequência**: Nem sempre (depende de timeout do bloco)

### ❌ Estrutura do evento é adequada?
- **Resposta**: NÃO
- **Problema**: Faltam campos críticos esperados pelo frontend
- **Impacto**: Frontend não consegue processar o evento corretamente

### ❌ Há sincronização entre salvação em background e evento?
- **Resposta**: NÃO
- **Problema**: Função background não tem acesso ao emitStream
- **Impacto**: Memória salva em background é invisível ao frontend

---

## 🚀 SOLUÇÃO RECOMENDADA

### Passo 1: Refatorar o fluxo de salvação para ser unificado

**Opção A (RECOMENDADO)**: Salvar memória durante o streaming e enviar evento imediatamente
- Vantagem: Evento é enviado ao cliente em tempo real
- Desvantagem: Necessário refatorar `streamingOrchestrator`

**Opção B**: Usar um callback para notificar ao streaming quando memória for salva
- Vantagem: Mantém background finalization
- Desvantagem: Mais complexo de sincronizar

### Passo 2: Ajustar a estrutura do evento para incluir todos os dados

O evento deve incluir a memória completa que foi salva, não apenas ID e flags.

### Passo 3: Garantir que usuario_id está sempre presente

Frontend precisa de `usuario_id` para atribuir a memória ao usuário correto.

---

## 💡 EXEMPLO DE IMPLEMENTAÇÃO

### 1. Criar função auxiliar em `memoryPersistence.ts`

```typescript
export async function buildMemorySavedEvent(
  memoriaData: any,
  primeiraMemoriaSignificativa: boolean
) {
  return {
    type: "memory_saved",
    payload: {
      memory: {
        id: memoriaData.id,
        usuario_id: memoriaData.usuario_id,
        resumo_eco: memoriaData.resumo ?? "",
        emocao_principal: memoriaData.emocao ?? "",
        intensidade: memoriaData.intensidade,
        contexto: memoriaData.analise_resumo ?? "",
        dominio_vida: memoriaData.dominio_vida,
        padrao_comportamental: memoriaData.padrao ?? null,
        categoria: memoriaData.categoria ?? null,
        nivel_abertura: memoriaData.nivel_abertura,
        analise_resumo: memoriaData.analise_resumo,
        tags: Array.isArray(memoriaData.tags) ? memoriaData.tags : [],
        created_at: memoriaData.created_at,
      },
      primeiraMemoriaSignificativa,
    },
  };
}
```

### 2. Usar em `streamingOrchestrator.ts`

```typescript
if (rpcRes.saved && rpcRes.memoriaId) {
  const event = await buildMemorySavedEvent(
    {
      id: rpcRes.memoriaId,
      usuario_id: userId,
      // ... outros campos de metaPayload ...
    },
    !!rpcRes.primeira
  );

  await emitStream(event);
}
```

---

## 📞 CONCLUSÃO

**Status**: ❌ **Fluxo está quebrado**

**Causa raiz**:
1. Salvação de memória ocorre em backgrounds/timers sem coordenação com SSE
2. Evento SSE tem estrutura incompleta quando é enviado
3. Falta sincronização entre os dois caminhos de salvação

**Impacto**:
- Memória é salva no banco, mas frontend nunca sabe
- Frontend não consegue atualizar UI com confirmação de salvação

**Urgência**: 🔴 **CRÍTICA** - Impede funcionamento do sistema de memórias

**Próximas ações**:
1. Refatorar `streamingOrchestrator.ts` para enviar evento com estrutura completa
2. Sincronizar salvação em background com notificação ao cliente
3. Adicionar testes para validar estrutura do evento

---
