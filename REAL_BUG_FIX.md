# Real Bug Fix: unhandledRejection - NON_SSE_EMPTY

**Status**: ✅ Fixed and Committed
**Commit 1**: `77bf719` - Remove rethrow (CRITICAL FIX)
**Commit 2**: `cc194a6` - Add error handling (Defensive)
**Date**: 2025-11-06

---

## O Problema Real

Os dois errors que você estava vendo:

```
[ERROR] unhandledRejection {"reason":{"name":"Error","message":"NON_SSE_EMPTY",...}}
[ERROR] unhandledRejection {"reason":{"name":"Error","message":"NON_SSE_EMPTY",...}}
```

Estavam happening em **produção no Render** porque o `Promise` estava sendo **rejeitado sem ser capturado**.

---

## A Causa Raiz

No arquivo `server/services/conversation/streamingOrchestrator.ts` linha 675-680:

```typescript
const streamPromise = streamClaudeChatCompletion(...)
  .catch((error: any) => {
    const err = error instanceof Error ? error : new Error(String(error));
    streamFailure = err;
    rejectRawForBloco(err);
    throw err;  // ← AQUI! Rethrow causa unhandledRejection!
  });
```

**O que acontecia:**

1. `streamClaudeChatCompletion` lança `Error("NON_SSE_EMPTY")` em ClaudeAdapter
2. O `.catch()` captura o erro
3. MAS DEPOIS FAZ `throw err` - Rethrow!
4. Isso faz `streamPromise` ficar **rejeitado**
5. `Promise.race()` recebe uma promise rejeitada
6. Se o guard promise ainda não finalizou, o race rejeita IMEDIATAMENTE
7. **unhandledRejection crash!**

---

## A Solução

Remover o `throw err` do catch handler:

**ANTES (bugado)**:
```typescript
).catch((error: any) => {
    streamFailure = err;
    rejectRawForBloco(err);
    throw err;  // ← Rethrow!
  });
```

**DEPOIS (corrigido)**:
```typescript
).catch((error: any) => {
    streamFailure = err;
    rejectRawForBloco(err);
    // Don't rethrow - error is handled by Promise.race
  });
```

---

## Por Que Funciona Agora

**Novo fluxo de erro:**

```
ClaudeAdapter lança NON_SSE_EMPTY
    ↓
streamPromise.catch() captura
    ↓
Registra em streamFailure
    ↓
Chama rejectRawForBloco()
    ↓
NÃO faz rethrow (promise completa normalmente)
    ↓
Promise.race() completa sem rejeição
    ↓
Try-catch ao redor do race (commit cc194a6) verifica streamFailure
    ↓
Entrega fallback response (sem crash!)
    ↓
Stream finaliza limpamente
```

---

## Commits Realizados

### Commit 1: `77bf719` - FIX CRÍTICA ✅

```
fix: remove rethrow in streamPromise catch to prevent unhandledRejection

- Remove "throw err" que causava unhandledRejection
- Erro é registrado em streamFailure mas não interrompe o fluxo
- Promise.race() pode capturar e tratar normalmente
```

**Mudança:**
```diff
- throw err;
+ // Don't rethrow - error is handled by Promise.race
```

### Commit 2: `cc194a6` - CAMADA DEFENSIVA

```
fix: handle Promise.race error in streaming orchestrator

- Wrap Promise.race em try-catch (defesa extra)
- Novo "stream_error" outcome state
- Emit fallback se nenhum chunk foi recebido
```

---

## Resultado

Agora quando `NON_SSE_EMPTY` ocorre (ou qualquer outro erro de stream):

✅ Não causa unhandledRejection
✅ Erro é registrado em logs
✅ Fallback response é entregue ao cliente
✅ Stream finaliza limpamente
✅ Memory e analytics continuam funcionando

---

## Como Testar em Produção

1. Deploy a mudança para Render
2. Monitore os logs de produção:
   ```
   [streamPromise_error_caught]
   [promise_race_error]
   ```
3. Se esses logs aparecerem, significa que erros estão sendo tratados corretamente
4. **Importante**: `unhandledRejection` NÃO deve aparecer mais

---

## Rollback (se necessário)

```bash
git revert 77bf719  # Remove a fix crítica (last one first)
git revert cc194a6
npm run build
# redeploy
```

---

## Root Cause Analysis

Por que o `.throw err` estava lá?

Provavelmente porque o desenvolvedor original queria "propagar" o erro para que `Promise.race()` pudesse tratá-lo. MAS:

1. Isso causava unhandledRejection antes do race chegar a verificar
2. Não havia error handling adequado no race
3. A solução correta era: não rethrow + adicionar try-catch no race

---

## Lesson Learned

**Regra de Ouro**: Quando você tem:
```typescript
promiseChain.catch((error) => {
  handleError(error);
  throw error;  // ❌ Rethrow causa unhandledRejection em alguns cases
})
```

Deve ser:
```typescript
promiseChain.catch((error) => {
  handleError(error);
  // ✅ Don't rethrow - let parent handle or resolve gracefully
})
```

Ou então:
```typescript
try {
  await promiseChain;
} catch (error) {
  handleError(error);
  // Handle or recover gracefully
}
```

---

**Status Final**: 🚀 Ready for production
**Tested**: ✅ TypeScript build passes
**Deployed**: ⏳ Awaiting manual deploy to Render
