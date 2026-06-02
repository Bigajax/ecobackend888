# 🔍 Diagnóstico: Feedback de Meditação Não Funciona

## Passo 1: Verificar se a Migration Foi Aplicada

Execute no Supabase SQL Editor:

```sql
-- 1. Verificar se a tabela existe no schema correto
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_name = 'meditation_feedback';

-- Resultado esperado: analytics | meditation_feedback
-- Se retornar "public", a migration não foi aplicada corretamente

-- 2. Verificar permissões do service_role
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'analytics'
AND table_name = 'meditation_feedback'
AND grantee = 'service_role';

-- Deve retornar: service_role | SELECT, INSERT, UPDATE, DELETE

-- 3. Verificar RLS policies
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'meditation_feedback';

-- Deve retornar 2 políticas:
-- "Allow insert meditation feedback" | INSERT
-- "Allow select own feedback" | SELECT
```

## Passo 2: Testar o Backend Diretamente

### Opção A: Via Curl (Windows PowerShell)

```powershell
# Substitua os valores:
# - URL do backend (ex: http://localhost:3001)
# - X-Session-Id com um UUID qualquer
# - X-Guest-Id com um UUID qualquer

curl -X POST http://localhost:3001/api/meditation/feedback `
  -H "Content-Type: application/json" `
  -H "X-Session-Id: 12345678-1234-1234-1234-123456789012" `
  -H "X-Guest-Id: 87654321-4321-4321-4321-210987654321" `
  -d '{
    "vote": "positive",
    "meditation_id": "test_meditation_001",
    "meditation_title": "Teste de Meditação",
    "meditation_duration_seconds": 600,
    "meditation_category": "mindfulness",
    "actual_play_time_seconds": 600,
    "completion_percentage": 100
  }'
```

### Opção B: Via Script de Teste do Backend

```bash
# Se o backend tiver um script de teste
npm run test:meditation-feedback
```

**Resultado esperado:**
```json
{
  "success": true,
  "feedback_id": "uuid-aqui",
  "message": "Feedback registrado com sucesso"
}
```

**Se der erro, anote a mensagem de erro completa!**

## Passo 3: Verificar Logs do Backend

Inicie o backend em modo debug:

```bash
# No terminal do backend
ECO_DEBUG=true npm run dev
```

Depois tente enviar o feedback pelo frontend e observe os logs. Procure por:
- ❌ `meditation_feedback.insert_failed`
- ❌ `meditation_feedback.validation_failed`
- ✅ `meditation_feedback.saved`

## Passo 4: Investigar o Frontend

Se os passos anteriores funcionaram (curl retornou sucesso), o problema está no frontend.

### Verifique no DevTools do navegador:

1. Abra DevTools (F12)
2. Vá em **Network**
3. Filtre por "feedback"
4. Envie o feedback
5. Verifique a requisição:
   - **URL**: Deve ser `http://seu-backend/api/meditation/feedback`
   - **Method**: POST
   - **Headers**:
     - `Content-Type: application/json`
     - `X-Session-Id: ...`
     - `X-Guest-Id: ...` (ou token de autenticação)
   - **Payload**: Verifique se todos os campos obrigatórios estão presentes
   - **Response**: Anote o status code e a resposta

### Campos obrigatórios no payload:
```typescript
{
  vote: "positive" | "negative",
  meditation_id: string,
  meditation_title: string,
  meditation_duration_seconds: number,
  meditation_category: string,
  actual_play_time_seconds: number,
  completion_percentage: number,
  // Se vote = "negative", obrigatório:
  reasons: string[] // ex: ["too_long", "hard_to_focus"]
}
```

## Passo 5: Cenários Comuns de Erro

### Erro 400 - Validation Failed
**Causa:** Payload inválido ou headers ausentes
**Solução:** Verifique no DevTools o payload enviado

### Erro 500 - Internal Server Error
**Causa:** Problema na inserção no banco
**Solução:** Verifique os logs do backend

### Requisição não chega ao backend
**Causa:** URL incorreta ou CORS
**Solução:** Verifique a URL do backend no frontend

### Resposta 200/201 mas não aparece no Supabase
**Causa:** Tabela no schema errado
**Solução:** Execute novamente o Passo 1

## Próximos Passos

Execute os passos na ordem e anote onde falhou. Isso vai ajudar a identificar se o problema é:
- 🔴 Migration não aplicada
- 🔴 Permissões do Supabase
- 🔴 Backend com erro
- 🔴 Frontend enviando payload errado
- 🔴 CORS ou conexão
