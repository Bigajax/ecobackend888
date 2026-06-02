/**
 * Script de Teste de Pagamentos e Assinaturas
 *
 * Testa todos os cenários de assinatura diretamente no SubscriptionService,
 * sem depender do Mercado Pago (testa a lógica de negócio pura).
 *
 * Cenários testados:
 *   1. Estado inicial → free
 *   2. Pagamento anual (R$ 149) → premium_annual, 365 dias
 *   3. Cancelamento anual → cancelled, mas mantém acesso
 *   4. Trial mensal (7 dias) → trial ativo
 *   5. Cobrança após trial → premium_monthly, 30 dias
 *   6. Cancelamento mensal → cancelled
 *   7. Reativação mensal → active
 *   8. Pagamento essentials → essentials_monthly
 *   9. Gravação de pagamento + idempotência
 *  10. Detecção de plano pelo valor (replicando lógica do webhook)
 *
 * Uso:
 *   npm run test:subscription-payments
 *   # ou
 *   ts-node --transpile-only server/scripts/testSubscriptionPayments.ts
 *
 * Variáveis de ambiente necessárias:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { SubscriptionService } from "../services/SubscriptionService";

// ── Configuração ──────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Cores ─────────────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

// ── Helpers de output ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function header(text: string) {
  console.log(`\n${c.bright}${c.blue}${"═".repeat(70)}${c.reset}`);
  console.log(`${c.bright}${c.blue}  ${text}${c.reset}`);
  console.log(`${c.bright}${c.blue}${"═".repeat(70)}${c.reset}\n`);
}

function section(text: string) {
  console.log(`\n${c.bright}${c.cyan}▶ ${text}${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
}

function ok(label: string) {
  passed++;
  console.log(`  ${c.green}✓${c.reset} ${label}`);
}

function fail(label: string, detail?: string) {
  failed++;
  const msg = detail ? `${label} — ${detail}` : label;
  failures.push(msg);
  console.log(`  ${c.red}✗${c.reset} ${c.bright}${label}${c.reset}${detail ? ` ${c.gray}(${detail})${c.reset}` : ""}`);
}

function info(text: string) {
  console.log(`  ${c.gray}→ ${text}${c.reset}`);
}

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    ok(label);
  } else {
    fail(label, detail);
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleString("pt-BR");
}

function daysFromNow(iso: string | null): number {
  if (!iso) return 0;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

// ── Lógica de detecção de plano (replica do webhook) ─────────────────────────

function detectPlanFromAmount(amount: number): "essentials" | "monthly" | "annual" {
  if (amount >= 100) return "annual";   // R$ 149
  if (amount >= 20)  return "monthly";  // R$ 29.90
  return "essentials";                  // R$ 14.90
}

// ── Setup/Teardown ────────────────────────────────────────────────────────────

async function createTestUser(): Promise<string> {
  const testEmail = `test-subscription-${Date.now()}@eco-test.local`;

  const { data, error } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: "Test1234!eco",
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Falha ao criar usuário de teste: ${error?.message}`);
  }

  info(`Usuário de teste criado: ${data.user.id.substring(0, 8)}... (${testEmail})`);
  return data.user.id;
}

async function deleteTestUser(userId: string): Promise<void> {
  // Limpar dados relacionados primeiro
  await supabase.from("subscription_events").delete().eq("user_id", userId);
  await supabase.from("payments").delete().eq("user_id", userId);
  await supabase.from("usuarios").delete().eq("id", userId);
  await supabase.auth.admin.deleteUser(userId);
  info(`Usuário de teste removido: ${userId.substring(0, 8)}...`);
}

// ── Testes ────────────────────────────────────────────────────────────────────

async function testInitialState(svc: SubscriptionService, userId: string) {
  section("1. Estado inicial (sem assinatura)");

  const status = await svc.getStatus(userId);

  info(`plan: ${status.plan} | isPremium: ${status.isPremium} | status: ${status.status}`);

  assert(status.plan === "free",          "plan deve ser 'free'");
  assert(status.isPremium === false,      "isPremium deve ser false");
  assert(status.isTrialActive === false,  "isTrialActive deve ser false");
  assert(status.accessUntil === null,     "accessUntil deve ser null");
}

async function testAnnualPayment(svc: SubscriptionService, userId: string) {
  section("2. Pagamento anual (R$ 149 → 365 dias)");

  // Simula o que o webhook faz ao receber pagamento anual aprovado
  const planDetected = detectPlanFromAmount(149);
  assert(planDetected === "annual", `Detectar plano por R$149 → annual (recebeu: ${planDetected})`);

  await svc.activateSubscription(userId, "premium_annual", 365, {
    provider: "mercadopago",
    provider_payment_id: "TEST_PAY_ANNUAL_001",
    payment_status: "approved",
    payment_method: "credit_card",
    amount: 149,
  });

  const status = await svc.getStatus(userId);
  const daysLeft = daysFromNow(status.accessUntil);

  info(`plan: ${status.plan} | isPremium: ${status.isPremium} | accessUntil: ${formatDate(status.accessUntil)} (${daysLeft} dias)`);

  assert(status.plan === "premium_annual",   "plan deve ser 'premium_annual'");
  assert(status.isPremium === true,          "isPremium deve ser true");
  assert(status.status === "active",         "status deve ser 'active'");
  assert(daysLeft >= 364 && daysLeft <= 366, `accessUntil deve ser ~365 dias (recebeu ${daysLeft})`);
  assert(status.isTrialActive === false,     "isTrialActive deve ser false (não é trial)");
}

async function testCancelAnnual(svc: SubscriptionService, userId: string) {
  section("3. Cancelar plano anual → mantém acesso até vencer");

  await svc.cancelSubscription(userId);

  const status = await svc.getStatus(userId);
  const daysLeft = daysFromNow(status.accessUntil);

  info(`status: ${status.status} | isPremium: ${status.isPremium} | accessUntil em ${daysLeft} dias`);

  assert(status.status === "cancelled",      "status deve ser 'cancelled'");
  assert(status.isPremium === true,          "isPremium deve ser true (acesso ainda válido)");
  assert(daysLeft > 300,                     `accessUntil deve ainda estar no futuro (${daysLeft} dias)`);
}

async function testMonthlyTrial(svc: SubscriptionService, userId: string) {
  section("4. Trial mensal (preapproval autorizado → 7 dias)");

  // Simula o que o webhook faz ao receber subscription_preapproval authorized
  const amount = 29.90;
  const planType = amount >= 20 ? "monthly" : "essentials";
  assert(planType === "monthly", `Detectar plano por R$${amount} → monthly (recebeu: ${planType})`);

  await svc.activateSubscription(userId, "trial", 7, {
    provider: "mercadopago",
    provider_preapproval_id: "TEST_PREAPP_001",
    payment_status: "authorized",
    plan_type: "monthly",
  });

  const status = await svc.getStatus(userId);
  const trialEnd = daysFromNow(status.trialEndDate);

  info(`plan: ${status.plan} | isTrialActive: ${status.isTrialActive} | trialDaysRemaining: ${status.trialDaysRemaining} | trialEnd: ${formatDate(status.trialEndDate)}`);

  assert(status.plan === "trial",             "plan deve ser 'trial'");
  assert(status.isPremium === true,           "isPremium deve ser true durante trial");
  assert(status.isTrialActive === true,       "isTrialActive deve ser true");
  assert(status.trialDaysRemaining !== null && status.trialDaysRemaining >= 6,
    `trialDaysRemaining deve ser ~7 (recebeu ${status.trialDaysRemaining})`);
  assert(trialEnd >= 6 && trialEnd <= 8,      `trialEndDate deve ser ~7 dias (recebeu ${trialEnd})`);
}

async function testMonthlyRecurringCharge(svc: SubscriptionService, userId: string) {
  section("5. Cobrança recorrente após trial (subscription_authorized_payment → 30 dias)");

  // Simula o que o webhook faz ao receber subscription_authorized_payment
  const planDetected = detectPlanFromAmount(29.90);
  assert(planDetected === "monthly", `Detectar plano por R$29.90 → monthly (recebeu: ${planDetected})`);

  await svc.activateSubscription(userId, "premium_monthly", 30, {
    provider: "mercadopago",
    provider_payment_id: "TEST_PAY_MONTHLY_001",
    payment_status: "approved",
    payment_method: "debit_card",
    amount: 29.90,
  });

  const status = await svc.getStatus(userId);
  const daysLeft = daysFromNow(status.accessUntil);

  info(`plan: ${status.plan} | isPremium: ${status.isPremium} | accessUntil em ${daysLeft} dias`);

  assert(status.plan === "premium_monthly",   "plan deve ser 'premium_monthly'");
  assert(status.isPremium === true,           "isPremium deve ser true");
  assert(status.status === "active",          "status deve ser 'active'");
  assert(daysLeft >= 29 && daysLeft <= 31,    `accessUntil deve ser ~30 dias (recebeu ${daysLeft})`);
  assert(status.isTrialActive === false,      "isTrialActive deve ser false após cobrança real");
}

async function testCancelMonthly(svc: SubscriptionService, userId: string) {
  section("6. Cancelar plano mensal → mantém acesso até fim do período");

  await svc.cancelSubscription(userId);

  const status = await svc.getStatus(userId);
  const daysLeft = daysFromNow(status.accessUntil);

  info(`status: ${status.status} | isPremium: ${status.isPremium} | accessUntil em ${daysLeft} dias`);

  assert(status.status === "cancelled",       "status deve ser 'cancelled'");
  assert(status.isPremium === true,           "isPremium deve ser true (acesso ainda válido)");
  assert(daysLeft >= 28,                      `accessUntil deve estar no futuro (${daysLeft} dias)`);
}

async function testReactivateMonthly(svc: SubscriptionService, userId: string) {
  section("7. Reativar plano mensal cancelado");

  // Inserir provider_preapproval_id para habilitar reativação
  await supabase
    .from("usuarios")
    .update({ provider_preapproval_id: "TEST_PREAPP_001" })
    .eq("id", userId);

  await svc.reactivateSubscription(userId);

  const status = await svc.getStatus(userId);

  info(`status: ${status.status} | isPremium: ${status.isPremium} | canReactivate: ${status.canReactivate}`);

  assert(status.status === "active",          "status deve ser 'active' após reativação");
  assert(status.isPremium === true,           "isPremium deve ser true");
}

async function testEssentials(svc: SubscriptionService, userId: string) {
  section("8. Plano Essentials (R$ 14.90 → 30 dias)");

  const planDetected = detectPlanFromAmount(14.90);
  assert(planDetected === "essentials", `Detectar plano por R$14.90 → essentials (recebeu: ${planDetected})`);

  await svc.activateSubscription(userId, "essentials_monthly", 30, {
    provider: "mercadopago",
    provider_payment_id: "TEST_PAY_ESS_001",
    payment_status: "approved",
    amount: 14.90,
  });

  const status = await svc.getStatus(userId);
  const daysLeft = daysFromNow(status.accessUntil);

  info(`plan: ${status.plan} | isPremium: ${status.isPremium} | accessUntil em ${daysLeft} dias`);

  assert(status.plan === "essentials_monthly", "plan deve ser 'essentials_monthly'");
  assert(status.isPremium === true,            "isPremium deve ser true");
  assert(daysLeft >= 29 && daysLeft <= 31,     `accessUntil deve ser ~30 dias (recebeu ${daysLeft})`);
}

async function testPaymentRecording(svc: SubscriptionService, userId: string) {
  section("9. Gravação de pagamento + idempotência");

  const paymentId = `TEST_IDEM_${Date.now()}`;

  // Primeira gravação
  await svc.recordPayment(userId, {
    provider_payment_id: paymentId,
    status: "approved",
    amount: 149,
    plan: "annual",
    payment_method: "credit_card",
  });

  const payments1 = await svc.getPayments(userId);
  const found = payments1.some((p: any) => p.provider_payment_id === paymentId);
  assert(found, "Pagamento deve ser gravado no banco");

  // Segunda gravação do mesmo ID (idempotência)
  let idempotencyOk = true;
  try {
    await svc.recordPayment(userId, {
      provider_payment_id: paymentId,
      status: "approved",
      amount: 149,
      plan: "annual",
    });
  } catch {
    idempotencyOk = false;
  }

  assert(idempotencyOk, "Duplicate payment deve ser ignorado sem erro (idempotência)");

  const payments2 = await svc.getPayments(userId);
  const duplicates = payments2.filter((p: any) => p.provider_payment_id === paymentId).length;
  assert(duplicates === 1, `Deve existir apenas 1 registro com mesmo payment_id (encontrado: ${duplicates})`);

  info(`Total de pagamentos gravados: ${payments2.length}`);
}

async function testWebhookAmountDetection() {
  section("10. Detecção de plano por valor (lógica do webhook)");

  const cases: Array<[number, string]> = [
    [149.0,  "annual"],
    [100.0,  "annual"],
    [29.90,  "monthly"],
    [20.0,   "monthly"],
    [14.90,  "essentials"],
    [9.99,   "essentials"],
  ];

  for (const [amount, expected] of cases) {
    const detected = detectPlanFromAmount(amount);
    assert(
      detected === expected,
      `R$ ${amount.toFixed(2)} → '${expected}'`,
      detected !== expected ? `recebeu '${detected}'` : undefined
    );
  }
}

async function testEventRecording(svc: SubscriptionService, userId: string) {
  section("11. Gravação de eventos de auditoria");

  await svc.recordEvent(userId, "payment_approved", { payment_id: "EVT_TEST_001", plan: "annual", amount: 149 });
  await svc.recordEvent(userId, "subscription_authorized", { preapproval_id: "PRE_TEST_001", plan: "monthly" });
  await svc.recordEvent(userId, "subscription_cancelled", { reason: "user_request" });

  const { data: events, error } = await supabase
    .from("subscription_events")
    .select("event_type")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    fail("Buscar eventos do banco", error.message);
    return;
  }

  const types = (events || []).map((e: any) => e.event_type);
  info(`Eventos gravados: ${types.join(", ")}`);

  assert(types.includes("payment_approved"),        "Evento 'payment_approved' gravado");
  assert(types.includes("subscription_authorized"), "Evento 'subscription_authorized' gravado");
  assert(types.includes("subscription_cancelled"),  "Evento 'subscription_cancelled' gravado");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  header("🧪 TESTE DE PAGAMENTOS E ASSINATURAS — ECO");

  console.log(`${c.gray}Conectando ao Supabase: ${SUPABASE_URL}${c.reset}`);

  let userId: string | null = null;

  try {
    // Criar usuário de teste isolado
    section("Setup — criando usuário de teste");
    userId = await createTestUser();

    // Instanciar o SubscriptionService com o cliente admin
    const svc = new SubscriptionService(supabase as any);

    // ── Rodar todos os cenários ──────────────────────────────────────────────
    await testInitialState(svc, userId);
    await testAnnualPayment(svc, userId);
    await testCancelAnnual(svc, userId);
    await testMonthlyTrial(svc, userId);
    await testMonthlyRecurringCharge(svc, userId);
    await testCancelMonthly(svc, userId);
    await testReactivateMonthly(svc, userId);
    await testEssentials(svc, userId);
    await testPaymentRecording(svc, userId);
    await testWebhookAmountDetection();
    await testEventRecording(svc, userId);

  } catch (err) {
    const detail = err instanceof Error
      ? err.message
      : typeof err === "object"
        ? JSON.stringify(err)
        : String(err);
    fail("ERRO FATAL", detail);
    console.error("  Detalhes completos do erro:", err);
  } finally {
    // Cleanup — remover usuário de teste
    if (userId) {
      section("Cleanup — removendo usuário de teste");
      try {
        await deleteTestUser(userId);
        ok("Usuário de teste removido");
      } catch (e) {
        fail("Cleanup", `Não foi possível remover usuário: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // ── Resultado final ────────────────────────────────────────────────────────

  header("📊 RESULTADO FINAL");

  const total = passed + failed;
  console.log(`  Total de testes: ${c.bright}${total}${c.reset}`);
  console.log(`  ${c.green}Passou: ${passed}${c.reset}`);
  console.log(`  ${c.red}Falhou: ${failed}${c.reset}`);

  if (failures.length > 0) {
    console.log(`\n${c.red}${c.bright}Falhas:${c.reset}`);
    failures.forEach((f) => console.log(`  ${c.red}✗ ${f}${c.reset}`));
    console.log();
    process.exit(1);
  } else {
    console.log(`\n  ${c.green}${c.bright}✅ Todos os testes passaram!${c.reset}`);
    console.log(`\n  ${c.gray}Os fluxos de pagamento e assinatura estão funcionando corretamente.${c.reset}\n`);
    process.exit(0);
  }
}

main();
