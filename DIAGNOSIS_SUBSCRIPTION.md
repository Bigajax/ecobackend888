# 🔍 Script de Diagnóstico de Assinaturas

Este script verifica todas as tentativas de assinatura, pagamentos e status de usuários no sistema ECO.

## 📋 O que o script verifica:

1. **Tentativas de Checkout** - Usuários que clicaram em "Assinar"
2. **Eventos de Assinatura** - Todos os eventos do sistema
3. **Pagamentos** - Status dos pagamentos processados
4. **Usuários com Assinatura** - Assinaturas ativas, trials, canceladas
5. **Webhooks Recebidos** - Notificações do Mercado Pago (se tabela existir)

---

## 🚀 Como usar:

### Localmente (desenvolvimento):

```bash
cd C:\Users\Rafael\Desktop\ecofrontend\ecobackend888

# Certifique-se que o .env tem as variáveis:
# SUPABASE_URL=https://xxx.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=eyJ...

npm run diagnosis:subscription
```

### No Render (produção):

1. Acesse o painel do Render
2. Vá em **Shell** do seu serviço backend
3. Execute:
```bash
npm run diagnosis:subscription
```

---

## 📊 Exemplo de saída:

```
================================================================================
🔍 DIAGNÓSTICO DE ASSINATURAS - ECO
================================================================================

Conectando ao Supabase...
URL: https://xxxxx.supabase.co

📊 Tentativas de Checkout
--------------------------------------------------------------------------------
✅ 3 tentativas de checkout encontradas

📋 Detalhes:
   05/02/2026 17:30:00 | Plano: monthly | User: a1b2c3d4...
      → Provider ID: preapproval_123456
   05/02/2026 16:15:00 | Plano: annual | User: e5f6g7h8...

📊 Eventos de Assinatura (subscription_events)
--------------------------------------------------------------------------------
✅ 12 eventos encontrados

📈 Resumo por tipo de evento:
   checkout_initiated                  3x
   payment_approved                    2x
   trial_started                       1x

📊 Pagamentos (payments)
--------------------------------------------------------------------------------
✅ 2 pagamentos encontrados

📊 Resumo por status:
   approved        1x
   pending         1x

💰 Total aprovado: R$ 29.90

📊 Usuários com Assinatura (usuarios)
--------------------------------------------------------------------------------
✅ 5 usuários com assinatura encontrados

📊 Resumo de Assinaturas:
   Ativos:          3
   Em Trial:        1
   Cancelados:      1
   Expirados:       0
   Mensais:         2
   Anuais:          1

================================================================================
✅ DIAGNÓSTICO CONCLUÍDO
================================================================================

💡 Dicas:
   • Se não há checkouts, o frontend pode não estar chamando a API
   • Se não há pagamentos, o MercadoPago pode não estar enviando webhooks
   • Verifique as credenciais do MercadoPago no .env do Render
   • Teste manualmente: POST /api/subscription/create-preference
```

---

## 🛠️ Interpretando os resultados:

### ✅ Tudo funcionando:
- Há tentativas de checkout
- Há pagamentos aprovados
- Há usuários com assinatura ativa

### ⚠️ Problema: Nenhuma tentativa de checkout
**Causa:** Frontend não está chamando a API
**Solução:**
1. Verifique se o modal de assinatura aparece
2. Abra o console do navegador e procure por erros
3. Teste manualmente: `POST /api/subscription/create-preference`

### ⚠️ Problema: Checkouts mas sem pagamentos
**Causa:** Webhooks do MercadoPago não estão chegando
**Solução:**
1. Verifique se o webhook está configurado no painel do MP
2. URL deve ser: `https://ecobackend888.onrender.com/api/webhooks/mercadopago`
3. Teste enviando um webhook manualmente

### ⚠️ Problema: Pagamentos mas usuários sem acesso
**Causa:** Webhook não está atualizando o banco corretamente
**Solução:**
1. Verifique logs do Render para erros no webhook
2. Verifique se a função `activateSubscription()` está funcionando

---

## 🔧 Troubleshooting:

### Erro: "SUPABASE_URL is required"
- Certifique-se que o `.env` tem as variáveis configuradas
- No Render, configure em **Environment** → **Environment Variables**

### Erro: "relation 'subscription_events' does not exist"
- Execute as migrations do Supabase
- Arquivo: `supabase/migrations/20260122_create_subscription_tables.sql`

### Script não mostra nada
- Isso é normal se ainda não houve nenhuma tentativa de assinatura
- Teste criando uma assinatura manualmente

---

## 📞 Suporte:

Se o diagnóstico mostrar problemas, você pode:

1. **Verificar logs do Render:**
   - Painel → Logs → Filtrar por "webhook" ou "subscription"

2. **Verificar no Mercado Pago:**
   - https://www.mercadopago.com.br/developers/panel/app
   - Atividade → Pagamentos

3. **Verificar no Supabase:**
   - https://supabase.com/dashboard
   - Table Editor → `subscription_events`, `payments`, `usuarios`

---

**Criado em:** 2026-02-05
**Versão:** 1.0
