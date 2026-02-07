# 🔍 DIAGNÓSTICO: Sistema de Memórias - Frontend & Backend

**Data**: 15 de Novembro de 2025
**Status**: Frontend implementado e compilado com sucesso ✅
**Próximo Passo**: Validar se o Backend está enviando o evento `memory_saved`

---

## 📊 RESUMO DO FRONTEND

### ✅ O que foi implementado:

1. **`chunkProcessor.ts`** (Linha 55)
   - Handler `onMemorySaved` adicionado ao interface `ProcessSseHandlers`
   - Lógica de detecção de eventos `memory_saved` em `processSseLine()` (linhas 235-239)

2. **`streamEventHandlers.ts`** (Linhas 584-699)
   - Handler `handleMemorySaved()` com 110+ linhas de logging detalhado
   - Suporta variações de nomes de campos (inglês e português)
   - Chama `registrarMemoria()` da API automaticamente
   - Tratamento robusto de erros sem quebrar o streaming

3. **`streamRunner.ts`** (Linhas 43, 1410-1413, 1709)
   - Importação de `handleMemorySaved`
   - Wrapper `handleMemorySavedEvent` passando `userId` de `params`
   - Handler integrado ao objeto `handlers`

### 📦 Fluxo Esperado:

```
1. User envia mensagem via ChatInput
   ↓
2. streamRunner começa o SSE para /api/ask-eco
   ↓
3. Backend processa e identifica se deve salvar memória
   ↓
4. Backend envia evento SSE: type="memory_saved" com dados
   ↓
5. Frontend recebe em processSseLine()
   ↓
6. Detecta "memory_saved" e chama handlers.onMemorySaved(event)
   ↓
7. handleMemorySavedEvent() wrapper executa
   ↓
8. handleMemorySaved(event, userId) processa
   ↓
9. registrarMemoria(payload) persiste no banco
   ↓
10. ✅ Memória salva com sucesso!
```

---

## 🎯 O QUE O BACKEND DEVE FAZER

### Requisito #1: Enviar evento SSE `memory_saved`

Durante o streaming SSE para `/api/ask-eco`, o backend DEVE enviar um evento com estrutura similar a:

```json
{
  "type": "memory_saved",
  "payload": {
    "memory": {
      "id": "mem-uuid-here",
      "usuario_id": "user-uuid-here",
      "resumo_eco": "Usuário relatou sentimento de tristeza extrema...",
      "emocao_principal": "tristeza",
      "intensidade": 9,
      "contexto": "Contexto completo da conversa ou situação...",
      "dominio_vida": "relacionamento",
      "padrao_comportamental": "Padrão identificado pela IA",
      "categoria": "emocional",
      "nivel_abertura": 8,
      "analise_resumo": "Análise completa e detalhada...",
      "tags": ["tristeza", "intenso", "relacionamento"],
      "created_at": "2025-11-15T12:00:00Z"
    },
    "primeiraMemoriaSignificativa": false
  }
}
```

### Requisito #2: Alternativas de formato aceitas

O frontend pode aceitar estas variações:

**Opção A - Evento simples (sem "memory" wrapper):**
```json
{
  "type": "memory_saved",
  "payload": {
    "id": "mem-uuid",
    "usuario_id": "user-uuid",
    "resumo_eco": "...",
    "emocao_principal": "tristeza",
    ...
  }
}
```

**Opção B - Com nomes em inglês:**
```json
{
  "type": "memory_saved",
  "payload": {
    "memory": {
      "summary": "Usuário triste",
      "emotion": "sadness",
      "intensity": 9,
      "context": "...",
      "domain": "relationship",
      "pattern": "...",
      "category": "...",
      "openness_level": 8,
      "analysis": "...",
      "tags": ["sadness", "intense"],
      "message_id": "msg-uuid"
    }
  }
}
```

**Opção C - Dentro de "done" event:**
```json
{
  "type": "done",
  "payload": {
    "memory_saved": true,
    "memory": {
      "resumo_eco": "...",
      ...
    },
    "primeiraMemoriaSignificativa": true,
    ...
  }
}
```

### Requisito #3: Timing do evento

- **Quando enviar**: Após identificar que a memória deve ser salva (lógica do backend)
- **Antes ou depois do `done`**: Pode ser qualquer momento durante o streaming
- **Quantidade**: 1 evento por memória significativa identificada

### Requisito #4: UserId obrigatório

O backend DEVE garantir que `usuario_id` está no evento, pois:
- Frontend passa userId via `params.userId` em `streamRunner.ts`
- Se userId vier no evento, frontend usa o do evento
- Se vier vazio, frontend usa do `params.userId`

---

## 🔍 VALIDAÇÃO DO FRONTEND

### Como verificar se o frontend está pronto:

**1. Console da aplicação**
```javascript
// Abra DevTools (F12) → Console
// Envie uma mensagem que deveria gerar memória
// Procure por logs: [Memory]
```

**2. Logs esperados quando funciona:**
```
[Memory] handleMemorySaved chamado: {
  hasEvent: true,
  hasUserId: true,
  userIdValue: "user-uuid-123",
  eventKeys: ["memory", "primeiraMemoriaSignificativa"]
}

[Memory] Dados da memória extraídos: {
  hasMemory: true,
  memoryDataKeys: ["id", "usuario_id", "resumo_eco", "emocao_principal", ...]
}

[Memory] Chamando registrarMemoria com payload: {
  usuario_id: "user-uuid-123",
  resumo_eco: "Usuário relatou...",
  emocao_principal: "tristeza",
  intensidade: 9
}

[Memory] ✅ Memória registrada com sucesso: {
  memoryId: "mem-uuid-456",
  isFirstSignificant: false,
  memoryCreatedAt: "2025-11-15T12:05:00Z"
}
```

**3. Logs de erro (se houver):**
```
[Memory] ⚠️ Event não foi fornecido para handleMemorySaved
  → Backend NÃO está enviando o evento memory_saved

[Memory] ⚠️ UserId não foi fornecido para handleMemorySaved
  → Frontend não conseguiu pegar o userId (problema de autenticação)

[Memory] ❌ Erro ao registrar memória: {
  errorName: "...",
  errorMessage: "...",
  errorDetails: "..."
}
  → Backend enviou o evento, mas API retornou erro
```

---

## 📋 CHECKLIST: O que validar no BACKEND

### [ ] 1. Rota `/api/ask-eco` está enviando SSE?
```bash
# Teste com curl:
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"usuario_id":"test-user","texto":"estou triste"}' \
  | head -100
```

### [ ] 2. Evento `memory_saved` está sendo enviado?
```bash
# Procure na resposta SSE por linhas como:
data: {"type":"memory_saved",...}
# ou
data: {...,"memory":{...},...}
```

### [ ] 3. UserId está no payload?
```bash
# Verifique se usuario_id aparece em memory_saved
grep -i "usuario_id" <response>
```

### [ ] 4. Estrutura de dados está correta?
- ✅ `tipo` ou `type` do evento: "memory_saved"
- ✅ `usuario_id` presente e válido (UUID)
- ✅ `resumo_eco` ou `summary` com conteúdo
- ✅ `emocao_principal` ou `emotion` definido
- ✅ Outros campos opcionais: intensidade, contexto, etc.

### [ ] 5. POST `/api/memorias/registrar` está funcionando?
```bash
# Teste a API de registro diretamente:
curl -X POST http://localhost:3001/api/memorias/registrar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "usuario_id": "user-uuid-123",
    "resumo_eco": "Teste de memória",
    "emocao_principal": "tristeza",
    "intensidade": 7
  }'
```

---

## 🚀 PASSOS PARA O BACKEND

### Passo 1: Verificar se a rota `/api/ask-eco` envia SSE
```typescript
// Backend deve estar fazendo algo como:
response.setHeader('Content-Type', 'text/event-stream');
response.setHeader('Cache-Control', 'no-cache');
response.setHeader('Connection', 'keep-alive');

// Enviar evento exemplo:
response.write('data: ' + JSON.stringify({
  type: 'memory_saved',
  payload: {
    memory: {
      id: 'mem-123',
      usuario_id: usuarioId,
      resumo_eco: 'Memória identificada',
      emocao_principal: 'tristeza',
      intensidade: 8,
      // ... outros campos
    },
    primeiraMemoriaSignificativa: false
  }
}) + '\n\n');
```

### Passo 2: Garantir que a memória foi salva no banco
```sql
-- Verificar se a memória existe:
SELECT * FROM memorias
WHERE usuario_id = 'user-uuid-123'
ORDER BY created_at DESC
LIMIT 1;

-- Verificar se o RLS está bloqueando:
-- Acesso deve ser restrito ao proprio usuario_id (RLS em Supabase)
```

### Passo 3: Validar o JWT do usuário
```typescript
// Certifique-se de que:
// 1. JWT está sendo validado corretamente
// 2. usuario_id do JWT está sendo extraído
// 3. usuario_id é passado para todo evento SSE
// 4. Memórias são inseridas com usuario_id correto (RLS)
```

---

## 📧 ENVIE PARA O BACKEND

Use este template para comunicar exatamente o que é esperado:

```
TITULO: [IMPLEMENTAÇÃO] Frontend esperando evento SSE "memory_saved"

DESCRIÇÃO:
Implementei no frontend o suporte completo para processar eventos SSE "memory_saved".

O FRONTEND AGORA:
✅ Detecta eventos "memory_saved" no streaming SSE
✅ Extrai dados da memória (suporta inglês e português)
✅ Chama automaticamente registrarMemoria() para persistir
✅ Tem logging detalhado [Memory] para debug

O QUE O BACKEND PRECISA FAZER:
1. Durante o streaming SSE de /api/ask-eco, enviar evento:
   {
     "type": "memory_saved",
     "payload": {
       "memory": {
         "usuario_id": "<user-uuid>",
         "resumo_eco": "<resumo da memória>",
         "emocao_principal": "<emoção>",
         "intensidade": <0-10>,
         ...outros campos opcionais
       }
     }
   }

2. Garantir que usuario_id está SEMPRE presente

3. Validar se a rota POST /api/memorias/registrar consegue inserir

FORMATO ALTERNATIVO ACEITO:
- Campos em inglês (emotion, intensity, context, pattern, etc.)
- Ou dentro do event.done ao invés de event separado
- Ou sem wrapper "memory" direto no payload

PARA TESTAR:
1. Envie mensagem: "estou extremamente triste"
2. Abra DevTools (F12) → Console
3. Procure por logs [Memory]
4. Se nenhum log aparecer = backend não enviou o evento
5. Se houver erro = problema na API ou RLS

DOCUMENTAÇÃO BACKEND ESPERADA:
Ver arquivo: DIAGNOSTICO_MEMORIA_FRONTEND.md
```

---

## 📊 FLUXO RESUMIDO (Visual)

```
┌─────────────────────────────────────────────────────────────────┐
│                        USUÁRIO                                   │
│              Envia: "estou extremamente triste"                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FRONTEND (streamRunner.ts)                      │
│        POST /api/ask-eco com Accept: text/event-stream          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BACKEND                                    │
│   1. Processa mensagem                                          │
│   2. Identifica se deve salvar memória (lógica backend)        │
│   3. ENVIA evento SSE: type="memory_saved" ← CRÍTICO!          │
│   4. Envia evento SSE: type="done"                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│               FRONTEND (streamProcessor.ts)                      │
│        Recebe evento SSE e processa os chunks                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
      ┌──────────────┐          ┌──────────────┐
      │ chunk event  │          │memory_saved  │ ← AQUI!
      │ (texto)      │          │event         │
      │ Chat mostra  │          │(dados memória)
      │              │          │              │
      └──────────────┘          └──────┬───────┘
                                       │
                                       ▼
                         ┌──────────────────────────┐
                         │ processSseLine()         │
                         │ Detecta memory_saved     │
                         │ Chama handlers.onMemorySaved()
                         └──────────┬───────────────┘
                                    │
                                    ▼
                    ┌────────────────────────────────┐
                    │ handleMemorySavedEvent()       │
                    │ (wrapper em streamRunner)      │
                    │ Passa userId de params        │
                    └──────────┬─────────────────────┘
                               │
                               ▼
                    ┌────────────────────────────────┐
                    │ handleMemorySaved()            │
                    │ (em streamEventHandlers.ts)    │
                    │ - Extrai dados                 │
                    │ - Normaliza campos             │
                    │ - Chama registrarMemoria()     │
                    └──────────┬─────────────────────┘
                               │
                               ▼
                    ┌────────────────────────────────┐
                    │ POST /api/memorias/registrar   │
                    │ Persiste no banco de dados     │
                    └──────────┬─────────────────────┘
                               │
                               ▼
                    ┌────────────────────────────────┐
                    │ ✅ Memória SALVA com sucesso!  │
                    │ [Memory] ✅ Log de sucesso     │
                    └────────────────────────────────┘
```

---

## 🎓 RESUMO EXECUTIVO

| Item | Frontend | Backend | Status |
|------|----------|---------|--------|
| Handler `onMemorySaved` | ✅ Implementado | N/A | Pronto |
| Detecção de evento | ✅ Implementado | Precisa verificar | Pendente |
| Extração de dados | ✅ Implementado | Precisa enviar | Pendente |
| Normalização | ✅ Suporta EN/PT | N/A | Pronto |
| API `/memorias/registrar` | ✅ Chamada | Precisa verificar | Pendente |
| Logging [Memory] | ✅ Detalhado | N/A | Pronto |
| **RESULT** | **✅ 100% Pronto** | **❓ Necessário validar** | **Aguardando Backend** |

---

## 📞 PRÓXIMOS PASSOS

1. **Você**: Copie este arquivo e passe para o backend
2. **Backend**: Execute o checklist "O que validar no BACKEND"
3. **Backend**: Verifique se está enviando `memory_saved` em SSE
4. **Você**: Abra console do navegador e teste com novo build
5. **Você**: Procure pelos logs `[Memory]` após enviar mensagem
6. **Vocês**: Compare resultado com "Logs esperados quando funciona"

Se receber erro: compartilhe o log de erro do console que vou ajudar!
