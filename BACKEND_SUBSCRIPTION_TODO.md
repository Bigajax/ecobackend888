# Backend Subscription TODO - Implementação Necessária

## 🔴 CRÍTICO - Endpoints que DEVEM ser implementados

### 1. POST `/api/subscription/create-preference`

**Descrição:** Cria uma preference/preapproval no Mercado Pago e retorna o link de checkout.

**Request Body:**
```json
{
  "plan": "monthly" | "annual"
}
```

**Response (Success - 200):**
```json
{
  "initPoint": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=xxxxx",
  "id": "preapproval_id_ou_preference_id",
  "type": "preapproval" | "preference"
}
```

**Lógica Interna:**
1. Extrair `userId` do token de autenticação (Supabase JWT)
2. Verificar se usuário já tem assinatura ativa
3. Se `plan === 'monthly'`:
   - Criar Preapproval no Mercado Pago (assinatura recorrente)
   - Definir `auto_recurring.frequency = 1`, `frequency_type = 'months'`
   - Definir `free_trial` com 7 dias (`frequency = 7`, `frequency_type = 'days'`)
   - URL de retorno: `https://ecotopia.com/app/subscription/callback?plan=monthly&user_id={user_id}`
4. Se `plan === 'annual'`:
   - Criar Preference no Mercado Pago (pagamento único)
   - Definir `items[0].unit_price = 299.00`
   - Definir `items[0].title = "ECO Premium - Plano Anual"`
   - URL de retorno: `https://ecotopia.com/app/subscription/callback?plan=annual&user_id={user_id}`
5. Salvar metadata no banco (opcional):
   - Criar registro em `subscription_events` com tipo `checkout_initiated`
6. Retornar `initPoint` para o frontend redirecionar

**Mercado Pago SDK (Node.js):**
```javascript
import { MercadoPagoConfig, Preference, PreApproval } from 'mercadopago';

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

// Plano Mensal (Recorrência)
const preapproval = new PreApproval(client);
const result = await preapproval.create({
  body: {
    reason: 'ECO Premium - Plano Mensal',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 29.90,
      currency_id: 'BRL',
      free_trial: {
        frequency: 7,
        frequency_type: 'days'
      }
    },
    back_url: `${process.env.APP_URL}/app/subscription/callback`,
    external_reference: userId, // ID do usuário
    payer_email: user.email
  }
});

// Plano Anual (Pagamento único)
const preference = new Preference(client);
const result = await preference.create({
  body: {
    items: [
      {
        title: 'ECO Premium - Plano Anual',
        quantity: 1,
        unit_price: 299.00,
        currency_id: 'BRL'
      }
    ],
    back_urls: {
      success: `${process.env.APP_URL}/app/subscription/callback`,
      failure: `${process.env.APP_URL}/app/subscription/callback`,
      pending: `${process.env.APP_URL}/app/subscription/callback`
    },
    auto_return: 'approved',
    external_reference: userId,
    payer: {
      email: user.email
    }
  }
});
```

---

### 2. GET `/api/subscription/status`

**Descrição:** Retorna o status atual da assinatura do usuário autenticado.

**Headers Requeridos:**
```
Authorization: Bearer <supabase_jwt_token>
```

**Response (Success - 200):**
```json
{
  "plan": "free" | "trial" | "premium_monthly" | "premium_annual",
  "status": "active" | "expired" | "cancelled" | "pending",
  "trialStartDate": "2026-01-09T00:00:00Z" | null,
  "trialEndDate": "2026-01-16T23:59:59Z" | null,
  "accessUntil": "2026-02-09T23:59:59Z" | null,
  "currentPeriodEnd": "2026-02-09T23:59:59Z" | null,
  "planType": "monthly" | "annual" | null,
  "trialDaysRemaining": 7,
  "isPremium": true,
  "isTrialActive": true
}
```

**Lógica Interna:**
1. Extrair `userId` do JWT
2. Buscar registro do usuário na tabela `usuarios`:
   ```sql
   SELECT
     trial_start_date,
     trial_end_date,
     access_until,
     current_period_end,
     plan_type,
     subscription_status,
     provider_preapproval_id,
     provider_payment_id
   FROM usuarios
   WHERE id = $1
   ```
3. Calcular `plan` baseado em:
   - Se `access_until IS NULL OR access_until < NOW()` → `plan = 'free'`
   - Se `trial_end_date > NOW() AND subscription_status = 'active'` → `plan = 'trial'`
   - Se `plan_type = 'monthly' AND access_until > NOW()` → `plan = 'premium_monthly'`
   - Se `plan_type = 'annual' AND access_until > NOW()` → `plan = 'premium_annual'`
4. Calcular `trialDaysRemaining`:
   ```javascript
   const now = new Date();
   const endDate = new Date(user.trial_end_date);
   const diffMs = endDate - now;
   const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
   return Math.max(0, diffDays);
   ```
5. Retornar objeto completo

**CACHE:** Recomendado cachear resposta por 60 segundos (no backend ou Redis).

---

### 3. POST `/api/subscription/cancel`

**Descrição:** Cancela a assinatura do usuário (mas mantém acesso até o fim do período pago).

**Request Body:**
```json
{
  "reason": "Muito caro" // Opcional
}
```

**Response (Success - 200):**
```json
{
  "message": "Assinatura cancelada com sucesso. Você manterá acesso até 09/02/2026."
}
```

**Lógica Interna:**
1. Extrair `userId` do JWT
2. Buscar `provider_preapproval_id` do usuário
3. Se `provider_preapproval_id` existe (plano mensal):
   - Cancelar preapproval no Mercado Pago:
     ```javascript
     const preapproval = new PreApproval(client);
     await preapproval.update({
       id: user.provider_preapproval_id,
       body: { status: 'cancelled' }
     });
     ```
4. Atualizar banco de dados:
   ```sql
   UPDATE usuarios
   SET subscription_status = 'cancelled'
   WHERE id = $1;
   ```
5. Registrar evento:
   ```sql
   INSERT INTO subscription_events (user_id, event_type, plan, metadata)
   VALUES ($1, 'subscription_cancelled', $2, $3);
   ```
6. **NÃO alterar `access_until`** - usuário mantém acesso até fim do período
7. Retornar mensagem de confirmação

---

### 4. POST `/api/subscription/reactivate`

**Descrição:** Reativa assinatura cancelada (apenas para mensais com preapproval ativo).

**Response (Success - 200):**
```json
{
  "plan": "premium_monthly",
  "status": "active",
  ...
}
```

**Lógica Interna:**
1. Verificar se `subscription_status = 'cancelled'`
2. Se plano mensal com preapproval:
   - Tentar reativar no Mercado Pago
3. Se plano anual:
   - Retornar erro: "Planos anuais não podem ser reativados. Por favor, faça uma nova assinatura."
4. Atualizar banco:
   ```sql
   UPDATE usuarios
   SET subscription_status = 'active'
   WHERE id = $1;
   ```
5. Retornar status atualizado (chamar GET /status internamente)

---

### 5. GET `/api/subscription/invoices`

**Descrição:** Retorna histórico de pagamentos do usuário.

**Response (Success - 200):**
```json
{
  "payments": [
    {
      "id": "uuid",
      "date": "2026-01-09T10:30:00Z",
      "amount": 29.90,
      "status": "approved",
      "plan": "monthly",
      "paymentMethod": "Cartão de crédito Visa ****1234",
      "receiptUrl": "https://www.mercadopago.com/receipt/xxxxx"
    }
  ]
}
```

**Lógica Interna:**
1. Buscar na tabela `payments`:
   ```sql
   SELECT * FROM payments
   WHERE user_id = $1
   ORDER BY created_at DESC
   LIMIT 50;
   ```
2. Formatar resposta
3. Opcional: Buscar dados em tempo real do Mercado Pago para status atualizado

---

### 6. POST `/api/subscription/validate-coupon`

**Descrição:** Valida cupom de desconto (se você for implementar cupons).

**Request Body:**
```json
{
  "couponCode": "WELCOME10"
}
```

**Response (Success - 200):**
```json
{
  "valid": true,
  "discount": 10,
  "message": "Cupom válido! 10% de desconto."
}
```

**Lógica Interna:**
1. Buscar cupom na tabela `coupons` (você precisará criar essa tabela)
2. Verificar:
   - Se cupom existe
   - Se não expirou
   - Se usuário já usou (se cupom for único)
3. Retornar validação

**NOTA:** Esta funcionalidade é OPCIONAL. Você pode implementar depois.

---

## 🔴 CRÍTICO - Webhooks do Mercado Pago

### POST `/api/webhooks/mercadopago`

**Descrição:** Recebe notificações do Mercado Pago sobre pagamentos e atualizações de assinatura.

**IMPORTANTE:**
- Esta rota deve ser **pública** (sem autenticação)
- Deve validar assinatura do Mercado Pago
- **NUNCA confiar em parâmetros da URL de retorno do usuário**

**Request Body (Mercado Pago envia):**
```json
{
  "id": 123456789,
  "live_mode": true,
  "type": "payment" | "subscription_preapproval",
  "date_created": "2026-01-09T10:30:00Z",
  "application_id": 123456,
  "user_id": 987654,
  "data": {
    "id": "payment_id_ou_preapproval_id"
  }
}
```

**Lógica Interna (CRÍTICA):**

1. **Validar request** (segurança):
   ```javascript
   // Verificar header x-signature do Mercado Pago
   const signature = req.headers['x-signature'];
   const isValid = validateMercadoPagoSignature(signature, req.body);
   if (!isValid) {
     return res.status(401).json({ error: 'Invalid signature' });
   }
   ```

2. **Processar evento:**

   ```javascript
   if (req.body.type === 'payment') {
     // Pagamento pontual (plano anual)
     const paymentId = req.body.data.id;

     // Buscar detalhes do pagamento no MP
     const payment = await mercadopago.payment.get(paymentId);

     // Extrair external_reference (userId)
     const userId = payment.external_reference;

     if (payment.status === 'approved') {
       // Ativar assinatura anual
       const accessUntil = new Date();
       accessUntil.setFullYear(accessUntil.getFullYear() + 1); // +1 ano

       await db.query(`
         UPDATE usuarios
         SET
           plan_type = 'annual',
           subscription_status = 'active',
           provider = 'mercadopago',
           provider_payment_id = $1,
           current_period_end = $2,
           access_until = $2,
           trial_start_date = NULL,
           trial_end_date = NULL
         WHERE id = $3
       `, [paymentId, accessUntil.toISOString(), userId]);

       // Registrar evento
       await db.query(`
         INSERT INTO subscription_events (user_id, event_type, plan, provider_id, metadata)
         VALUES ($1, 'payment_approved', 'annual', $2, $3)
       `, [userId, paymentId, JSON.stringify(payment)]);

       // Salvar histórico
       await db.query(`
         INSERT INTO payments (user_id, provider, provider_payment_id, status, amount, plan, raw_payload)
         VALUES ($1, 'mercadopago', $2, 'approved', $3, 'annual', $4)
       `, [userId, paymentId, payment.transaction_amount, JSON.stringify(payment)]);
     }
   }

   if (req.body.type === 'subscription_preapproval') {
     // Assinatura recorrente (plano mensal)
     const preapprovalId = req.body.data.id;

     // Buscar detalhes do preapproval no MP
     const preapproval = await mercadopago.preapproval.get(preapprovalId);

     const userId = preapproval.external_reference;

     if (preapproval.status === 'authorized') {
       // Trial iniciado ou renovação mensal
       const now = new Date();

       // Se é primeira vez (trial)
       if (!preapproval.summarize?.charged_quantity) {
         // Ativar trial de 7 dias
         const trialEndDate = new Date(now);
         trialEndDate.setDate(trialEndDate.getDate() + 7);

         await db.query(`
           UPDATE usuarios
           SET
             plan_type = 'monthly',
             subscription_status = 'active',
             provider = 'mercadopago',
             provider_preapproval_id = $1,
             trial_start_date = $2,
             trial_end_date = $3,
             access_until = $3,
             current_period_end = $3
           WHERE id = $4
         `, [preapprovalId, now.toISOString(), trialEndDate.toISOString(), userId]);

         await db.query(`
           INSERT INTO subscription_events (user_id, event_type, plan, provider_id)
           VALUES ($1, 'trial_started', 'monthly', $2)
         `, [userId, preapprovalId]);
       } else {
         // Renovação mensal (após trial)
         const nextBillingDate = new Date(preapproval.next_payment_date);

         await db.query(`
           UPDATE usuarios
           SET
             subscription_status = 'active',
             current_period_end = $1,
             access_until = $1,
             trial_start_date = NULL,
             trial_end_date = NULL
           WHERE id = $2
         `, [nextBillingDate.toISOString(), userId]);

         await db.query(`
           INSERT INTO subscription_events (user_id, event_type, plan, provider_id)
           VALUES ($1, 'subscription_renewed', 'monthly', $2)
         `, [userId, preapprovalId]);
       }
     }

     if (preapproval.status === 'cancelled') {
       await db.query(`
         UPDATE usuarios
         SET subscription_status = 'cancelled'
         WHERE id = $1
       `, [userId]);
     }
   }
   ```

3. **Retornar 200 OK** (SEMPRE, mesmo com erro):
   ```javascript
   res.status(200).json({ received: true });
   ```

**Configurar Webhook no Mercado Pago:**
1. Ir em: https://www.mercadopago.com.br/developers/panel/app
2. Sua aplicação > Webhooks
3. Adicionar URL: `https://ecobackend888.onrender.com/api/webhooks/mercadopago`
4. Selecionar eventos:
   - `payment` (pagamentos pontuais)
   - `subscription_preapproval` (assinaturas recorrentes)

---

## 🟡 RECOMENDADO - Funcionalidades Adicionais

### Idempotência (Prevenir duplicação)

```javascript
// Antes de processar pagamento, verificar se já foi processado
const existingPayment = await db.query(`
  SELECT * FROM payments
  WHERE provider_payment_id = $1
`, [paymentId]);

if (existingPayment.rows.length > 0) {
  console.log('Payment already processed, skipping...');
  return res.status(200).json({ received: true });
}
```

### Logs Detalhados

```javascript
// Registrar todos os webhooks recebidos (para debug)
await db.query(`
  INSERT INTO webhook_logs (source, event_type, payload, processed_at)
  VALUES ('mercadopago', $1, $2, NOW())
`, [req.body.type, JSON.stringify(req.body)]);
```

### Email de Confirmação

```javascript
// Após ativar assinatura, enviar email
if (payment.status === 'approved') {
  await sendEmail({
    to: user.email,
    subject: 'Bem-vindo ao ECO Premium! 🎉',
    template: 'subscription-activated',
    data: { userName: user.name, plan: 'anual' }
  });
}
```

---

## 📝 Variáveis de Ambiente Necessárias (Backend)

```env
# Mercado Pago
MP_ACCESS_TOKEN=APP_USR-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MP_PUBLIC_KEY=APP_USR-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# App URLs
APP_URL=https://ecotopia.com
BACKEND_URL=https://ecobackend888.onrender.com

# Supabase (para autenticação)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxxx

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
```

---

## ✅ Checklist de Implementação

- [ ] Instalar SDK do Mercado Pago: `npm install mercadopago`
- [ ] Criar conta no Mercado Pago e obter credenciais
- [ ] Implementar endpoint `POST /api/subscription/create-preference`
- [ ] Implementar endpoint `GET /api/subscription/status`
- [ ] Implementar endpoint `POST /api/subscription/cancel`
- [ ] Implementar endpoint `POST /api/subscription/reactivate`
- [ ] Implementar endpoint `GET /api/subscription/invoices`
- [ ] Implementar webhook `POST /api/webhooks/mercadopago`
- [ ] Configurar webhook no painel do Mercado Pago
- [ ] Testar fluxo completo:
  - [ ] Criar assinatura mensal (com trial)
  - [ ] Criar assinatura anual
  - [ ] Cancelar assinatura
  - [ ] Webhook de pagamento aprovado
  - [ ] Webhook de trial iniciado
  - [ ] Webhook de renovação mensal
- [ ] Validar segurança (assinatura do webhook)
- [ ] Implementar logs e monitoring

---

## 📚 Recursos Úteis

- [Mercado Pago - Documentação Oficial](https://www.mercadopago.com.br/developers)
- [SDK Node.js do Mercado Pago](https://github.com/mercadopago/sdk-nodejs)
- [Webhooks - Guia Completo](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks)
- [Preapprovals (Assinaturas)](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscriptions-creation)

---

**Última atualização:** 2026-01-09
