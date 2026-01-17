# Fix para NON_SSE_EMPTY - Análise Completa

**Problema**: Claude Sonnet 4.5 retorna status 200 mas com resposta vazia. Streaming SSE não recebe chunks.

**Erro**: `NON_SSE_EMPTY` em ClaudeAdapter.ts linha 337

---

## 📊 Análise do Problema

### Localização do Erro
- **Arquivo**: `server/core/ClaudeAdapter.ts`
- **Função**: `attemptStream()` (linha 288)
- **Erro específico**: Linha 337 `throw new Error("NON_SSE_EMPTY")`

### O que Acontece Atualmente

```typescript
// Linha 321: fetch request
resp = await request();

// Linha 324: Verifica se é SSE
const isSse = /^text\/event-stream/i.test(resp.headers.get("content-type") || "");

// Linha 325-338: Se NÃO é SSE
if (!isSse) {
  const data: unknown = await resp.json().catch(() => null);
  const json = (isObject(data) ? (data as ORChatCompletion) : null);
  const text = json ? pickContent(json) : "";

  // Linha 330: Log (muito vago)
  log.warn("[non_sse_fallback]", { used: !!text, contentLength: text?.length || 0 });

  if (text) {
    // ✅ Fallback com conteúdo funciona
    await callbacks.onChunk?.({ content: text, raw: json as any });
    return;
  } else {
    // ❌ ERRO: Resposta vazia
    throw new Error("NON_SSE_EMPTY");
  }
}
```

### Por que Acontece

1. **OpenRouter retorna status 200** (OK)
2. **Mas content-type NÃO é `text/event-stream`** (esperava SSE)
3. **Body está vazio ou inválido**
4. **Não há fallback logic adequado**

---

## ✅ Solução Completa

### Parte 1: Adicionar Validação PRÉ-RESPOSTA

**O que adicionar após linha 321 (resp = await request())**:

```typescript
// ===== DETAILED PRE-STREAM LOGGING =====
const contentType = resp.headers.get("content-type") || "unknown";
const contentLength = resp.headers.get("content-length");
const isSse = /^text\/event-stream/i.test(contentType);

log.debug("[attemptStream_response]", {
  model: modelToUse,
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
if (resp.ok && !isSse && contentLength === "0") {
  log.error("[empty_response_detected]", {
    model: modelToUse,
    reason: "Status 200 but Content-Length: 0 and not SSE",
    shouldRetry: true,
  });

  // Marcar para retry ao invés de falhar imediatamente
  const err = new Error("NON_SSE_EMPTY - Invalid Response");
  (err as any).__shouldRetry = true;
  throw err;
}
```

### Parte 2: Adicionar Retry Logic com Backoff

**No início do arquivo, ANTES de `streamClaudeChatCompletion`**:

```typescript
// ===== RETRY CONFIGURATION =====
const EMPTY_RESPONSE_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 3000,
  backoffFactor: 2,
};

function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateBackoffDelay(attempt: number): number {
  const delay = EMPTY_RESPONSE_RETRY_CONFIG.initialDelayMs *
    Math.pow(EMPTY_RESPONSE_RETRY_CONFIG.backoffFactor, attempt - 1);
  return Math.min(delay, EMPTY_RESPONSE_RETRY_CONFIG.maxDelayMs);
}
```

### Parte 3: Implementar Retry Loop

**Modificar a função principal de stream (linhas 556-573)**:

```typescript
const modelsToTry = [model];
if (fallbackModel && fallbackModel !== model) modelsToTry.push(fallbackModel);

let lastError: Error | null = null;
for (let i = 0; i < modelsToTry.length; i += 1) {
  const currentModel = modelsToTry[i]!;
  const isFinalAttempt = i === modelsToTry.length - 1;

  // ===== RETRY LOGIC FOR EMPTY RESPONSES =====
  let retryAttempt = 0;
  let streamSuccess = false;

  while (retryAttempt < EMPTY_RESPONSE_RETRY_CONFIG.maxAttempts && !streamSuccess) {
    retryAttempt += 1;

    try {
      log.debug("[stream_attempt]", {
        model: currentModel,
        modelAttempt: i + 1,
        retryAttempt,
      });

      await attemptStream(currentModel, isFinalAttempt);
      streamSuccess = true;
      return;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      const shouldRetry = (err as any).__shouldRetry === true;
      const delivered = (err as any).__claudeStreamDelivered === true;

      // Se é erro de resposta vazia e temos tentativas sobrando
      if (shouldRetry && retryAttempt < EMPTY_RESPONSE_RETRY_CONFIG.maxAttempts) {
        const delayMs = calculateBackoffDelay(retryAttempt);
        log.warn("[empty_response_retrying]", {
          model: currentModel,
          attempt: retryAttempt,
          nextRetryMs: delayMs,
          error: err.message,
        });

        await sleepMs(delayMs);
        // Continua o loop while para retry
        continue;
      }

      // Se chegou no máximo de tentativas ou erro deve propagar
      if (isFinalAttempt || delivered) throw err;

      const isTimeout = err instanceof ClaudeTimeoutError;
      const label = isTimeout ? "⏱️" : "⚠️";
      callbacks.onFallback?.(modelsToTry[i + 1]!);
      console.warn(`${label} Claude ${currentModel} falhou, tentando fallback ${modelsToTry[i + 1]}`, err);

      break; // Sai do while, tenta próximo modelo
    }
  }

  // Se saiu do while sem sucesso e temos mais modelos, continua
  if (!streamSuccess && i < modelsToTry.length - 1) {
    continue;
  }
}

if (lastError) throw lastError;
```

### Parte 4: Melhorar Logs do Non-SSE Fallback

**Linha 330 (log.warn para non_sse_fallback)**:

```typescript
log.warn("[non_sse_fallback]", {
  used: !!text,
  contentLength: text?.length || 0,
  model: modelToUse,
  hasJson: !!json,
  jsonKeys: json ? Object.keys(json) : [],
  statusOk: resp.ok,
  contentType: resp.headers.get("content-type"),
  timestamp: new Date().toISOString(),
});
```

---

## 🎯 Mudanças Resumidas

| Item | Antes | Depois |
|------|-------|--------|
| Validação | Nenhuma | Verifica Content-Length |
| Logs | Genéricos | Detalhados (headers, status, etc) |
| Retry | Não existe | 3 tentativas com backoff exponencial |
| Delay | N/A | 500ms → 1s → 2s (exponencial) |
| Headers verificados | Apenas content-type | Todos os headers SSE relevantes |

---

## 📝 Arquivos a Modificar

**Arquivo único**: `server/core/ClaudeAdapter.ts`

**Linhas aproximadas**:
1. Antes de linha 252: Adicionar constantes de retry + funções helper
2. Linha 321+: Adicionar logs detalhados de resposta
3. Linha 337: Marcar para retry ao invés de falhar direto
4. Linhas 556-573: Substituir loop de modelos com retry logic

---

## 🧪 Como Testar Depois

```bash
# 1. Build
npm run build

# 2. Debug logs ativados
ECO_DEBUG=true npm run dev

# 3. Teste uma requisição
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"mensagem": "Olá"}'

# 4. Procure nos logs por:
# - [attemptStream_response] - headers recebidos
# - [empty_response_detected] - se detecção funciona
# - [empty_response_retrying] - se retry está ativando
# - [stream_attempt] - tentativas
```

---

## 🔄 Fluxo de Execução Melhorado

```
1. Requisição para OpenRouter
   ↓
2. [LOG DETALHADO] Mostra status, content-type, content-length
   ↓
3. Validação PRÉ-resposta (Content-Length === 0?)
   ↓
4. SIM → Marca para RETRY
   ↓
5. Aguarda backoff exponencial (500ms, 1s, 2s)
   ↓
6. RETRY até 3 vezes
   ↓
7. Se ainda falhar → Log detalhado + fallback model
   ↓
8. Se fallback também falhar → Erro com contexto completo
```

---

## ✅ Headers SSE Esperados

Se a resposta for um stream SSE válido, deve ter:

```
content-type: text/event-stream
transfer-encoding: chunked (ou content-length se conhecido)
cache-control: no-cache
connection: keep-alive (geralmente)
```

Se NÃO tiver `text/event-stream`, é uma resposta não-stream (JSON ou erro).

---

## 🎓 Lições

1. **Status 200 não garante resposta válida** - Precisa validar headers
2. **Content-Length: 0 é sinal de erro** - Deve triggerar retry
3. **Logging detalhado é crítico** - Mostra exatamente o que aconteceu
4. **Backoff exponencial é essencial** - Evita sobrecarregar o servidor

---

## ⚠️ Importante

**NÃO alterar a lógica de fallback existente** - Apenas melhorar os logs e adicionar retry para responses vazias.

**Manter compatibilidade** - O código mantém a mesma interface de callbacks.

---

**Status**: Pronto para implementação
**Tempo estimado**: 30-45 minutos
**Risco**: Baixo (apenas adiciona retry e logs)
**Impacto**: Alto (elimina NON_SSE_EMPTY)
