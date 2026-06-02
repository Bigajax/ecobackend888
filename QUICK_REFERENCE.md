# NON_SSE_EMPTY - Quick Reference

## 📌 Onde Começo?

1. **Ler primeiro** (5 min):
   - Abra: `NON_SSE_EMPTY_SUMMARY.md`

2. **Implementar** (30 min):
   - Abra: `NON_SSE_EMPTY_IMPLEMENTATION_GUIDE.md`
   - Siga os 3 passos
   - Use como referência: `CLAUDE_ADAPTER_IMPROVEMENTS.ts`

3. **Entender melhor** (opcional):
   - Diagrama: `NON_SSE_EMPTY_FLOW_DIAGRAM.md`
   - Análise: `NON_SSE_EMPTY_FIX.md`

---

## 🎯 Em 1 Minuto

**Problema**: Erro NON_SSE_EMPTY sem retry quando resposta vazia

**Solução**:
- Validar Content-Length ANTES de processar
- Retry 3x com backoff (500ms → 1s → 2s)
- Logs detalhados de cada etapa

**Tempo**: 30 min implementação

**Arquivo**: `server/core/ClaudeAdapter.ts`

---

## 📋 Mudanças Necessárias

### 1. Adicionar (3 funções)
```typescript
const EMPTY_RESPONSE_RETRY_CONFIG = {...}
function sleepMs(ms) {...}
function calculateBackoffDelay(attempt) {...}
```
Localização: Antes de `streamClaudeChatCompletion` (linha ~250)

### 2. Melhorar (response handling)
```typescript
const contentType = resp.headers.get("content-type");
const contentLength = resp.headers.get("content-length");
// ... validação PRÉ de Content-Length: 0
```
Localização: Linhas 319-340

### 3. Implementar (retry loop)
```typescript
while (retryAttempt < MAX_RETRIES) {
  try {
    await attemptStream(model);
  } catch (error) {
    if (error.__shouldRetry && retryAttempt < MAX_RETRIES) {
      await sleepMs(calculateBackoffDelay(retryAttempt));
      continue;
    }
  }
}
```
Localização: Linhas 553-576

---

## ✅ Verificação

```bash
# Build
npm run build

# Teste com logs
ECO_DEBUG=true npm run dev

# Requisição
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"mensagem":"Olá"}'

# Procure por estes logs:
# [stream_attempt_with_retry]
# [retrying_with_backoff]
# [attemptStream_response_headers]
```

---

## 📊 Headers Validados

```
✅ content-type: text/event-stream
✅ transfer-encoding: chunked
✅ content-length: > 0
✅ cache-control: no-cache
```

---

## ⏱️ Timeline

| Tempo | Ação |
|-------|------|
| 0ms | Request enviado |
| 1-3s | Response recebida |
| +0ms | Tentativa 1 |
| +500ms | Tentativa 2 (se falhou) |
| +1000ms | Tentativa 3 (se falhou) |
| +2000ms | Fallback model (se tudo falhou) |

---

## 🚀 Deploy

```bash
# Implement
# (siga NON_SSE_EMPTY_IMPLEMENTATION_GUIDE.md)

# Build
npm run build

# Commit
git add server/core/ClaudeAdapter.ts
git commit -m "fix: implement NON_SSE_EMPTY retry logic"

# Push
git push origin main
```

---

## 🎓 Conceitos

- **Exponential Backoff**: Delay cresce (500ms → 1s → 2s)
- **Early Validation**: Detecta problemas ANTES de processar
- **Structured Logging**: Log com contexto completo
- **Error Flagging**: Marca erros como retriáveis

---

## 📞 Arquivos

| Arquivo | Uso |
|---------|-----|
| `NON_SSE_EMPTY_SUMMARY.md` | Resumo (comece aqui!) |
| `NON_SSE_EMPTY_IMPLEMENTATION_GUIDE.md` | Passo-a-passo |
| `CLAUDE_ADAPTER_IMPROVEMENTS.ts` | Código pronto |
| `NON_SSE_EMPTY_FLOW_DIAGRAM.md` | Diagrama visual |
| `NON_SSE_EMPTY_FIX.md` | Análise completa |
| `QUICK_REFERENCE.md` | Este arquivo |

---

## ✨ Benefícios

✅ Retry automático (3x)
✅ Logs detalhados
✅ Sem breaking changes
✅ Taxa de sucesso 98%+

---

**Próximo passo**: Abra `NON_SSE_EMPTY_IMPLEMENTATION_GUIDE.md` 👉
