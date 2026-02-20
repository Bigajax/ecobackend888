# Meditation Feedback API - cURL Examples

## Configuração Base

```bash
# Defina a URL base (ajuste conforme seu ambiente)
BASE_URL="http://localhost:3001"

# Gere IDs de sessão e guest (ou use IDs fixos para teste)
SESSION_ID="550e8400-e29b-41d4-a716-446655440000"
GUEST_ID="660e8400-e29b-41d4-a716-446655440001"
```

---

## 1. Feedback Positivo (Guest User)

```bash
curl -X POST "${BASE_URL}/api/meditation/feedback" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: ${SESSION_ID}" \
  -H "X-Guest-Id: ${GUEST_ID}" \
  -d '{
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
    "background_sound_id": "freq_1",
    "background_sound_title": "432Hz"
  }'
```

**Resposta Esperada (201 Created):**
```json
{
  "success": true,
  "feedback_id": "770e8400-e29b-41d4-a716-446655440002",
  "message": "Feedback registrado com sucesso"
}
```

---

## 2. Feedback Negativo com Razões

```bash
curl -X POST "${BASE_URL}/api/meditation/feedback" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: ${SESSION_ID}" \
  -H "X-Guest-Id: ${GUEST_ID}" \
  -d '{
    "vote": "negative",
    "reasons": ["too_long", "hard_to_focus"],
    "meditation_id": "dr_joe_morning_1",
    "meditation_title": "Meditação da Manhã - Dr. Joe Dispenza",
    "meditation_duration_seconds": 1800,
    "meditation_category": "dr_joe_dispenza",
    "actual_play_time_seconds": 600,
    "completion_percentage": 33.33,
    "pause_count": 5,
    "skip_count": 2,
    "seek_count": 3
  }'
```

**Resposta Esperada (201 Created):**
```json
{
  "success": true,
  "feedback_id": "880e8400-e29b-41d4-a716-446655440003",
  "message": "Feedback registrado com sucesso"
}
```

---

## 3. Feedback Positivo com Som de Fundo

```bash
curl -X POST "${BASE_URL}/api/meditation/feedback" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: ${SESSION_ID}" \
  -H "X-Guest-Id: ${GUEST_ID}" \
  -d '{
    "vote": "positive",
    "meditation_id": "morning_gratitude",
    "meditation_title": "Gratidão Matinal",
    "meditation_duration_seconds": 900,
    "meditation_category": "gratitude",
    "actual_play_time_seconds": 900,
    "completion_percentage": 100,
    "pause_count": 0,
    "skip_count": 0,
    "seek_count": 0,
    "background_sound_id": "nature_rain",
    "background_sound_title": "Chuva Suave"
  }'
```

---

## 4. Feedback de Usuário Autenticado

```bash
# Obtenha o JWT token do Supabase Auth primeiro
JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X POST "${BASE_URL}/api/meditation/feedback" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "X-Session-Id: ${SESSION_ID}" \
  -d '{
    "vote": "positive",
    "meditation_id": "evening_calm",
    "meditation_title": "Calma Noturna",
    "meditation_duration_seconds": 600,
    "meditation_category": "sleep",
    "actual_play_time_seconds": 600,
    "completion_percentage": 100,
    "pause_count": 0,
    "skip_count": 0,
    "seek_count": 0
  }'
```

---

## Casos de Erro

### Erro 1: Session ID Ausente (400)

```bash
curl -X POST "${BASE_URL}/api/meditation/feedback" \
  -H "Content-Type: application/json" \
  -H "X-Guest-Id: ${GUEST_ID}" \
  -d '{
    "vote": "positive",
    "meditation_id": "test",
    "meditation_title": "Test",
    "meditation_duration_seconds": 300,
    "meditation_category": "test",
    "actual_play_time_seconds": 300,
    "completion_percentage": 100
  }'
```

**Resposta Esperada (400 Bad Request):**
```json
{
  "error": "Validation failed",
  "details": ["X-Session-Id header is required"]
}
```

---

### Erro 2: Vote Negativo sem Razões (400)

```bash
curl -X POST "${BASE_URL}/api/meditation/feedback" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: ${SESSION_ID}" \
  -H "X-Guest-Id: ${GUEST_ID}" \
  -d '{
    "vote": "negative",
    "meditation_id": "test",
    "meditation_title": "Test",
    "meditation_duration_seconds": 300,
    "meditation_category": "test",
    "actual_play_time_seconds": 300,
    "completion_percentage": 100
  }'
```

**Resposta Esperada (400 Bad Request):**
```json
{
  "error": "Validation failed",
  "details": ["reasons: reasons are required when vote is 'negative'"]
}
```

---

### Erro 3: Campos Obrigatórios Ausentes (400)

```bash
curl -X POST "${BASE_URL}/api/meditation/feedback" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: ${SESSION_ID}" \
  -H "X-Guest-Id: ${GUEST_ID}" \
  -d '{
    "vote": "positive"
  }'
```

**Resposta Esperada (400 Bad Request):**
```json
{
  "error": "Validation failed",
  "details": [
    "meditation_id: Required",
    "meditation_title: Required",
    "meditation_duration_seconds: Required",
    "meditation_category: Required",
    "actual_play_time_seconds: Required",
    "completion_percentage: Required"
  ]
}
```

---

### Erro 4: Completion Percentage Inválido (400)

```bash
curl -X POST "${BASE_URL}/api/meditation/feedback" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: ${SESSION_ID}" \
  -H "X-Guest-Id: ${GUEST_ID}" \
  -d '{
    "vote": "positive",
    "meditation_id": "test",
    "meditation_title": "Test",
    "meditation_duration_seconds": 300,
    "meditation_category": "test",
    "actual_play_time_seconds": 300,
    "completion_percentage": 150
  }'
```

**Resposta Esperada (400 Bad Request):**
```json
{
  "error": "Validation failed",
  "details": ["completion_percentage: Number must be less than or equal to 100"]
}
```

---

## Verificar Feedback no Banco de Dados

Após submeter feedback, você pode verificar no Supabase SQL Editor:

```sql
-- Ver todos os feedbacks recentes
SELECT
  id,
  vote,
  reasons,
  meditation_title,
  meditation_category,
  completion_percentage,
  created_at,
  session_id,
  guest_id,
  user_id
FROM meditation_feedback
ORDER BY created_at DESC
LIMIT 10;

-- Ver feedbacks de uma sessão específica
SELECT *
FROM meditation_feedback
WHERE session_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY created_at DESC;

-- Ver estatísticas de feedback
SELECT
  meditation_category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE vote = 'positive') as positive,
  COUNT(*) FILTER (WHERE vote = 'negative') as negative,
  ROUND(AVG(completion_percentage), 2) as avg_completion
FROM meditation_feedback
GROUP BY meditation_category
ORDER BY total DESC;
```

---

## Notas Importantes

1. **UUID v4**: Os IDs de sessão e guest devem ser UUIDs v4 válidos
2. **Headers**: `X-Session-Id` é obrigatório; `X-Guest-Id` é obrigatório se não autenticado
3. **Autenticação**: Use `Authorization: Bearer <token>` para usuários autenticados
4. **Razões**: Apenas `["too_long", "hard_to_focus", "voice_music", "other"]` são válidas
5. **Completion**: Deve estar entre 0 e 100
6. **Duração**: Deve ser um número positivo em segundos
