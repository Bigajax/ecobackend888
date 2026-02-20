# Sistema de Feedback - Quick Start Guide

⚡ **Guia rápido para começar a usar o sistema de feedback em 5 minutos**

---

## 🚀 Passo a Passo Rápido

### 1️⃣ Executar Migrações SQL (1 minuto)

1. Abra o **Supabase Dashboard** (https://app.supabase.com)
2. Navegue até **SQL Editor**
3. Abra e execute os arquivos SQL na ordem:

```sql
-- Arquivo 1: Criar tabela user_feedback
-- Copie e cole: supabase/migrations/20260120_create_user_feedback_table.sql

-- Arquivo 2: Queries administrativas
-- Copie e cole: supabase/migrations/20260120_feedback_admin_queries.sql
```

✅ **Confirmação**: Verifique se a tabela `user_feedback` aparece no **Table Editor**

---

### 2️⃣ Iniciar Servidor Backend (30 segundos)

```bash
cd server
npm run dev
```

✅ **Confirmação**: Deve aparecer no console:
```
Servidor Express rodando na porta 3001
```

---

### 3️⃣ Testar Endpoint (30 segundos)

**Opção A: Teste Manual com cURL**

```bash
curl -X POST http://localhost:3001/api/user-feedback \
  -H "Content-Type: application/json" \
  -H "x-eco-guest-id: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{"message":"Meu primeiro feedback!","category":"improvement"}'
```

**Opção B: Teste Automatizado (Recomendado)**

```bash
npm run smoke:feedback
```

✅ **Confirmação**: Deve retornar status 201 e `{"success": true, ...}`

---

### 4️⃣ Verificar no Supabase (30 segundos)

1. Volte ao **Supabase Dashboard**
2. Navegue até **Table Editor** → `user_feedback`
3. Veja seu feedback salvo!

✅ **Confirmação**: Deve aparecer uma linha com sua mensagem

---

## 🎯 Endpoints Principais

### POST /api/user-feedback
**Descrição**: Enviar feedback

**Headers**:
```json
{
  "Content-Type": "application/json",
  "x-eco-guest-id": "uuid-v4-aqui"
}
```

**Body**:
```json
{
  "message": "Texto do feedback (obrigatório)",
  "category": "bug | feature | improvement | other",
  "page": "/caminho/opcional"
}
```

**Response 201 - Sucesso**:
```json
{
  "success": true,
  "message": "Feedback recebido com sucesso! Obrigado por contribuir.",
  "feedbackId": "uuid-do-feedback"
}
```

---

## 📊 Queries Úteis (Copie e Cole no SQL Editor)

### Ver todos os feedbacks
```sql
SELECT * FROM user_feedback ORDER BY created_at DESC;
```

### Estatísticas gerais
```sql
SELECT get_feedback_stats();
```

### Feedbacks por categoria
```sql
SELECT category, COUNT(*) as total
FROM user_feedback
GROUP BY category
ORDER BY total DESC;
```

### Feedbacks das últimas 24 horas
```sql
SELECT * FROM feedback_recente LIMIT 10;
```

---

## 🧪 Testes Rápidos

### Teste 1: Feedback Básico ✅
```bash
curl -X POST http://localhost:3001/api/user-feedback \
  -H "Content-Type: application/json" \
  -H "x-eco-guest-id: $(uuidgen)" \
  -d '{"message":"Teste básico","category":"other"}'
```

### Teste 2: Rate Limiting (6x seguidas) ⚠️
```bash
for i in {1..6}; do
  curl -X POST http://localhost:3001/api/user-feedback \
    -H "Content-Type: application/json" \
    -H "x-eco-guest-id: 550e8400-e29b-41d4-a716-446655440000" \
    -d '{"message":"Teste '$i'"}' && echo ""
done
```
**Resultado esperado**: Primeiras 5 retornam 201, a 6ª retorna 429 (rate limit)

### Teste 3: Suite Completa 🚀
```bash
npm run smoke:feedback
```
**Resultado esperado**: 8 testes passando

---

## ❌ Troubleshooting

### Erro: "Failed to insert feedback"
**Solução**: Verificar variáveis de ambiente
```bash
# Verificar .env
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

### Erro: "Too many requests (429)"
**Solução**: Aguardar 15 minutos ou usar novo UUID
```bash
# Gerar novo UUID
uuidgen  # macOS/Linux
# ou
node -e "console.log(require('crypto').randomUUID())"  # Windows/Node
```

### Erro: "Invalid UUID format"
**Solução**: Validar UUID v4
```bash
# UUID válido deve ter formato:
# xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
# Exemplo: 550e8400-e29b-41d4-a716-446655440000
```

### Tabela não existe
**Solução**: Executar migrações SQL novamente

---

## 📚 Documentação Completa

- **Guia Completo**: `docs/FEEDBACK_SYSTEM.md`
- **Resumo Implementação**: `FEEDBACK_IMPLEMENTATION_SUMMARY.md`
- **Arquitetura Backend**: `CLAUDE.md`

---

## 🔗 Links Úteis

- **Supabase Dashboard**: https://app.supabase.com
- **Endpoint Local**: http://localhost:3001/api/user-feedback
- **Health Check**: http://localhost:3001/api/health

---

## ✅ Checklist de Validação Rápida

- [ ] Migrações SQL executadas
- [ ] Tabela `user_feedback` existe no Supabase
- [ ] Servidor rodando em http://localhost:3001
- [ ] cURL retorna status 201
- [ ] Feedback aparece no Supabase Table Editor
- [ ] `npm run smoke:feedback` passa todos os testes

---

**🎉 Tudo funcionando? Sistema pronto para usar!**

---

**Criado em**: 2026-01-20
**Versão**: 1.0
