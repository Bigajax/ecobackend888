# Relatório: Endpoint de Feedback de Meditação - Backend

**Data:** 2025-12-20
**Prioridade:** ALTA
**Status:** ENDPOINT NÃO IMPLEMENTADO (404)

---

## 1. Resumo Executivo

O frontend está tentando enviar feedback de meditação para o backend via endpoint `POST /api/meditation/feedback`, mas o endpoint **não existe** no backend, resultando em erro 404.

**Impacto:**
- ❌ Dados de feedback de meditação não estão sendo salvos no banco de dados
- ⚠️ Analytics via Mixpanel continua funcionando (workaround temporário)
- ✅ Frontend implementou fallback para não quebrar UX

**Ação necessária:**
Implementar o endpoint conforme especificação abaixo.

---

## 2. Evidências do Problema

### 2.1 Teste de Conexão (Health Check)
```bash
curl -X GET https://ecobackend888.onrender.com/health
# ✅ Retorna: "ok" (backend está online)
```

### 2.2 Teste do Endpoint de Feedback
```bash
curl -X POST https://ecobackend888.onrender.com/api/meditation/feedback \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: test-session" \
  -H "X-Guest-Id: test-guest" \
  -d '{
    "vote": "positive",
    "meditation_id": "test",
    "meditation_title": "Test",
    "meditation_duration_seconds": 60,
    "meditation_category": "test",
    "actual_play_time_seconds": 60,
    "completion_percentage": 100
  }'
```

**Resposta atual:**
```
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "Rota não encontrada",
  "path": "/api/meditation/feedback"
}
```

**Resposta esperada:**
```
HTTP/1.1 201 Created
Content-Type: application/json

{
  "success": true,
  "feedback_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Feedback registrado com sucesso"
}
```

---

## 3. Especificação do Endpoint

### 3.1 Informações Básicas

| Item | Valor |
|------|-------|
| **Método** | `POST` |
| **Path** | `/api/meditation/feedback` |
| **Content-Type** | `application/json` |
| **Status Success** | `201 Created` |

### 3.2 Headers Obrigatórios

```typescript
{
  "Content-Type": "application/json",
  "X-Session-Id": string,           // UUID v4 (SEMPRE obrigatório)

  // Um dos dois abaixo:
  "X-Guest-Id": string,             // UUID v4 (para usuários não autenticados)
  // OU
  "Authorization": "Bearer <token>" // JWT (para usuários autenticados)
}
```

**Regras:**
- `X-Session-Id`: SEMPRE obrigatório
- `X-Guest-Id`: Obrigatório se usuário for guest (não autenticado)
- `Authorization`: Obrigatório se usuário for autenticado (substitui X-Guest-Id)

### 3.3 Request Body (Payload)

#### Campos OBRIGATÓRIOS (sempre presentes):

```typescript
{
  vote: 'positive' | 'negative',        // OBRIGATÓRIO
  meditation_id: string,                 // OBRIGATÓRIO
  meditation_title: string,              // OBRIGATÓRIO
  meditation_duration_seconds: number,   // OBRIGATÓRIO (duração total)
  meditation_category: string,           // OBRIGATÓRIO
  actual_play_time_seconds: number,      // OBRIGATÓRIO (tempo real ouvido)
  completion_percentage: number,         // OBRIGATÓRIO (0 a 100)
}
```

#### Campo CONDICIONALMENTE OBRIGATÓRIO:

```typescript
{
  reasons?: string[]  // OBRIGATÓRIO quando vote = 'negative'
                      // Valores aceitos: ['too_long', 'hard_to_focus', 'voice_music', 'other']
}
```

#### Campos OPCIONAIS:

```typescript
{
  pause_count?: number,              // Padrão: 0
  skip_count?: number,               // Padrão: 0
  seek_count?: number,               // Padrão: 0
  background_sound_id?: string,      // Padrão: null
  background_sound_title?: string,   // Padrão: null
  feedback_source?: string,          // Padrão: 'meditation_completion'
}
```

### 3.4 Exemplos de Requisições

#### Exemplo 1: Feedback POSITIVO (usuário guest)

```http
POST /api/meditation/feedback HTTP/1.1
Host: ecobackend888.onrender.com
Content-Type: application/json
X-Session-Id: 123e4567-e89b-12d3-a456-426614174000
X-Guest-Id: 987e6543-e21b-12d3-a456-426614174999

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
  "seek_count": 1,
  "background_sound_id": "freq_432hz",
  "background_sound_title": "432Hz",
  "feedback_source": "meditation_completion"
}
```

#### Exemplo 2: Feedback NEGATIVO (usuário autenticado)

```http
POST /api/meditation/feedback HTTP/1.1
Host: ecobackend888.onrender.com
Content-Type: application/json
X-Session-Id: 123e4567-e89b-12d3-a456-426614174000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "vote": "negative",
  "reasons": ["too_long", "hard_to_focus"],
  "meditation_id": "dr_joe_morning_1",
  "meditation_title": "Meditação da Manhã",
  "meditation_duration_seconds": 1800,
  "meditation_category": "dr_joe_dispenza",
  "actual_play_time_seconds": 600,
  "completion_percentage": 33.33,
  "pause_count": 5,
  "skip_count": 2,
  "seek_count": 3
}
```

### 3.5 Respostas

#### Sucesso (201 Created)

```json
{
  "success": true,
  "feedback_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Feedback registrado com sucesso"
}
```

#### Erro de Validação (400 Bad Request)

```json
{
  "error": "Validation failed",
  "details": [
    "X-Session-Id header is required",
    "reasons are required when vote is 'negative'",
    "completion_percentage must be between 0 and 100"
  ]
}
```

#### Erro de Autenticação (401 Unauthorized)

```json
{
  "error": "Authentication failed",
  "message": "Must be authenticated or provide X-Guest-Id header"
}
```

#### Erro Interno (500 Internal Server Error)

```json
{
  "error": "Internal server error",
  "message": "Failed to save meditation feedback"
}
```

---

## 4. Regras de Validação

### 4.1 Headers

```javascript
// Validação dos headers
const sessionId = req.headers['x-session-id'];
const guestId = req.headers['x-guest-id'];
const authToken = req.headers['authorization'];

// X-Session-Id SEMPRE obrigatório
if (!sessionId) {
  return res.status(400).json({
    error: 'Validation failed',
    details: ['X-Session-Id header is required']
  });
}

// Precisa ter X-Guest-Id OU Authorization
if (!guestId && !authToken) {
  return res.status(401).json({
    error: 'Authentication failed',
    message: 'Must be authenticated or provide X-Guest-Id header'
  });
}
```

### 4.2 Payload

```javascript
const errors = [];

// Vote obrigatório
if (!['positive', 'negative'].includes(body.vote)) {
  errors.push("vote must be 'positive' or 'negative'");
}

// Reasons obrigatório quando negativo
if (body.vote === 'negative' && (!body.reasons || body.reasons.length === 0)) {
  errors.push("reasons are required when vote is 'negative'");
}

// Validar reasons values
if (body.reasons) {
  const validReasons = ['too_long', 'hard_to_focus', 'voice_music', 'other'];
  const invalidReasons = body.reasons.filter(r => !validReasons.includes(r));
  if (invalidReasons.length > 0) {
    errors.push(`Invalid reasons: ${invalidReasons.join(', ')}`);
  }
}

// Campos obrigatórios
const requiredFields = [
  'meditation_id',
  'meditation_title',
  'meditation_duration_seconds',
  'meditation_category',
  'actual_play_time_seconds',
  'completion_percentage'
];

requiredFields.forEach(field => {
  if (body[field] === undefined || body[field] === null) {
    errors.push(`${field} is required`);
  }
});

// Validar números
if (typeof body.meditation_duration_seconds !== 'number' || body.meditation_duration_seconds <= 0) {
  errors.push('meditation_duration_seconds must be a positive number');
}

if (typeof body.actual_play_time_seconds !== 'number' || body.actual_play_time_seconds < 0) {
  errors.push('actual_play_time_seconds must be a non-negative number');
}

if (typeof body.completion_percentage !== 'number' ||
    body.completion_percentage < 0 ||
    body.completion_percentage > 100) {
  errors.push('completion_percentage must be between 0 and 100');
}

// Se houver erros, retornar 400
if (errors.length > 0) {
  return res.status(400).json({
    error: 'Validation failed',
    details: errors
  });
}
```

---

## 5. Estrutura do Banco de Dados (Sugestão)

### Tabela: `meditation_feedback`

```sql
CREATE TABLE meditation_feedback (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW(),

  -- Identificação do usuário
  user_id UUID REFERENCES users(id),  -- NULL se for guest
  guest_id UUID,                       -- NULL se for user autenticado
  session_id UUID NOT NULL,

  -- Feedback
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('positive', 'negative')),
  reasons TEXT[],  -- Array de strings (apenas para negative)

  -- Informações da meditação
  meditation_id VARCHAR(255) NOT NULL,
  meditation_title VARCHAR(255) NOT NULL,
  meditation_duration_seconds INTEGER NOT NULL,
  meditation_category VARCHAR(100) NOT NULL,

  -- Métricas da sessão
  actual_play_time_seconds INTEGER NOT NULL,
  completion_percentage DECIMAL(5,2) NOT NULL CHECK (completion_percentage BETWEEN 0 AND 100),
  pause_count INTEGER DEFAULT 0,
  skip_count INTEGER DEFAULT 0,
  seek_count INTEGER DEFAULT 0,

  -- Informações extras
  background_sound_id VARCHAR(255),
  background_sound_title VARCHAR(255),
  feedback_source VARCHAR(100) DEFAULT 'meditation_completion',

  -- Constraints
  CONSTRAINT user_or_guest CHECK (
    (user_id IS NOT NULL AND guest_id IS NULL) OR
    (user_id IS NULL AND guest_id IS NOT NULL)
  ),
  CONSTRAINT negative_needs_reasons CHECK (
    vote != 'negative' OR (reasons IS NOT NULL AND array_length(reasons, 1) > 0)
  )
);

-- Índices para performance
CREATE INDEX idx_meditation_feedback_user_id ON meditation_feedback(user_id);
CREATE INDEX idx_meditation_feedback_guest_id ON meditation_feedback(guest_id);
CREATE INDEX idx_meditation_feedback_meditation_id ON meditation_feedback(meditation_id);
CREATE INDEX idx_meditation_feedback_category ON meditation_feedback(meditation_category);
CREATE INDEX idx_meditation_feedback_vote ON meditation_feedback(vote);
CREATE INDEX idx_meditation_feedback_created_at ON meditation_feedback(created_at);
```

---

## 6. Fluxo de Implementação Recomendado

### Passo 1: Criar a migração do banco de dados
- Executar SQL de criação da tabela `meditation_feedback`
- Criar índices para performance

### Passo 2: Criar o controller
```javascript
// routes/api/meditation.js ou similar
router.post('/meditation/feedback', validateFeedback, saveFeedback);
```

### Passo 3: Implementar middleware de validação
```javascript
function validateFeedback(req, res, next) {
  // Implementar validações da seção 4
  // Se passar, chamar next()
  // Se falhar, retornar 400 com detalhes
}
```

### Passo 4: Implementar controller de save
```javascript
async function saveFeedback(req, res) {
  try {
    // Extrair user_id do JWT (se autenticado)
    // OU usar guest_id do header
    // Inserir no banco
    // Retornar 201 com feedback_id
  } catch (error) {
    // Log do erro
    // Retornar 500
  }
}
```

### Passo 5: Testar endpoint
```bash
# Usar os exemplos da seção 3.4
# Verificar responses da seção 3.5
# Confirmar que dados estão no banco
```

---

## 7. Checklist de Implementação

### Backend
- [ ] Criar tabela `meditation_feedback` no banco de dados
- [ ] Criar índices para performance
- [ ] Implementar rota `POST /api/meditation/feedback`
- [ ] Implementar validação de headers (X-Session-Id, X-Guest-Id, Authorization)
- [ ] Implementar validação de payload (campos obrigatórios, tipos, ranges)
- [ ] Implementar lógica de save no banco
- [ ] Implementar tratamento de erros (400, 401, 500)
- [ ] Adicionar logs para debugging
- [ ] Testar com curl/Postman
- [ ] Verificar CORS (já configurado, mas validar)

### Testes Recomendados
- [ ] Teste: Feedback positivo de guest
- [ ] Teste: Feedback positivo de usuário autenticado
- [ ] Teste: Feedback negativo com reasons
- [ ] Teste: Feedback negativo SEM reasons (deve retornar 400)
- [ ] Teste: Request sem X-Session-Id (deve retornar 400)
- [ ] Teste: Request sem X-Guest-Id e sem Authorization (deve retornar 401)
- [ ] Teste: Reasons inválidas (deve retornar 400)
- [ ] Teste: completion_percentage fora do range 0-100 (deve retornar 400)
- [ ] Teste: Campos obrigatórios faltando (deve retornar 400)

### Deploy
- [ ] Fazer deploy no ambiente de desenvolvimento
- [ ] Testar frontend integrado
- [ ] Verificar dados no banco de dados
- [ ] Fazer deploy em produção
- [ ] Remover fallback temporário do frontend (opcional)

---

## 8. Arquivos de Referência (Frontend)

### Documentação existente:
1. **`VERIFICAR_FRONTEND_FEEDBACK.md`** - Especificação completa com exemplos
2. **`src/api/meditationFeedback.ts`** - Cliente de API do frontend (implementação de referência)
3. **`src/components/meditation/MeditationCompletion.tsx`** - Onde o feedback é enviado
4. **`src/components/meditation/MeditationFeedback.tsx`** - UI de coleta de feedback

### Exemplo de como o frontend está chamando:

```typescript
// src/api/meditationFeedback.ts (linhas 47-124)
export async function submitMeditationFeedback(
  payload: MeditationFeedbackPayload
): Promise<MeditationFeedbackResponse> {
  // Constrói headers com identidade
  const identityHeaders = buildIdentityHeaders();
  const token = await getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    'X-Session-Id': identityHeaders['X-Eco-Session-Id'],
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['X-Guest-Id'] = identityHeaders['X-Eco-Guest-Id'];
  }

  // POST para /api/meditation/feedback
  const response = await fetch('/api/meditation/feedback', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  // ⚠️ Atualmente retorna 404 - fallback implementado temporariamente
}
```

---

## 9. Workaround Temporário Implementado (Frontend)

Enquanto o endpoint não é implementado, o frontend está usando um fallback:

```typescript
// Se backend retornar 404, não mostra erro ao usuário
if (response.status === 404) {
  console.warn('Backend endpoint not implemented yet (404)');
  return { success: true, feedback_id: 'local-only' };
}
```

**Implicações:**
- ✅ UX não quebra para o usuário final
- ✅ Analytics via Mixpanel continua funcionando
- ❌ Dados NÃO estão sendo salvos no banco de dados do backend
- ⚠️ Quando o endpoint for implementado, remover este fallback (opcional)

---

## 10. Priorização e Impacto

### Impacto de NÃO implementar:
- 📊 **Perda de dados**: Feedback de meditação não é armazenado
- 🎯 **Personalização limitada**: Sem dados para melhorar recomendações
- 📈 **Analytics incompleto**: Apenas Mixpanel tem os dados (não o backend)

### Benefícios de implementar:
- ✅ Coletar feedback estruturado de meditações
- ✅ Possibilitar análise de preferências dos usuários
- ✅ Melhorar recomendações futuras
- ✅ Gerar relatórios de satisfação
- ✅ Identificar meditações mais/menos populares

### Estimativa de esforço:
- **Backend:** 2-4 horas (migração + endpoint + testes)
- **Frontend:** 0 horas (já implementado)
- **QA:** 1 hora (validação end-to-end)

**Total estimado:** 3-5 horas

---

## 11. Contato e Próximos Passos

### Dúvidas sobre especificação?
Consultar arquivo: `VERIFICAR_FRONTEND_FEEDBACK.md` na raiz do projeto frontend.

### Dúvidas sobre implementação do frontend?
Consultar arquivos:
- `src/api/meditationFeedback.ts`
- `src/components/meditation/MeditationCompletion.tsx`
- `src/components/meditation/MeditationFeedback.tsx`

### Quando implementado:
1. Notificar time de frontend
2. Frontend pode (opcionalmente) remover fallback temporário
3. Validar dados chegando no banco de dados
4. Monitorar logs para erros

---

**Documento preparado por:** Claude Code (Frontend ECO)
**Para:** Time de Backend ECO
**Objetivo:** Implementar endpoint `POST /api/meditation/feedback`
**Prioridade:** ALTA
