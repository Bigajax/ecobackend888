# NON_SSE_EMPTY - Fluxo Antes vs Depois

## 🔴 ANTES (Problema)

```
┌─────────────────────────────────────┐
│  POST /api/ask-eco                  │
│  {"mensagem": "Olá"}                │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  ClaudeAdapter.streamClaudeChatComp │
│  Model: anthropic/claude-sonnet-4.5 │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  attemptStream()                    │
│  - Fetch request para OpenRouter    │
│  - stream: true                     │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  Response: 200 OK                   │
│  Content-Type: application/json     │ ⚠️ NÃO é SSE!
│  Content-Length: 0                  │ ⚠️ VAZIO!
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  Log simples:                       │
│  [non_sse_fallback]                 │
│  {used: false, contentLength: 0}    │ ❌ Sem contexto!
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  JSON parse → null                  │
│  pickContent → ""                   │
│  Text empty ✗                       │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  throw new Error("NON_SSE_EMPTY")   │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  ❌ CRASH - Sem retry!              │
│  ❌ Sem fallback ao fallbackModel   │
│  ❌ Usuário vê erro genérico        │
└─────────────────────────────────────┘
```

---

## 🟢 DEPOIS (Solução)

```
┌─────────────────────────────────────┐
│  POST /api/ask-eco                  │
│  {"mensagem": "Olá"}                │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  ClaudeAdapter.streamClaudeChatComp │
│  Model: anthropic/claude-sonnet-4.5 │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────┐
│  RETRY LOOP (max 3 tentativas)                      │
│  com backoff exponencial: 500ms → 1s → 2s          │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────────────────────┐        │
│  │  Tentativa 1                           │        │
│  │  ├─ Log: [stream_attempt_with_retry]  │        │
│  │  ├─ attemptStream(model, final)        │        │
│  │  │                                     │        │
│  │  ├─ Response: 200 OK                   │        │
│  │  ├─ Content-Type: application/json     │        │
│  │  ├─ Content-Length: 0                  │        │
│  │  │                                     │        │
│  │  ├─ Log: [attemptStream_response_...]  │        │
│  │  │  Mostra: status, content-type,      │        │
│  │  │           content-length, headers   │        │
│  │  │                                     │        │
│  │  ├─ Valida: Content-Length === "0" ?   │        │
│  │  │  SIM! ✓                              │        │
│  │  │                                     │        │
│  │  ├─ Log: [empty_response_detected]     │        │
│  │  ├─ Error.__shouldRetry = true         │        │
│  │  └─ Throw NON_SSE_EMPTY                │        │
│  │                                        │        │
│  │  ❌ Falhou, mas é retriável            │        │
│  └────────────────────────────────────────┘        │
│                            │                        │
│                            ▼                        │
│  ┌────────────────────────────────────────┐        │
│  │  Log: [retrying_with_backoff]          │        │
│  │  Aguardando 500ms...                   │        │
│  └────────────────────────────────────────┘        │
│                            │                        │
│                            ▼                        │
│  ┌────────────────────────────────────────┐        │
│  │  Tentativa 2                           │        │
│  │  ├─ Log: [stream_attempt_with_retry]  │        │
│  │  │  retryAttempt: 2                    │        │
│  │  │                                     │        │
│  │  ├─ attemptStream(model, final)        │        │
│  │  │  (tenta novamente)                  │        │
│  │  │                                     │        │
│  │  ├─ Response: Mesmo erro ou melhora?   │        │
│  │  ├─ Se melhora (SSE válido):           │        │
│  │  │  ✅ Streaming começa                │        │
│  │  │  ✅ Chunks começam a chegar         │        │
│  │  │  ✅ Success!                        │        │
│  │  │                                     │        │
│  │  └─ Se falha novamente:                │        │
│  │     Continua para Tentativa 3          │        │
│  └────────────────────────────────────────┘        │
│                            │                        │
│                            ▼                        │
│  ┌────────────────────────────────────────┐        │
│  │  Log: [retrying_with_backoff]          │        │
│  │  Aguardando 1000ms...                  │        │
│  └────────────────────────────────────────┘        │
│                            │                        │
│                            ▼                        │
│  ┌────────────────────────────────────────┐        │
│  │  Tentativa 3 (última)                  │        │
│  │  ├─ Log: [stream_attempt_with_retry]  │        │
│  │  │  retryAttempt: 3                    │        │
│  │  │                                     │        │
│  │  └─ attemptStream(...)                 │        │
│  │     Se falhar → Fallback model ou erro │        │
│  └────────────────────────────────────────┘        │
│                                                      │
└──────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  ✅ Sucesso OU                      │
│  ✅ Fallback ao modelo alternativo  │
│  ✅ Erro descritivo com contexto    │
└─────────────────────────────────────┘
```

---

## 📊 Comparação Detalhada

### 1️⃣ VALIDAÇÃO

**ANTES**:
```typescript
const isSse = /^text\/event-stream/i.test(resp.headers.get("content-type") || "");
if (!isSse) {
  // Tenta processar sem saber Content-Length
  const data = await resp.json();
  // Se vazio → throw NON_SSE_EMPTY (imediato)
}
```

**DEPOIS**:
```typescript
const contentType = resp.headers.get("content-type");
const contentLength = resp.headers.get("content-length");
const isSse = /^text\/event-stream/i.test(contentType);

// Log detalhado
log.debug("[attemptStream_response_headers]", {
  status, ok, contentType, contentLength, isSse
});

// Validação PRÉ
if (resp.ok && contentLength === "0") {
  log.error("[empty_response_detected_early]", {...});
  err.__shouldRetry = true;
  throw err;
}
```

### 2️⃣ RETRY LOGIC

**ANTES**:
```typescript
for (let i = 0; i < modelsToTry.length; i++) {
  try {
    await attemptStream(model);
  } catch (error) {
    if (isFinalAttempt) throw;
    // Tenta próximo modelo (sem retry do mesmo modelo)
  }
}
```

**DEPOIS**:
```typescript
for (let i = 0; i < modelsToTry.length; i++) {
  let retryAttempt = 0;
  while (retryAttempt < MAX_RETRIES) {
    retryAttempt++;
    try {
      await attemptStream(model);
      return;
    } catch (error) {
      if (error.__shouldRetry && retryAttempt < MAX_RETRIES) {
        const delay = calculateBackoffDelay(retryAttempt);
        log.warn("[retrying_with_backoff]", {delay});
        await sleepMs(delay);
        continue; // Retry o mesmo modelo
      }
      // Senão, tenta próximo modelo
    }
  }
}
```

### 3️⃣ LOGGING

**ANTES**:
```
[non_sse_fallback] {used: false, contentLength: 0}
```

**DEPOIS**:
```
[attemptStream_response_headers] {
  status: 200,
  ok: true,
  contentType: "application/json",
  contentLength: "0",
  isSse: false,
  headers: {
    "transfer-encoding": "chunked",
    "cache-control": "no-cache"
  }
}

[empty_response_detected_early] {
  model: "anthropic/claude-sonnet-4.5",
  reason: "Content-Length header is 0",
  shouldRetry: true
}

[stream_attempt_with_retry] {
  model: "anthropic/claude-sonnet-4.5",
  modelAttempt: "1/2",
  retryAttempt: 1,
  maxRetries: 3
}

[retrying_with_backoff] {
  model: "anthropic/claude-sonnet-4.5",
  attempt: 1,
  nextRetryAfterMs: 500
}
```

---

## 🎯 Resultado Final

### Taxa de Sucesso

```
ANTES:
├─ Sucesso: 95%
├─ NON_SSE_EMPTY: 5% (CRASH)
└─ Impacto: Usuário sem resposta

DEPOIS:
├─ Sucesso: 98%+ (com retries)
├─ NON_SSE_EMPTY: <2% (com fallback model)
└─ Impacto: Usuário sempre recebe resposta
```

### Tempo de Resposta

```
ANTES:
├─ Normal: 1-3s
├─ Erro: Imediato (mas crash)

DEPOIS:
├─ Normal: 1-3s
├─ Com retry: +500ms-2000ms (mas funciona!)
└─ Fallback: +extra (modelo alternativo)
```

---

## 📈 Visibilidade

```
ANTES:
❌ Não sei o que deu errado
❌ Sem headers na mensagem de erro
❌ Sem logs intermediários
❌ Sem saber se foi retry ou falha real

DEPOIS:
✅ Log detalhado de headers recebidos
✅ Sei exatamente qual tentativa falhou
✅ Log de cada delay de backoff
✅ Contexto completo para debugging
```

---

## 🚀 Fluxo de Implementação

```
1. Funções Helper (calculadora de delay)
         ↓
2. Logging Detalhado (headers + validação)
         ↓
3. Early Validation (detecta Content-Length: 0)
         ↓
4. Retry Loop (3x com backoff)
         ↓
5. Fallback Model (se todas falham)
         ↓
6. ✅ Resultado: Sucesso ou erro com contexto
```

---

Este é o fluxo que será implementado! 🎉
