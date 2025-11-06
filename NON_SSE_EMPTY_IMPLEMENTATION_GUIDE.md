# NON_SSE_EMPTY - Guia Completo de Implementação

**Status**: Documentado e pronto para implementação
**Commit**: `e0e656f` (modelo corrigido)
**Data**: 2025-11-06

---

## 🎯 Objetivo

Resolver o erro `NON_SSE_EMPTY` que ocorre quando Claude Sonnet 4.5 retorna status 200 mas com resposta vazia ou não-SSE.

---

## ✅ O Que Já Foi Feito

### 1. Modelo Corrigido ✅
**Commit**: `e0e656f`

```diff
- model = "anthropic/claude-sonnet-4.5-20250929"
+ model = "anthropic/claude-sonnet-4.5"
```

**Impacto**: Elimina erros 400 por modelo inválido

---

## 📋 O Que Você Precisa Fazer

### Implementação em 3 Passos

#### PASSO 1: Adicionar Funções Helper (5 min)
**Arquivo**: `server/core/ClaudeAdapter.ts`
**Localização**: Antes da linha 252 (antes de `export async function streamClaudeChatCompletion`)

**Código a adicionar**:
```typescript
/**
 * Retry configuration for empty SSE responses
 */
const EMPTY_RESPONSE_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 3000,
  backoffFactor: 2,
};

/**
 * Sleep helper for exponential backoff delays
 */
function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number): number {
  const delay = EMPTY_RESPONSE_RETRY_CONFIG.initialDelayMs *
    Math.pow(EMPTY_RESPONSE_RETRY_CONFIG.backoffFactor, attempt - 1);
  return Math.min(delay, EMPTY_RESPONSE_RETRY_CONFIG.maxDelayMs);
}
```

---

#### PASSO 2: Melhorar Logging de Resposta (10 min)
**Arquivo**: `server/core/ClaudeAdapter.ts`
**Localização**: Linhas 319-340 (seção `let resp = await request()`)

**Trocar isso**:
```typescript
resp = await request();
log.debug("[provider_response]", { contentType: resp.headers.get("content-type") });

const isSse = /^text\/event-stream/i.test(resp.headers.get("content-type") || "");
if (!isSse) {
  // ...
}
```

**Por isso**:
```typescript
resp = await request();

// ===== ENHANCED RESPONSE LOGGING =====
const contentType = resp.headers.get("content-type") || "unknown";
const contentLength = resp.headers.get("content-length");
const isSse = /^text\/event-stream/i.test(contentType);

log.debug("[attemptStream_response_headers]", {
  status: resp.status,
  ok: resp.ok,
  contentType,
  contentLength,
  isSse,
  headers: {
    "transfer-encoding": resp.headers.get("transfer-encoding"),
    "cache-control": resp.headers.get("cache-control"),
  },
});

// ===== EARLY EMPTY RESPONSE VALIDATION =====
if (resp.ok && contentLength === "0") {
  log.error("[empty_response_detected_early]", {
    model: modelToUse,
    status: resp.status,
    reason: "Content-Length header is 0",
    shouldRetry: true,
  });
  const err = new Error("NON_SSE_EMPTY - Content-Length: 0");
  (err as any).__shouldRetry = true;
  (err as any).__claudeBeforeStream = true;
  throw err;
}

if (!isSse) {
  const data: unknown = await resp.json().catch(() => null);
  const json = (isObject(data) ? (data as ORChatCompletion) : null);
  const text = json ? pickContent(json) : "";

  log.warn("[non_sse_fallback_processing]", {
    used: !!text,
    contentLength: text?.length || 0,
    model: modelToUse,
    hasJson: !!json,
  });

  if (text) {
    // ...
  } else {
    log.error("[non_sse_empty]", {
      model: modelToUse,
      status: resp.status,
      reason: "No content extracted from non-SSE response",
    });
    throw new Error("NON_SSE_EMPTY - No content in response");
  }
}
```

---

#### PASSO 3: Implementar Retry Loop (10 min)
**Arquivo**: `server/core/ClaudeAdapter.ts`
**Localização**: Linhas 553-576 (seção com `const modelsToTry = [model];`)

**Trocar o loop inteiro**:

```typescript
const modelsToTry = [model];
if (fallbackModel && fallbackModel !== model) modelsToTry.push(fallbackModel);

let lastError: Error | null = null;
for (let i = 0; i < modelsToTry.length; i += 1) {
  const currentModel = modelsToTry[i]!;
  const isFinalAttempt = i === modelsToTry.length - 1;

  // ===== RETRY LOOP FOR EMPTY RESPONSES =====
  let retryAttempt = 0;
  let streamSuccess = false;

  while (retryAttempt < EMPTY_RESPONSE_RETRY_CONFIG.maxAttempts && !streamSuccess) {
    retryAttempt += 1;

    try {
      log.debug("[stream_attempt_with_retry]", {
        model: currentModel,
        modelAttempt: `${i + 1}/${modelsToTry.length}`,
        retryAttempt,
        maxRetries: EMPTY_RESPONSE_RETRY_CONFIG.maxAttempts,
      });

      await attemptStream(currentModel, isFinalAttempt);
      streamSuccess = true;
      return;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      const shouldRetry = (err as any).__shouldRetry === true;
      const delivered = (err as any).__claudeStreamDelivered === true;

      log.warn("[stream_attempt_failed]", {
        model: currentModel,
        retryAttempt,
        shouldRetry,
        error: err.message,
      });

      // If retriable and have attempts left
      if (shouldRetry && retryAttempt < EMPTY_RESPONSE_RETRY_CONFIG.maxAttempts) {
        const delayMs = calculateBackoffDelay(retryAttempt);
        log.warn("[retrying_with_backoff]", {
          model: currentModel,
          attempt: retryAttempt,
          nextRetryAfterMs: delayMs,
        });

        await sleepMs(delayMs);
        continue;
      }

      // If exhausted retries or error should propagate
      if (isFinalAttempt || delivered) {
        log.error("[final_model_failed]", {
          model: currentModel,
          error: err.message,
        });
        throw err;
      }

      // Try fallback model
      const isTimeout = err instanceof ClaudeTimeoutError;
      const label = isTimeout ? "⏱️" : "⚠️";
      callbacks.onFallback?.(modelsToTry[i + 1]!);
      console.warn(`${label} Claude ${currentModel} falhou, tentando fallback ${modelsToTry[i + 1]}`, err);

      break;
    }
  }
}

if (lastError) throw lastError;
```

---

## 📚 Documentação Criada

Você tem 2 arquivos de referência:

1. **`NON_SSE_EMPTY_FIX.md`**
   - Análise completa do problema
   - Explicação do fluxo atual
   - Detalhes de cada mudança

2. **`CLAUDE_ADAPTER_IMPROVEMENTS.ts`**
   - Código pronto para copiar/colar
   - Comentários explicando cada seção
   - Exemplos de logs esperados

---

## 🧪 Teste Depois de Implementar

```bash
# 1. Build
npm run build

# 2. Start com logs de debug
ECO_DEBUG=true npm run dev

# 3. Teste uma requisição
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"mensagem": "Olá, tudo bem?"}'

# 4. Procure estes logs para verificar sucesso:
# [attemptStream_response_headers] → Headers recebidos
# [stream_attempt_with_retry] → Retry funcionando
# [non_sse_fallback_processing] → Fallback funcionando
```

---

## 📊 Impacto Esperado

| Antes | Depois |
|-------|--------|
| NON_SSE_EMPTY → Crash | Retry 3x com backoff → Fallback |
| Sem visibilidade | Logs detalhados de cada etapa |
| Sem tratamento de resposta vazia | Validação PRÉ-processamento |
| Sem delay entre retries | Backoff exponencial (500ms → 1s → 2s) |

---

## ⏱️ Tempo Estimado

- **PASSO 1** (Helpers): 5 min
- **PASSO 2** (Logging): 10 min
- **PASSO 3** (Retry): 10 min
- **Build + Teste**: 5 min

**Total**: ~30 min

---

## ✅ Checklist de Implementação

- [ ] PASSO 1: Funções helper adicionadas
- [ ] PASSO 2: Logging melhorado
- [ ] PASSO 3: Retry loop implementado
- [ ] Arquivo compila: `npm run build`
- [ ] Testes passam (se houver)
- [ ] Commit com mensagem descritiva
- [ ] Deploy realizado
- [ ] Monitorar logs em produção

---

## 🚀 Deploy

Depois de implementar:

```bash
# Verificar mudanças
git status
git diff server/core/ClaudeAdapter.ts

# Commit
git add server/core/ClaudeAdapter.ts
git commit -m "fix: implement NON_SSE_EMPTY handling with retry logic

- Add exponential backoff retry for empty responses
- Enhanced logging for response headers validation
- Early detection of Content-Length: 0 responses
- Configurable retry attempts (default: 3)

Closes: NON_SSE_EMPTY errors in production"

# Deploy
git push origin main
```

---

## 📝 Notas Importantes

1. **Headers SSE esperados**:
   - `content-type: text/event-stream`
   - `transfer-encoding: chunked` (ou content-length)
   - `cache-control: no-cache`

2. **Fallback logic preservada**: Não muda o comportamento existente, apenas adiciona retry

3. **Logs estruturados**: Todos os logs incluem contexto completo para debugging

4. **Backoff configurável**: Pode ajustar `EMPTY_RESPONSE_RETRY_CONFIG` se necessário

---

## 🎓 Próximos Passos (Opcional)

Se quiser ir além:

1. Adicionar métrica para contar retries
2. Alertar se N% de requisições retornarem NON_SSE_EMPTY
3. Adicionar circuit breaker se taxa de erro ficar alta
4. Logar quality metrics ao Mixpanel

---

**Status**: Documentação completa
**Arquivos de referência**:
- `NON_SSE_EMPTY_FIX.md`
- `CLAUDE_ADAPTER_IMPROVEMENTS.ts`

**Próximo passo**: Implementar os 3 passos acima

---

Qualquer dúvida durante a implementação, veja os arquivos de referência! 📚
