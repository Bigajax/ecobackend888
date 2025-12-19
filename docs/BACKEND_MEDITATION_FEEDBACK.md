# Backend: Sistema de Feedback de Meditação

## Visão Geral

Este documento especifica a implementação do sistema de feedback de meditação no backend, incluindo schema do banco de dados, endpoints da API e queries necessárias.

---

## 1. Schema do Banco de Dados (PostgreSQL)

### Tabela: `meditation_feedback`

```sql
CREATE TABLE meditation_feedback (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Feedback principal
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('positive', 'negative')),
  reasons TEXT[], -- Array de strings: ['too_long', 'hard_to_focus', 'voice_music', 'other']

  -- Contexto da meditação
  meditation_id VARCHAR(100) NOT NULL,
  meditation_title VARCHAR(255) NOT NULL,
  meditation_duration_seconds INTEGER NOT NULL,
  meditation_category VARCHAR(50) NOT NULL, -- 'energy_blessings', 'dr_joe_dispenza', etc.

  -- Métricas de sessão
  actual_play_time_seconds INTEGER NOT NULL,
  completion_percentage DECIMAL(5,2) NOT NULL CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  pause_count INTEGER DEFAULT 0,
  skip_count INTEGER DEFAULT 0,
  seek_count INTEGER DEFAULT 0,

  -- Som de fundo
  background_sound_id VARCHAR(50),
  background_sound_title VARCHAR(100),

  -- Identidade do usuário (3 níveis)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL se guest
  session_id VARCHAR(100) NOT NULL,
  guest_id VARCHAR(100),

  -- Metadados
  feedback_source VARCHAR(50) DEFAULT 'meditation_completion',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Índices para performance
  CONSTRAINT valid_user CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);

-- Índices
CREATE INDEX idx_meditation_feedback_user_id ON meditation_feedback(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_meditation_feedback_meditation_id ON meditation_feedback(meditation_id);
CREATE INDEX idx_meditation_feedback_category ON meditation_feedback(meditation_category);
CREATE INDEX idx_meditation_feedback_vote ON meditation_feedback(vote);
CREATE INDEX idx_meditation_feedback_created_at ON meditation_feedback(created_at DESC);
CREATE INDEX idx_meditation_feedback_session_id ON meditation_feedback(session_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_meditation_feedback_updated_at
  BEFORE UPDATE ON meditation_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## 2. Endpoint da API

### `POST /api/meditation/feedback`

**Descrição**: Recebe feedback de meditação do frontend

**Headers**:
```
Content-Type: application/json
Authorization: Bearer <token> (opcional - para usuários autenticados)
X-Session-Id: <session_id> (obrigatório)
X-Guest-Id: <guest_id> (opcional - para guests)
```

**Body**:
```json
{
  "vote": "positive" | "negative",
  "reasons": ["too_long", "hard_to_focus"], // apenas se vote = "negative"
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
  "background_sound_title": "432Hz",
  "feedback_source": "meditation_completion"
}
```

**Validações**:
- ✅ `vote` deve ser "positive" ou "negative"
- ✅ `reasons` só pode existir se `vote = "negative"`
- ✅ `meditation_id` é obrigatório
- ✅ `meditation_duration_seconds` > 0
- ✅ `completion_percentage` entre 0 e 100
- ✅ `session_id` no header é obrigatório
- ✅ Deve ter `user_id` (do token) OU `guest_id` (do header)

**Response 201 (Sucesso)**:
```json
{
  "success": true,
  "feedback_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Feedback registrado com sucesso"
}
```

**Response 400 (Erro de Validação)**:
```json
{
  "error": "Validation failed",
  "details": [
    "vote must be 'positive' or 'negative'",
    "session_id header is required"
  ]
}
```

**Response 500 (Erro Interno)**:
```json
{
  "error": "Internal server error",
  "message": "Failed to save feedback"
}
```

---

## 3. Queries SQL Úteis

### 3.1 Inserir Feedback

```sql
INSERT INTO meditation_feedback (
  vote,
  reasons,
  meditation_id,
  meditation_title,
  meditation_duration_seconds,
  meditation_category,
  actual_play_time_seconds,
  completion_percentage,
  pause_count,
  skip_count,
  seek_count,
  background_sound_id,
  background_sound_title,
  user_id,
  session_id,
  guest_id,
  feedback_source
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
) RETURNING id;
```

### 3.2 Analytics: Taxa de Feedback Positivo por Meditação

```sql
SELECT
  meditation_id,
  meditation_title,
  COUNT(*) as total_feedbacks,
  COUNT(*) FILTER (WHERE vote = 'positive') as positive_count,
  COUNT(*) FILTER (WHERE vote = 'negative') as negative_count,
  ROUND(
    (COUNT(*) FILTER (WHERE vote = 'positive')::DECIMAL / COUNT(*)) * 100,
    2
  ) as positive_rate
FROM meditation_feedback
GROUP BY meditation_id, meditation_title
ORDER BY total_feedbacks DESC
LIMIT 20;
```

### 3.3 Analytics: Razões de Feedback Negativo Mais Comuns

```sql
SELECT
  unnest(reasons) as reason,
  COUNT(*) as count
FROM meditation_feedback
WHERE vote = 'negative' AND reasons IS NOT NULL
GROUP BY reason
ORDER BY count DESC;
```

### 3.4 Analytics: Feedback por Categoria de Meditação

```sql
SELECT
  meditation_category,
  COUNT(*) as total_feedbacks,
  COUNT(*) FILTER (WHERE vote = 'positive') as positive_count,
  ROUND(AVG(completion_percentage), 2) as avg_completion,
  ROUND(AVG(pause_count), 2) as avg_pauses
FROM meditation_feedback
GROUP BY meditation_category
ORDER BY total_feedbacks DESC;
```

### 3.5 Analytics: Meditações com Maior Taxa de Abandono

```sql
SELECT
  meditation_id,
  meditation_title,
  COUNT(*) as total_sessions,
  ROUND(AVG(completion_percentage), 2) as avg_completion,
  COUNT(*) FILTER (WHERE completion_percentage < 50) as abandoned_count,
  ROUND(
    (COUNT(*) FILTER (WHERE completion_percentage < 50)::DECIMAL / COUNT(*)) * 100,
    2
  ) as abandon_rate
FROM meditation_feedback
GROUP BY meditation_id, meditation_title
HAVING COUNT(*) > 10
ORDER BY abandon_rate DESC
LIMIT 20;
```

### 3.6 Analytics: Feedbacks de um Usuário Específico

```sql
SELECT
  mf.id,
  mf.vote,
  mf.reasons,
  mf.meditation_title,
  mf.completion_percentage,
  mf.created_at
FROM meditation_feedback mf
WHERE mf.user_id = $1
ORDER BY mf.created_at DESC
LIMIT 50;
```

### 3.7 Analytics: Impacto do Som de Fundo no Feedback

```sql
SELECT
  background_sound_id,
  background_sound_title,
  COUNT(*) as total_uses,
  COUNT(*) FILTER (WHERE vote = 'positive') as positive_count,
  ROUND(
    (COUNT(*) FILTER (WHERE vote = 'positive')::DECIMAL / COUNT(*)) * 100,
    2
  ) as positive_rate
FROM meditation_feedback
WHERE background_sound_id IS NOT NULL
GROUP BY background_sound_id, background_sound_title
ORDER BY total_uses DESC;
```

### 3.8 Analytics: Tendência de Feedback ao Longo do Tempo

```sql
SELECT
  DATE(created_at) as feedback_date,
  COUNT(*) as total_feedbacks,
  COUNT(*) FILTER (WHERE vote = 'positive') as positive_count,
  COUNT(*) FILTER (WHERE vote = 'negative') as negative_count,
  ROUND(
    (COUNT(*) FILTER (WHERE vote = 'positive')::DECIMAL / COUNT(*)) * 100,
    2
  ) as positive_rate
FROM meditation_feedback
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY feedback_date DESC;
```

---

## 4. Implementação Node.js/Express (Exemplo)

### Controller: `meditationFeedbackController.js`

```javascript
const { Pool } = require('pg');
const pool = new Pool(); // Configure com suas credenciais

// POST /api/meditation/feedback
async function submitMeditationFeedback(req, res) {
  try {
    // 1. Extrair dados do body
    const {
      vote,
      reasons,
      meditation_id,
      meditation_title,
      meditation_duration_seconds,
      meditation_category,
      actual_play_time_seconds,
      completion_percentage,
      pause_count = 0,
      skip_count = 0,
      seek_count = 0,
      background_sound_id,
      background_sound_title,
      feedback_source = 'meditation_completion'
    } = req.body;

    // 2. Extrair identidade
    const user_id = req.user?.id || null; // Do JWT token
    const session_id = req.headers['x-session-id'];
    const guest_id = req.headers['x-guest-id'] || null;

    // 3. Validações
    if (!vote || !['positive', 'negative'].includes(vote)) {
      return res.status(400).json({
        error: 'vote must be "positive" or "negative"'
      });
    }

    if (!session_id) {
      return res.status(400).json({
        error: 'X-Session-Id header is required'
      });
    }

    if (!user_id && !guest_id) {
      return res.status(400).json({
        error: 'Must be authenticated or provide X-Guest-Id'
      });
    }

    if (!meditation_id || !meditation_title) {
      return res.status(400).json({
        error: 'meditation_id and meditation_title are required'
      });
    }

    if (vote === 'negative' && (!reasons || reasons.length === 0)) {
      return res.status(400).json({
        error: 'reasons are required for negative feedback'
      });
    }

    // 4. Inserir no banco
    const query = `
      INSERT INTO meditation_feedback (
        vote, reasons, meditation_id, meditation_title,
        meditation_duration_seconds, meditation_category,
        actual_play_time_seconds, completion_percentage,
        pause_count, skip_count, seek_count,
        background_sound_id, background_sound_title,
        user_id, session_id, guest_id, feedback_source
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      ) RETURNING id
    `;

    const values = [
      vote,
      reasons || null,
      meditation_id,
      meditation_title,
      meditation_duration_seconds,
      meditation_category,
      actual_play_time_seconds,
      completion_percentage,
      pause_count,
      skip_count,
      seek_count,
      background_sound_id || null,
      background_sound_title || null,
      user_id,
      session_id,
      guest_id,
      feedback_source
    ];

    const result = await pool.query(query, values);
    const feedbackId = result.rows[0].id;

    // 5. Resposta de sucesso
    res.status(201).json({
      success: true,
      feedback_id: feedbackId,
      message: 'Feedback registrado com sucesso'
    });

  } catch (error) {
    console.error('Error saving meditation feedback:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to save feedback'
    });
  }
}

module.exports = { submitMeditationFeedback };
```

### Route: `meditationRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const { submitMeditationFeedback } = require('./meditationFeedbackController');
const { optionalAuth } = require('../middleware/auth'); // Middleware que permite guest e auth

router.post('/meditation/feedback', optionalAuth, submitMeditationFeedback);

module.exports = router;
```

---

## 5. Políticas de Segurança (Supabase RLS)

Se usar Supabase, configure Row Level Security:

```sql
-- Permitir INSERT para usuários autenticados e guests
CREATE POLICY "Allow insert meditation feedback"
ON meditation_feedback
FOR INSERT
WITH CHECK (
  -- Usuário autenticado pode inserir com seu user_id
  (auth.uid() = user_id)
  OR
  -- Guest pode inserir com guest_id (sem user_id)
  (user_id IS NULL AND guest_id IS NOT NULL)
);

-- Permitir SELECT apenas para admins ou próprio usuário
CREATE POLICY "Allow select own feedback"
ON meditation_feedback
FOR SELECT
USING (
  auth.uid() = user_id
  OR
  auth.jwt()->>'role' = 'admin'
);

-- Não permitir UPDATE ou DELETE
ALTER TABLE meditation_feedback ENABLE ROW LEVEL SECURITY;
```

---

## 6. Testes

### Exemplo de Teste com cURL

```bash
# Feedback positivo (usuário autenticado)
curl -X POST http://localhost:3000/api/meditation/feedback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "X-Session-Id: session-123" \
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

# Feedback negativo (guest)
curl -X POST http://localhost:3000/api/meditation/feedback \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: session-456" \
  -H "X-Guest-Id: guest-789" \
  -d '{
    "vote": "negative",
    "reasons": ["too_long", "hard_to_focus"],
    "meditation_id": "dr_joe_1",
    "meditation_title": "Meditação da Manhã",
    "meditation_duration_seconds": 1800,
    "meditation_category": "dr_joe_dispenza",
    "actual_play_time_seconds": 600,
    "completion_percentage": 33.33,
    "pause_count": 5,
    "skip_count": 2,
    "seek_count": 3
  }'
```

---

## 7. Monitoramento e Alertas

### Queries de Monitoramento

```sql
-- Total de feedbacks hoje
SELECT COUNT(*) as feedbacks_today
FROM meditation_feedback
WHERE created_at >= CURRENT_DATE;

-- Taxa de feedback positivo nas últimas 24h
SELECT
  ROUND(
    (COUNT(*) FILTER (WHERE vote = 'positive')::DECIMAL / COUNT(*)) * 100,
    2
  ) as positive_rate_24h
FROM meditation_feedback
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- Meditações com muitos feedbacks negativos recentes
SELECT
  meditation_id,
  meditation_title,
  COUNT(*) as negative_count
FROM meditation_feedback
WHERE vote = 'negative'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY meditation_id, meditation_title
HAVING COUNT(*) > 5
ORDER BY negative_count DESC;
```

---

## 8. Próximos Passos

1. ✅ Criar tabela `meditation_feedback` no banco
2. ✅ Implementar endpoint `POST /api/meditation/feedback`
3. ✅ Configurar RLS (se Supabase)
4. ✅ Testar com dados reais do frontend
5. ✅ Criar dashboard de analytics com queries acima
6. ✅ Configurar alertas para feedbacks negativos em massa
7. ✅ Implementar cache (Redis) para queries de analytics

---

## Apêndice: Razões de Feedback

### Códigos e Tradução

| Código | Label PT-BR | Categoria |
|--------|-------------|-----------|
| `too_long` | Muito longa | Duração |
| `hard_to_focus` | Difícil de focar | Qualidade |
| `voice_music` | Voz/música não agradou | Áudio |
| `other` | Outro | Genérico |

---

**Documento gerado em**: 19 de Dezembro de 2025
**Versão**: 1.0
**Compatível com**: Frontend ECO v1.0
