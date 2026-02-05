/**
 * Script de Diagnóstico de Assinaturas
 *
 * Verifica tentativas de assinatura, pagamentos e status de usuários
 *
 * Uso:
 *   npm run diagnosis:subscription
 *
 * Ou diretamente:
 *   ts-node server/scripts/diagnosisSubscription.ts
 */

import { createClient } from "@supabase/supabase-js";

// Configuração do Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Cores para console
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function header(text: string) {
  console.log(`\n${colors.bright}${colors.blue}${"=".repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${text}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${"=".repeat(80)}${colors.reset}\n`);
}

function section(text: string) {
  console.log(`\n${colors.bright}${colors.cyan}📊 ${text}${colors.reset}`);
  console.log(`${colors.cyan}${"-".repeat(80)}${colors.reset}`);
}

function success(text: string) {
  console.log(`${colors.green}✅ ${text}${colors.reset}`);
}

function warning(text: string) {
  console.log(`${colors.yellow}⚠️  ${text}${colors.reset}`);
}

function error(text: string) {
  console.log(`${colors.red}❌ ${text}${colors.reset}`);
}

function info(text: string) {
  console.log(`${colors.blue}ℹ️  ${text}${colors.reset}`);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleString("pt-BR");
}

async function checkSubscriptionEvents() {
  section("Eventos de Assinatura (subscription_events)");

  const { data, error } = await supabase
    .from("subscription_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    error(`Erro ao buscar eventos: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    warning("Nenhum evento de assinatura encontrado");
    return;
  }

  success(`${data.length} eventos encontrados\n`);

  // Agrupar por tipo de evento
  const eventsByType: Record<string, number> = {};
  data.forEach((event: any) => {
    eventsByType[event.event_type] = (eventsByType[event.event_type] || 0) + 1;
  });

  console.log("📈 Resumo por tipo de evento:");
  Object.entries(eventsByType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`   ${colors.magenta}${type.padEnd(35)}${colors.reset} ${colors.bright}${count}x${colors.reset}`);
    });

  console.log("\n📋 Últimos 10 eventos:");
  data.slice(0, 10).forEach((event: any) => {
    console.log(`   ${formatDate(event.created_at)} | ${colors.cyan}${event.event_type.padEnd(25)}${colors.reset} | User: ${event.user_id.substring(0, 8)}...`);
  });
}

async function checkPayments() {
  section("Pagamentos (payments)");

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    error(`Erro ao buscar pagamentos: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    warning("Nenhum pagamento encontrado");
    return;
  }

  success(`${data.length} pagamentos encontrados\n`);

  // Agrupar por status
  const paymentsByStatus: Record<string, number> = {};
  let totalAmount = 0;

  data.forEach((payment: any) => {
    paymentsByStatus[payment.status] = (paymentsByStatus[payment.status] || 0) + 1;
    if (payment.status === "approved") {
      totalAmount += payment.amount || 0;
    }
  });

  console.log("📊 Resumo por status:");
  Object.entries(paymentsByStatus)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      const color = status === "approved" ? colors.green : status === "rejected" ? colors.red : colors.yellow;
      console.log(`   ${color}${status.padEnd(15)}${colors.reset} ${colors.bright}${count}x${colors.reset}`);
    });

  console.log(`\n💰 Total aprovado: ${colors.green}R$ ${totalAmount.toFixed(2)}${colors.reset}`);

  console.log("\n📋 Últimos 10 pagamentos:");
  data.slice(0, 10).forEach((payment: any) => {
    const statusColor = payment.status === "approved" ? colors.green : payment.status === "rejected" ? colors.red : colors.yellow;
    console.log(
      `   ${formatDate(payment.created_at)} | ${statusColor}${payment.status.padEnd(10)}${colors.reset} | R$ ${payment.amount?.toFixed(2) || "0.00"} | ${payment.plan} | User: ${payment.user_id.substring(0, 8)}...`
    );
  });
}

async function checkUsers() {
  section("Usuários com Assinatura (usuarios)");

  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .or("plan_type.not.is.null,subscription_status.neq.pending")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    error(`Erro ao buscar usuários: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    warning("Nenhum usuário com assinatura encontrado");
    return;
  }

  success(`${data.length} usuários com assinatura encontrados\n`);

  // Estatísticas
  let activeCount = 0;
  let trialCount = 0;
  let cancelledCount = 0;
  let expiredCount = 0;
  let monthlyCount = 0;
  let annualCount = 0;

  const now = new Date();

  data.forEach((user: any) => {
    if (user.subscription_status === "active") activeCount++;
    if (user.subscription_status === "cancelled") cancelledCount++;
    if (user.subscription_status === "expired") expiredCount++;

    const accessUntil = user.access_until ? new Date(user.access_until) : null;
    const trialEndDate = user.trial_end_date ? new Date(user.trial_end_date) : null;

    if (trialEndDate && trialEndDate > now) trialCount++;
    if (user.plan_type === "monthly") monthlyCount++;
    if (user.plan_type === "annual") annualCount++;
  });

  console.log("📊 Resumo de Assinaturas:");
  console.log(`   ${colors.green}Ativos:${colors.reset}          ${activeCount}`);
  console.log(`   ${colors.cyan}Em Trial:${colors.reset}        ${trialCount}`);
  console.log(`   ${colors.yellow}Cancelados:${colors.reset}      ${cancelledCount}`);
  console.log(`   ${colors.red}Expirados:${colors.reset}       ${expiredCount}`);
  console.log(`   ${colors.blue}Mensais:${colors.reset}         ${monthlyCount}`);
  console.log(`   ${colors.magenta}Anuais:${colors.reset}          ${annualCount}`);

  console.log("\n📋 Usuários (primeiros 15):");
  data.slice(0, 15).forEach((user: any) => {
    const statusColor =
      user.subscription_status === "active"
        ? colors.green
        : user.subscription_status === "cancelled"
        ? colors.yellow
        : colors.red;

    const planDisplay = user.plan_type ? `${user.plan_type}` : "N/A";
    const accessUntil = user.access_until ? formatDate(user.access_until) : "N/A";

    console.log(
      `   ${user.id.substring(0, 8)}... | ${statusColor}${user.subscription_status.padEnd(10)}${colors.reset} | ${planDisplay.padEnd(8)} | Acesso até: ${accessUntil}`
    );
  });
}

async function checkCheckoutAttempts() {
  section("Tentativas de Checkout");

  const { data, error } = await supabase
    .from("subscription_events")
    .select("*")
    .eq("event_type", "checkout_initiated")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    error(`Erro ao buscar tentativas de checkout: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    warning("Nenhuma tentativa de checkout encontrada");
    info("Isso significa que nenhum usuário clicou em 'Assinar' ainda");
    return;
  }

  success(`${data.length} tentativas de checkout encontradas\n`);

  console.log("📋 Detalhes:");
  data.forEach((checkout: any) => {
    const metadata = checkout.metadata || {};
    console.log(`   ${formatDate(checkout.created_at)} | Plano: ${colors.cyan}${checkout.plan || "N/A"}${colors.reset} | User: ${checkout.user_id.substring(0, 8)}...`);
    if (metadata.provider_id) {
      console.log(`      → Provider ID: ${metadata.provider_id}`);
    }
  });
}

async function checkWebhooks() {
  section("Webhooks Recebidos (se a tabela existir)");

  // Verificar se tabela webhook_logs existe
  const { data: tables, error: tablesError } = await supabase
    .from("webhook_logs")
    .select("*")
    .limit(1);

  if (tablesError) {
    warning("Tabela 'webhook_logs' não existe (isso é normal se não foi criada)");
    return;
  }

  const { data, error } = await supabase
    .from("webhook_logs")
    .select("*")
    .order("processed_at", { ascending: false })
    .limit(20);

  if (error) {
    warning(`Tabela webhook_logs existe mas está vazia ou erro: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    warning("Nenhum webhook registrado");
    return;
  }

  success(`${data.length} webhooks encontrados\n`);

  console.log("📋 Últimos webhooks:");
  data.slice(0, 10).forEach((webhook: any) => {
    console.log(`   ${formatDate(webhook.processed_at)} | ${colors.cyan}${webhook.event_type}${colors.reset} | Source: ${webhook.source}`);
  });
}

async function main() {
  header("🔍 DIAGNÓSTICO DE ASSINATURAS - ECO");

  console.log(`${colors.bright}Conectando ao Supabase...${colors.reset}`);
  console.log(`URL: ${SUPABASE_URL}\n`);

  try {
    await checkCheckoutAttempts();
    await checkSubscriptionEvents();
    await checkPayments();
    await checkUsers();
    await checkWebhooks();

    header("✅ DIAGNÓSTICO CONCLUÍDO");

    console.log("\n💡 Dicas:");
    console.log("   • Se não há checkouts, o frontend pode não estar chamando a API");
    console.log("   • Se não há pagamentos, o MercadoPago pode não estar enviando webhooks");
    console.log("   • Verifique as credenciais do MercadoPago no .env do Render");
    console.log("   • Teste manualmente: POST /api/subscription/create-preference\n");

  } catch (err) {
    error(`Erro fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
