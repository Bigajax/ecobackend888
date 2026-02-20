# 🔧 Fixes: Salvamento de Memórias (Intensidade >= 7)

**Data**: 15 de Novembro de 2025
**Status**: ✅ Completo
**Impacto**: CRÍTICO - Corrige o envio do evento `memory_saved` via SSE

---

## 📋 Resumo das Mudanças

Identificamos e corrigimos **3 problemas críticos** que impediam o salvamento e envio correto de memórias quando a intensidade era >= 7:

### 1️⃣ Timeout Insuficiente (CRÍTICO)
**Arquivo**: `server/services/conversation/streamingOrchestrator.ts:22`

**Problema**: O bloco técnico tinha apenas 5 segundos para ser gerado. Se demorasse mais, o evento `memory_saved` não era emitido.

**Solução**:
```typescript
// ANTES:
const BLOCO_DEADLINE_MS = Number(process.env.ECO_BLOCO_DEADLINE_MS ?? 5000);

// DEPOIS:
const BLOCO_DEADLINE_MS = Number(process.env.ECO_BLOCO_DEADLINE_MS ?? 10000);
```

**Impacto**: Dobrou o tempo limite de 5s para 10s, permitindo que o bloco técnico seja gerado mesmo com latência maior.

---

### 2️⃣ Evento Não Emitido se `memoryData` for Null (MODERADO)
**Arquivo**: `server/services/conversation/streamingOrchestrator.ts:406-444`

**Problema**: Se a memória fosse salva no banco mas `memoryData` fosse null, o evento `memory_saved` não era enviado ao cliente.

**Solução**: Agora sempre emitimos o evento, mesmo se `memoryData` for null. Construímos um fallback com os dados que temos:

```typescript
if (rpcRes.saved && rpcRes.memoriaId) {
  // Sempre emitir, mesmo se memoryData for null (fallback construct)
  const memoryPayload = rpcRes.memoryData || {
    id: rpcRes.memoriaId,
    usuario_id: userId,
    resumo_eco: metaPayload.resumo ?? "",
    emocao_principal: metaPayload.emocao ?? "indefinida",
    intensidade: metaPayload.intensidade,
    // ... outros campos construídos automaticamente
  };

  await emitStream({
    type: "control",
    name: "memory_saved",
    meta: {
      memory: memoryPayload,
      primeiraMemoriaSignificativa: !!rpcRes.primeira,
    },
  });
}
```

**Impacto**: Cliente SEMPRE recebe confirmação que a memória foi salva, mesmo se houver inconsistências no retorno do RPC.

---

### 3️⃣ Falta de Validação de Intensidade (MENOR)
**Arquivo**: `server/services/conversation/responseMetadata.ts:76-120`

**Problema**: `buildStreamingMetaPayload()` não validava se `intensidade >= 7` antes de retornar o payload.

**Solução**: Adicionado gate de validação:

```typescript
// ⚠️ CRITICAL VALIDATION: Intensidade deve ser >= 7 para salvar memória
// Isso é um gate adicional antes de retornar o payload
if (intensidade < 7) {
  return null;
}
```

**Impacto**: Garante que apenas memórias com intensidade >= 7 sejam processadas para salvamento.

---

## 🎯 Melhorias de Logging

Adicionado **logging estruturado** em `memoryPersistence.ts` para facilitar debugging:

### Antes:
```
[registrar_memoria RPC] erro ao salvar memoria
```

### Depois:
```
[salvarMemoriaViaRPC] Memória NÃO salva: intensidade < 7
[salvarMemoriaViaRPC] Iniciando salvamento de memória {
  userId, intensidade, resumo_length, tags_count
}
[salvarMemoriaViaRPC] Memória salva com sucesso {
  memoriaId, primeiraMemoria, userId, intensidade
}
[registrar_memoria RPC] Erro ao salvar memória via RPC {
  message, code, userId, intensidade
}
```

**Impacto**: Muito mais fácil diagnosticar onde exatamente o salvamento está falhando.

---

## 🧪 Como Testar

### Quick Test (5 minutos):

```bash
# 1. Build
npm run build

# 2. Inicie servidor
npm run dev

# 3. Envie mensagem com intensidade >= 7 no frontend:
"Estou extremamente triste. Tive uma discussão muito séria com meu
namorado sobre nosso futuro juntos, e ele disse coisas que me magoaram
profundamente. Não sei se consigo confiar nele novamente. Estou sentindo
uma tristeza avassaladora."

# 4. Abra DevTools (F12) e procure por logs [Memory]:
# ✅ [Memory] ✅ Memória registrada com sucesso
```

### Verificações Importantes:

1. **Backend logs** - Procure por:
   ```
   [StreamingBloco] state=success { durationMs: XXX, emitted: true }
   [salvarMemoriaViaRPC] Memória salva com sucesso
   [StreamingBloco] evento memory_saved emitido
   ```

2. **Network tab** - Procure por:
   ```
   data: {"type":"memory_saved","payload":{"memory":{"id":"...","usuario_id":"..."}}}
   ```

3. **Banco de dados**:
   ```sql
   SELECT * FROM public.memorias
   WHERE usuario_id = '<seu-usuario-id>'
   ORDER BY created_at DESC LIMIT 1;
   ```

---

## 📊 Fluxo Antes vs Depois

### ❌ ANTES (Quebrado):
```
Mensagem (intensidade >= 7)
    ↓
EcoDecision calcula saveMemory = true
    ↓
StartBlocoPipeline inicia
    ↓
Bloco demora > 5s ❌ TIMEOUT
    ↓
Evento memory_saved NÃO é emitido ❌
    ↓
Frontend nunca recebe confirmação ❌
```

### ✅ DEPOIS (Corrigido):
```
Mensagem (intensidade >= 7)
    ↓
EcoDecision calcula saveMemory = true
    ↓
StartBlocoPipeline inicia
    ↓
Bloco pode demorar até 10s ✅
    ↓
RPC salva memória no banco ✅
    ↓
buildStreamingMetaPayload valida intensidade >= 7 ✅
    ↓
Evento memory_saved é emitido com dados completos ✅
    ↓
Frontend recebe e processa a memória ✅
```

---

## 🚀 Variáveis de Ambiente (Opcional)

Você pode ajustar os timeouts se necessário:

```bash
# Aumentar timeout do bloco técnico (default: 10000ms)
ECO_BLOCO_DEADLINE_MS=15000

# Tempo até mostrar "pending" (default: 1000ms)
ECO_BLOCO_PENDING_MS=2000

# Você pode decrementá-lo se o bloco costuma ser gerado rápido
ECO_BLOCO_DEADLINE_MS=7000
```

---

## ✅ Checklist de Validação

- [x] Aumentado timeout de 5s para 10s
- [x] Evento `memory_saved` sempre emitido (com fallback)
- [x] Validação de intensidade >= 7 em múltiplos pontos
- [x] Logging estruturado adicionado
- [x] Sem breaking changes na API
- [x] Frontend pode processar o evento normalmente

---

## 📞 Se Encontrar Problemas

1. **Verifique os logs** do backend (procure por `[StreamingBloco]` e `[salvarMemoriaViaRPC]`)
2. **Verifique o evento SSE** no Network tab do DevTools
3. **Verifique se a intensidade é >= 7** (logs mostram `[ecoDecision] intensity: X`)
4. **Verifique o banco de dados** se a memória foi realmente salva

---

## 📚 Referências

- **Guia de Teste Completo**: `docs/TESTE_MEMORIA_SSE.md`
- **Documentação Frontend**: `docs/PARA_O_BACKEND.md`
- **Arquivo Principal**: `server/services/conversation/streamingOrchestrator.ts`

---

**Status**: ✅ PRONTO PARA PRODUÇÃO
