# 🎨 Checklist para Verificar Frontend - Feedback de Meditação

## 📋 Informações para o Dev do Frontend

### 1. Endpoint Correto

```
POST http://seu-backend.com/api/meditation/feedback
```

**⚠️ IMPORTANTE:**
- O endpoint é `/api/meditation/feedback` (NÃO `/api/feedback`)
- Método: `POST`
- Content-Type: `application/json`

---

## 2. Headers Obrigatórios

```javascript
{
  "Content-Type": "application/json",
  "X-Session-Id": "UUID_v4_aqui",      // OBRIGATÓRIO
  "X-Guest-Id": "UUID_v4_aqui"         // OBRIGATÓRIO para guests
  // OU
  "Authorization": "Bearer token_jwt"   // Para usuários autenticados
}
```

**⚠️ CRÍTICO:**
- `X-Session-Id` é **SEMPRE obrigatório**
- Se o usuário for guest: `X-Guest-Id` é obrigatório
- Se o usuário for autenticado: `Authorization` com JWT

---

## 3. Estrutura do Payload (Body da Requisição)

### Para Feedback POSITIVO:

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
  "seek_count": 1,
  "background_sound_id": "freq_432hz",
  "background_sound_title": "432Hz",
  "feedback_source": "meditation_completion"
}
```

### Para Feedback NEGATIVO:

```json
{
  "vote": "negative",
  "reasons": ["too_long", "hard_to_focus"],  // OBRIGATÓRIO quando negative
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

---

## 4. Campos do Payload

### ✅ Campos OBRIGATÓRIOS:

| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `vote` | string | "positive" ou "negative" | "positive" |
| `meditation_id` | string | ID único da meditação | "energy_blessing_1" |
| `meditation_title` | string | Título da meditação | "Bênçãos" |
| `meditation_duration_seconds` | number | Duração total em segundos | 462 |
| `meditation_category` | string | Categoria da meditação | "energy_blessings" |
| `actual_play_time_seconds` | number | Tempo real ouvido | 445 |
| `completion_percentage` | number | 0 a 100 | 96.32 |

### ⚠️ Campos CONDICIONALMENTE OBRIGATÓRIOS:

| Campo | Quando é obrigatório | Tipo | Valores aceitos |
|-------|---------------------|------|-----------------|
| `reasons` | Quando vote = "negative" | array | ["too_long", "hard_to_focus", "voice_music", "other"] |

### 🔹 Campos OPCIONAIS:

| Campo | Tipo | Padrão |
|-------|------|--------|
| `pause_count` | number | 0 |
| `skip_count` | number | 0 |
| `seek_count` | number | 0 |
| `background_sound_id` | string | null |
| `background_sound_title` | string | null |
| `feedback_source` | string | "meditation_completion" |

---

## 5. Valores Aceitos para `reasons` (feedback negativo)

```javascript
const VALID_REASONS = [
  "too_long",        // Meditação muito longa
  "hard_to_focus",   // Difícil de focar
  "voice_music",     // Problema com voz/música
  "other"            // Outro motivo
];
```

**⚠️ IMPORTANTE:** Se `vote = "negative"`, o array `reasons` **DEVE** ter pelo menos 1 item!

---

## 6. Resposta Esperada

### ✅ Sucesso (Status 201):

```json
{
  "success": true,
  "feedback_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Feedback registrado com sucesso"
}
```

### ❌ Erro de Validação (Status 400):

```json
{
  "error": "Validation failed",
  "details": [
    "X-Session-Id header is required",
    "reasons are required when vote is 'negative'"
  ]
}
```

### ❌ Erro Interno (Status 500):

```json
{
  "error": "Internal server error",
  "message": "Failed to save meditation feedback"
}
```

---

## 7. Exemplo de Código (React/TypeScript)

```typescript
interface MeditationFeedback {
  vote: 'positive' | 'negative';
  reasons?: string[];
  meditation_id: string;
  meditation_title: string;
  meditation_duration_seconds: number;
  meditation_category: string;
  actual_play_time_seconds: number;
  completion_percentage: number;
  pause_count?: number;
  skip_count?: number;
  seek_count?: number;
  background_sound_id?: string;
  background_sound_title?: string;
  feedback_source?: string;
}

async function submitMeditationFeedback(
  feedback: MeditationFeedback,
  sessionId: string,
  guestId?: string,
  authToken?: string
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Session-Id': sessionId,
  };

  if (guestId) {
    headers['X-Guest-Id'] = guestId;
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch('http://seu-backend.com/api/meditation/feedback', {
    method: 'POST',
    headers,
    body: JSON.stringify(feedback),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to submit feedback');
  }

  return await response.json();
}

// Uso:
try {
  const result = await submitMeditationFeedback(
    {
      vote: 'positive',
      meditation_id: 'energy_blessing_1',
      meditation_title: 'Bênçãos',
      meditation_duration_seconds: 462,
      meditation_category: 'energy_blessings',
      actual_play_time_seconds: 445,
      completion_percentage: 96.32,
    },
    'session-uuid-aqui',
    'guest-uuid-aqui' // opcional se autenticado
  );

  console.log('Feedback enviado:', result.feedback_id);
} catch (error) {
  console.error('Erro ao enviar feedback:', error);
}
```

---

## 8. Como Debugar no DevTools (Chrome/Firefox)

### 1. Abra DevTools (F12)
### 2. Vá na aba "Network"
### 3. Filtre por "feedback"
### 4. Envie o feedback
### 5. Clique na requisição e verifique:

#### ✅ Request Headers - Devem conter:
```
Content-Type: application/json
X-Session-Id: <uuid>
X-Guest-Id: <uuid> OU Authorization: Bearer <token>
```

#### ✅ Request Payload - Deve ter todos os campos obrigatórios:
```json
{
  "vote": "positive",
  "meditation_id": "...",
  "meditation_title": "...",
  // ... todos os outros campos
}
```

#### ✅ Response - Verifique o status:
- **201** = Sucesso ✅
- **400** = Erro de validação ❌ (veja "details" na resposta)
- **500** = Erro no servidor ❌ (problema no backend)

---

## 9. Erros Comuns no Frontend

### ❌ Erro 1: Headers ausentes
```javascript
// ❌ ERRADO
fetch('/api/meditation/feedback', {
  method: 'POST',
  body: JSON.stringify(data)
})

// ✅ CORRETO
fetch('/api/meditation/feedback', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-Id': sessionId,
    'X-Guest-Id': guestId
  },
  body: JSON.stringify(data)
})
```

### ❌ Erro 2: Campo `reasons` ausente quando negative
```javascript
// ❌ ERRADO
{
  vote: 'negative',
  // reasons: faltando!
}

// ✅ CORRETO
{
  vote: 'negative',
  reasons: ['too_long', 'hard_to_focus']
}
```

### ❌ Erro 3: Tipos de dados incorretos
```javascript
// ❌ ERRADO
{
  completion_percentage: "96.32",  // string
  pause_count: "2"                 // string
}

// ✅ CORRETO
{
  completion_percentage: 96.32,    // number
  pause_count: 2                   // number
}
```

### ❌ Erro 4: URL incorreta
```javascript
// ❌ ERRADO
POST /api/feedback
POST /api/meditations/feedback
POST /feedback

// ✅ CORRETO
POST /api/meditation/feedback
```

---

## 10. Checklist para o Dev Frontend

- [ ] URL do endpoint está correta: `/api/meditation/feedback`
- [ ] Header `Content-Type: application/json` está presente
- [ ] Header `X-Session-Id` está presente e é um UUID válido
- [ ] Header `X-Guest-Id` está presente (para guests) ou `Authorization` (para autenticados)
- [ ] Todos os campos obrigatórios estão no payload
- [ ] Campo `reasons` está presente quando `vote = "negative"`
- [ ] Tipos de dados estão corretos (numbers são numbers, não strings)
- [ ] `completion_percentage` está entre 0 e 100
- [ ] Está tratando erros 400 e 500 adequadamente
- [ ] Está verificando a resposta no DevTools Network

---

## 11. Teste Rápido (Console do Navegador)

Cole isso no console do navegador enquanto estiver na página:

```javascript
// Teste rápido de envio de feedback
(async () => {
  const sessionId = crypto.randomUUID();
  const guestId = crypto.randomUUID();

  const response = await fetch('http://localhost:3001/api/meditation/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': sessionId,
      'X-Guest-Id': guestId
    },
    body: JSON.stringify({
      vote: 'positive',
      meditation_id: 'test_001',
      meditation_title: 'Teste',
      meditation_duration_seconds: 300,
      meditation_category: 'test',
      actual_play_time_seconds: 300,
      completion_percentage: 100
    })
  });

  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Response:', data);
})();
```

---

## 12. Mensagens de Erro e Soluções

| Erro | Causa | Solução |
|------|-------|---------|
| "X-Session-Id header is required" | Header ausente | Adicionar header `X-Session-Id` |
| "Must be authenticated or provide X-Guest-Id header" | Nem guest nem auth | Adicionar `X-Guest-Id` ou `Authorization` |
| "reasons are required when vote is 'negative'" | `reasons` ausente | Adicionar array de reasons |
| "Failed to save meditation feedback" | Erro no backend/DB | Verificar logs do backend |
| CORS error | Backend não permite origem | Configurar CORS no backend |

---

## 📞 Precisa de Ajuda?

Se ainda não funcionar, peça ao dev frontend para enviar:
1. Screenshot do DevTools → Network → Request Headers
2. Screenshot do DevTools → Network → Request Payload
3. Screenshot do DevTools → Network → Response
4. Código da função que envia o feedback
