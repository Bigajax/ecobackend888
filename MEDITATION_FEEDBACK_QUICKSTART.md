# 🚀 Meditation Feedback - Quick Start

## 1️⃣ Aplicar Migração no Banco (PRIMEIRO PASSO!)

```bash
# Abra o Supabase Dashboard
# → SQL Editor
# → Cole o conteúdo de: supabase/migrations/20251219_create_meditation_feedback_table.sql
# → Execute
```

## 2️⃣ Testar Localmente

```bash
# Terminal 1: Iniciar servidor
cd server
npm run dev

# Terminal 2: Rodar testes
cd server
npm run test:meditation-feedback
```

## 3️⃣ Endpoint Pronto!

**URL**: `POST /api/meditation/feedback`

**Exemplo cURL**:
```bash
curl -X POST http://localhost:3001/api/meditation/feedback \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "X-Guest-Id: 660e8400-e29b-41d4-a716-446655440001" \
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
    "seek_count": 1
  }'
```

**Resposta Esperada**:
```json
{
  "success": true,
  "feedback_id": "770e8400-e29b-41d4-a716-446655440002",
  "message": "Feedback registrado com sucesso"
}
```

## 📚 Documentação Completa

- **Implementação**: `docs/MEDITATION_FEEDBACK_IMPLEMENTATION_SUMMARY.md`
- **Exemplos cURL**: `docs/MEDITATION_FEEDBACK_CURL_EXAMPLES.md`
- **Aplicar Migração**: `docs/APPLY_MEDITATION_MIGRATION.md`
- **Especificação Original**: `docs/BACKEND_MEDITATION_FEEDBACK.md`

## ✅ Arquivos Criados

```
✅ supabase/migrations/20251219_create_meditation_feedback_table.sql
✅ server/schemas/meditationFeedback.ts
✅ server/controllers/meditationFeedbackController.ts
✅ server/routes/meditationRoutes.ts
✅ server/scripts/testMeditationFeedback.ts
✅ server/core/http/app.ts (modificado)
✅ server/package.json (modificado)
```

## 🎯 Pronto para Integrar no Frontend!

O backend está **100% pronto** para receber feedbacks do frontend de meditação.
