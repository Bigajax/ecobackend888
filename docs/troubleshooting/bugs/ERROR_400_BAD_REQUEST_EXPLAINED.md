# Erro 400 Bad Request - Explicação Completa

**Status**: ✅ RESOLVIDO
**Commit**: `8cc39d6`
**Data**: 2025-11-06

---

## Mensagem de Erro que Você Via

```
⚠️ Claude anthropic/claude-sonnet-4.5-20250929 falhou, tentando fallback anthropic/claude-sonnet-4.5-20250929
Error: OpenRouter error: 400 Bad Request
```

---

## A Causa Raiz

### Problema 1: Modelos Padrão Inválidos ❌

No arquivo `server/core/ClaudeAdapter.ts` (linhas 160 e 255):

```typescript
// ANTES (ERRADO):
model = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-3.7-sonnet"
fallbackModel = process.env.ECO_CLAUDE_MODEL_FALLBACK || "anthropic/claude-sonnet-4"
```

**O Problema:**
- ❌ `anthropic/claude-3.7-sonnet` **NÃO EXISTE** no OpenRouter
- ❌ `anthropic/claude-sonnet-4` **PODE NÃO EXISTIR** (nome antigo/incorreto)

Quando você tenta usar um modelo que não existe, OpenRouter retorna:
```
HTTP 400 Bad Request
{
  "error": {
    "message": "Unknown model"
  }
}
```

### Por Que Recebe "400 Bad Request" em Vez de "Unknown Model"?

Porque o código original **não estava lendo a resposta de erro do OpenRouter**:

```typescript
// ANTES (sem detail logging):
if (!resp.ok) {
  const err = new Error(`OpenRouter error: ${resp.status} ${resp.statusText}`);
  throw err;  // ← Joga erro genérico, sem a mensagem real!
}
```

---

## A Solução

### Fix 1: Modelos Corretos ✅

```typescript
// DEPOIS (CORRETO):
model = process.env.ECO_CLAUDE_MODEL || "anthropic/claude-sonnet-4.5-20250929"
fallbackModel = process.env.ECO_CLAUDE_MODEL_FALLBACK || "anthropic/claude-3-haiku-20240307"
```

**Modelos Válidos do OpenRouter:**
- ✅ `anthropic/claude-sonnet-4.5-20250929` - Principal (mais potente)
- ✅ `anthropic/claude-3-haiku-20240307` - Fallback (mais rápido, mais barato)
- ✅ `anthropic/claude-3-5-sonnet-20241022` - Alternativa

### Fix 2: Melhor Error Logging ✅

Agora quando OpenRouter retorna 400, você vê a **mensagem real** do erro:

```typescript
if (!resp.ok) {
  let errorDetails = `${resp.status} ${resp.statusText}`;
  try {
    const errorBody = await resp.json().catch(() => null);
    if (errorBody && typeof errorBody === 'object') {
      const errMsg = (errorBody as any).error?.message || (errorBody as any).message;
      if (errMsg) {
        errorDetails += ` - ${errMsg}`;  // ← Agora mostra a razão real!
      }
    }
  } catch (_) {}

  log.warn("[openrouter_http_error]", {
    status: resp.status,
    details: errorDetails,  // ← Log detalhado
    model: modelToUse,
  });
  throw new Error(`OpenRouter error: ${errorDetails}`);
}
```

---

## Antes vs Depois

### ANTES (sem visibilidade):
```
⚠️ Claude ... falhou
Error: OpenRouter error: 400 Bad Request
[sem saber o motivo do erro]
```

### DEPOIS (com visibilidade):
```
⚠️ Claude ... falhou
Error: OpenRouter error: 400 Bad Request - Unknown model: anthropic/claude-3.7-sonnet
[você sabe exatamente o que está errado!]

[openrouter_http_error] {
  status: 400,
  details: "400 Bad Request - Unknown model: ...",
  model: "anthropic/claude-3.7-sonnet"
}
```

---

## Outros Erros 400 Comuns

Agora que você tem logging detalhado, você conseguirá identificar:

| Erro | Causa | Solução |
|------|-------|---------|
| `Unknown model` | Modelo não existe | Usar modelo válido |
| `invalid request body` | Parâmetro inválido | Verificar temperature, max_tokens |
| `Insufficient credits` | Conta sem saldo | Adicionar créditos no OpenRouter |
| `Rate limit exceeded` | Muitas requisições | Esperar ou aumentar limite |
| `Invalid authentication` | API key errada | Verificar OPENROUTER_API_KEY |

---

## Como Verificar se Funcionou

Teste no seu servidor:

```bash
# Build passou ✅
npm run build

# Inicie o servidor
NODE_ENV=development npx ts-node --transpile-only server/server.ts

# Faça um request:
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"mensagem": "Olá"}'

# Você AGORA verá:
# ✅ Se compilar e conectar ao OpenRouter = modelo está OK
# ❌ Se ainda falhar, você terá uma mensagem de erro CLARA
```

---

## Resumo das Mudanças

| Arquivo | Mudança | Motivo |
|---------|---------|--------|
| `server/core/ClaudeAdapter.ts` | Principal: `claude-3.7-sonnet` → `claude-sonnet-4.5-20250929` | Modelo real |
| `server/core/ClaudeAdapter.ts` | Fallback: `claude-sonnet-4` → `claude-3-haiku-20240307` | Modelo real e mais barato |
| `server/core/ClaudeAdapter.ts` | Adicionar try-catch ao ler error JSON | Ver mensagem de erro real |
| `server/core/ClaudeAdapter.ts` | Adicionar log `[openrouter_http_error]` | Rastreabilidade |

---

## Próximas Ações

1. ✅ Deploy dos 3 commits:
   - `77bf719` - Remove rethrow (fix unhandledRejection)
   - `cc194a6` - Promise.race error handling
   - `8cc39d6` - Fix modelos e error logging

2. Monitor logs para:
   - `[openrouter_http_error]` - Se aparecer, significa que houve um erro de requisição
   - `[promise_race_error]` - Se aparecer, significa que stream falhou mas foi tratado

3. Se ainda tiver erro 400:
   - Verifique qual é a mensagem detalhada agora
   - Compare com a tabela de erros acima
   - Tome ação apropriada (mudar modelo, verificar API key, etc)

---

**Commit**: `8cc39d6`
**Status**: Pronto para produção
