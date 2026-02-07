# Relatório de Troubleshooting: Feedback de Meditação

**Data:** 2025-12-20
**Prioridade:** CRÍTICA
**Status:** ERRO DE CONEXÃO PERSISTENTE

---

## 1. Problema Atual

O frontend está tentando enviar feedback de meditação para o backend, mas está falhando com erro de conexão/rede **antes mesmo** de receber resposta do servidor.

### Erro reportado pelo usuário:

```
MeditationCompletion.tsx:72 [MeditationCompletion] Failed to send feedback to backend:
Error: Erro de conexão. Verifique sua internet.
    at meditationFeedback.ts:126
```

### Comportamento observado:

- ❌ Requisição não chega ao backend (ou retorna erro antes do parse)
- ❌ Usuário vê mensagem de erro no console
- ✅ Analytics via Mixpanel continua funcionando (workaround)
- ⚠️ Dados não são salvos no banco de dados do backend

---

## 2. Evidências de Testes Realizados

### 2.1 Teste de Health Check (Backend Online)

```bash
curl -X GET https://ecobackend888.onrender.com/health
```

**Resultado:**
```
✅ Status: 200 OK
✅ Body: "ok"
✅ Tempo de resposta: ~57 segundos (cold start - Render free tier)
```

**Conclusão:** Backend está ONLINE e acessível.

---

### 2.2 Teste do Endpoint de Feedback

```bash
curl -X POST https://ecobackend888.onrender.com/api/meditation/feedback \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: test-session-123" \
  -H "X-Guest-Id: test-guest-456" \
  -d '{
    "vote": "positive",
    "meditation_id": "test_001",
    "meditation_title": "Teste",
    "meditation_duration_seconds": 60,
    "meditation_category": "test",
    "actual_play_time_seconds": 60,
    "completion_percentage": 100
  }'
```

**Resultado:**
```
❌ Status: 404 Not Found
❌ Body: {"error":"Rota não encontrada","path":"/api/meditation/feedback"}
```

**Conclusão:** Endpoint `/api/meditation/feedback` **NÃO EXISTE** no backend.

---

## 3. Configuração do Frontend

### 3.1 Ambiente Local (Desenvolvimento)

**Arquivo:** `.env`
```bash
# VITE_API_URL está comentado (vazio)
# VITE_API_URL=https://ecobackend888.onrender.com
```

**Resultado:** `import.meta.env.VITE_API_URL` retorna `undefined` ou `""`

---

### 3.2 Proxy do Vite (Desenvolvimento)

**Arquivo:** `vite.config.ts` (linhas 62-73)
```typescript
server: {
  proxy: {
    '/api': {
      target: apiBase || 'https://ecobackend888.onrender.com',
      changeOrigin: true,
      secure: true,
    },
  },
}
```

**Endpoint final construído pelo frontend:**
```typescript
const apiUrl = import.meta.env.VITE_API_URL || ''; // ''
const endpoint = `${apiUrl}/api/meditation/feedback`; // '/api/meditation/feedback'
```

**Resultado esperado:**
- Frontend faz fetch para `/api/meditation/feedback`
- Vite proxy redireciona para `https://ecobackend888.onrender.com/api/meditation/feedback`
- Backend responde

**Resultado real:**
- Fetch falha com erro de rede/conexão
- Não chega a receber resposta 404
- Erro capturado antes do parse

---

## 4. Código Atual do Frontend

### 4.1 Arquivo: `src/api/meditationFeedback.ts`

**Fluxo de execução:**

```typescript
try {
  // 1. Construir endpoint
  const endpoint = '/api/meditation/feedback'; // Vazio + '/api/...'
  console.log('[meditationFeedback] Sending to endpoint:', endpoint);

  // 2. Tentar fazer fetch
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId,
        'X-Guest-Id': guestId, // ou Authorization
      },
      body: JSON.stringify(payload),
    });
  } catch (fetchError) {
    // ⚠️ ERRO ACONTECE AQUI
    console.warn('[meditationFeedback] Network error during fetch:', fetchError);
    return mockSuccess; // Retorna sucesso simulado
  }

  // 3. Verificar status (nunca chega aqui)
  console.log('[meditationFeedback] Response status:', response.status);

  if (response.status === 404) {
    return mockSuccess;
  }

  // ...
} catch (error) {
  // Erro final capturado
  throw new Error('Erro de conexão. Verifique sua internet.');
}
```

---

## 5. Hipóteses do Problema

### Hipótese 1: Proxy do Vite não está funcionando
**Sintoma:** Fetch vai para `http://localhost:5173/api/meditation/feedback` ao invés de redirecionar para o backend.

**Como verificar (backend):**
1. Checar logs do servidor: a requisição está chegando?
2. Verificar se há registro de OPTIONS (preflight CORS)
3. Confirmar se o endpoint `/api/meditation/feedback` foi acessado

**Como o usuário pode testar:**
- Abrir DevTools → Network → Filtrar por "feedback"
- Ver qual URL está sendo chamada (localhost ou ecobackend888.onrender.com)

---

### Hipótese 2: CORS bloqueando a requisição
**Sintoma:** Navegador bloqueia requisição antes mesmo de chegar ao backend.

**Headers CORS necessários (backend):**
```javascript
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Session-Id, X-Guest-Id, Authorization
Access-Control-Allow-Credentials: true
```

**Como verificar:**
1. DevTools → Console → Ver se há erro de CORS
2. DevTools → Network → Ver se requisição OPTIONS foi feita
3. Verificar response headers do OPTIONS

---

### Hipótese 3: Endpoint não implementado causa erro antes do parse
**Sintoma:** Backend retorna 404, mas resposta não é JSON válido, causando erro no parse.

**Status atual:**
- ✅ Frontend agora verifica 404 ANTES de fazer parse
- ✅ Frontend trata erro de fetch separadamente
- ❌ Ainda assim erro persiste

**Possível causa:**
- Resposta 404 não é JSON
- Resposta é HTML de erro
- Resposta tem Content-Type incorreto

---

### Hipótese 4: Backend demora muito para iniciar (cold start)
**Sintoma:** Fetch timeout antes de receber resposta do Render.

**Evidência:**
- Health check demorou 57 segundos em cold start
- Timeout padrão do fetch pode ser menor que isso

**Como verificar:**
1. Ver no Network tab quanto tempo a requisição demora
2. Verificar se há timeout no meio do processo

---

## 6. Informações Necessárias do Backend

### 6.1 Verificações a fazer:

- [ ] **Endpoint existe?** Rota `POST /api/meditation/feedback` está implementada?
- [ ] **Logs do servidor:** A requisição do frontend está chegando nos logs?
- [ ] **CORS configurado?** Headers corretos para `http://localhost:5173`?
- [ ] **Preflight OPTIONS:** Endpoint responde a OPTIONS com 200?
- [ ] **Content-Type da resposta 404:** Está retornando `application/json`?
- [ ] **Tempo de resposta:** Quanto tempo leva para responder (cold start)?
- [ ] **Middleware de validação:** Está rejeitando antes de processar?

---

### 6.2 Informações para coletar:

#### Logs do servidor quando frontend faz requisição:

```
Por favor, coletar:
1. Timestamp da requisição
2. Método e path recebido
3. Headers recebidos (X-Session-Id, X-Guest-Id, etc.)
4. Body recebido (payload)
5. Status code retornado
6. Response body enviado
7. Tempo total de processamento
```

#### Configuração CORS atual:

```javascript
// Compartilhar configuração de CORS
app.use(cors({
  origin: ???,
  methods: ???,
  allowedHeaders: ???,
  credentials: ???
}));
```

#### Rotas registradas:

```bash
# Listar todas as rotas do backend
# Verificar se /api/meditation/feedback aparece
```

---

## 7. Como o Backend Pode Testar

### Teste 1: Simular requisição do frontend

```bash
curl -v -X POST http://localhost:3001/api/meditation/feedback \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: 123e4567-e89b-12d3-a456-426614174000" \
  -H "X-Guest-Id: 987e6543-e21b-12d3-a456-426614174999" \
  -H "Origin: http://localhost:5173" \
  -d '{
    "vote": "positive",
    "meditation_id": "test_001",
    "meditation_title": "Teste",
    "meditation_duration_seconds": 60,
    "meditation_category": "test",
    "actual_play_time_seconds": 60,
    "completion_percentage": 100
  }'
```

**Resultado esperado:**
```
Status: 201 Created (quando implementado)
ou
Status: 404 Not Found (se ainda não implementado)

Content-Type: application/json
Body: { "error": "...", "path": "..." } ou { "success": true, "feedback_id": "..." }
```

---

### Teste 2: Verificar preflight CORS

```bash
curl -v -X OPTIONS http://localhost:3001/api/meditation/feedback \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, X-Session-Id, X-Guest-Id"
```

**Resultado esperado:**
```
Status: 200 OK (ou 204 No Content)
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Session-Id, X-Guest-Id, Authorization
```

---

### Teste 3: Verificar se endpoint existe

```javascript
// No código do backend, adicionar log:
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  next();
});
```

Então fazer requisição e ver se aparece nos logs.

---

## 8. Payload Completo Sendo Enviado

### Exemplo de payload real do frontend:

```json
{
  "vote": "positive",
  "meditation_id": "energy_blessing_1",
  "meditation_title": "Bênçãos dos Centros de Energia",
  "meditation_duration_seconds": 462,
  "meditation_category": "energy_blessings",
  "actual_play_time_seconds": 445,
  "completion_percentage": 96.32,
  "pause_count": 2,
  "skip_count": 0,
  "seek_count": 0,
  "feedback_source": "meditation_completion"
}
```

### Headers sendo enviados:

```
Content-Type: application/json
X-Session-Id: <UUID gerado automaticamente>
X-Guest-Id: <UUID do localStorage> (para guests)
  OU
Authorization: Bearer <JWT do Supabase> (para autenticados)
```

---

## 9. Próximos Passos

### Para o Backend:

1. **Verificar se requisição está chegando**
   - Adicionar logging em todos os middlewares
   - Verificar se requisição passa pelo CORS
   - Confirmar se chega ao handler da rota

2. **Confirmar configuração CORS**
   - Verificar origins permitidas (deve incluir `http://localhost:5173`)
   - Verificar métodos permitidos (deve incluir POST e OPTIONS)
   - Verificar headers permitidos (X-Session-Id, X-Guest-Id, Authorization)

3. **Implementar endpoint (se ainda não existe)**
   - Seguir especificação do arquivo `RELATORIO_BACKEND_FEEDBACK_MEDITACAO.md`
   - Retornar JSON válido em todos os casos (404, 400, 500)
   - Garantir Content-Type: application/json

4. **Compartilhar informações**
   - Logs da tentativa de requisição
   - Configuração CORS atual
   - Lista de rotas registradas
   - Tempo de cold start atual

---

### Para o Frontend (usuário):

1. **Coletar informações do DevTools**
   - Abrir DevTools (F12)
   - Ir na aba Network
   - Tentar enviar feedback
   - Tirar print/copiar:
     - URL da requisição
     - Status code
     - Request Headers
     - Response Headers (se houver)
     - Console (erros e warnings)

2. **Verificar console logs**
   - Procurar por: `[meditationFeedback] Sending to endpoint:`
   - Procurar por: `[meditationFeedback] Network error during fetch:`
   - Copiar mensagens de erro completas

---

## 10. Checklist de Diagnóstico

### Backend deve verificar:

- [ ] Servidor está rodando e acessível
- [ ] Rota `POST /api/meditation/feedback` está registrada
- [ ] CORS permite origin `http://localhost:5173`
- [ ] CORS permite métodos `POST` e `OPTIONS`
- [ ] CORS permite headers `X-Session-Id`, `X-Guest-Id`, `Authorization`
- [ ] Endpoint responde a OPTIONS com 200/204
- [ ] Resposta 404 tem Content-Type `application/json`
- [ ] Resposta 404 retorna body JSON válido
- [ ] Logs mostram requisições chegando
- [ ] Não há middleware bloqueando antes do handler

### Frontend/Usuário deve fornecer:

- [ ] Screenshot do DevTools → Network → Request
- [ ] Screenshot do DevTools → Console (logs completos)
- [ ] Confirmação de qual endpoint aparece no log
- [ ] Confirmação se requisição aparece no Network tab
- [ ] Status code visto no Network tab (se houver)
- [ ] Mensagens de erro completas
- [ ] Ambiente (desenvolvimento/produção)

---

## 11. Workaround Temporário Implementado

### Frontend atual (versão robusta):

```typescript
// Se fetch falhar por qualquer motivo:
// - Retorna mock success
// - Não quebra UX do usuário
// - Analytics via Mixpanel continua funcionando
// - Log no console para debug

try {
  response = await fetch(endpoint, ...);
} catch (fetchError) {
  console.warn('[meditationFeedback] Network error:', fetchError);
  return { success: true, feedback_id: 'local-only-network-error' };
}

if (response.status === 404) {
  console.warn('[meditationFeedback] Backend endpoint not implemented');
  return { success: true, feedback_id: 'local-only-404' };
}
```

**Implicação:** Usuário não vê erro, mas dados não são salvos no backend.

---

## 12. Arquivos de Referência

### Frontend:
- `src/api/meditationFeedback.ts` - Cliente de API
- `src/components/meditation/MeditationCompletion.tsx` - Onde o feedback é enviado
- `src/components/meditation/MeditationFeedback.tsx` - UI de coleta
- `vite.config.ts` - Configuração de proxy
- `.env` - Variáveis de ambiente

### Documentação:
- `VERIFICAR_FRONTEND_FEEDBACK.md` - Especificação completa do endpoint
- `RELATORIO_BACKEND_FEEDBACK_MEDITACAO.md` - Especificação de implementação

---

## 13. Contato

**Urgência:** ALTA
**Impacto:** Dados de feedback não estão sendo coletados
**Ação requerida:** Backend investigar e compartilhar logs/configurações

**Informações críticas necessárias:**
1. Logs do servidor durante tentativa de requisição
2. Configuração CORS atual
3. Lista de rotas registradas
4. Endpoint `/api/meditation/feedback` existe?

---

**Documento preparado por:** Claude Code (Frontend ECO)
**Para:** Time de Backend ECO
**Data:** 2025-12-20
**Objetivo:** Diagnosticar erro de conexão no feedback de meditação
