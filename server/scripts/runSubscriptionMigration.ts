/**
 * Script de diagnóstico e aplicação da migration de subscriptions
 *
 * Uso:
 *   npx ts-node --transpile-only server/scripts/runSubscriptionMigration.ts
 */

import { exec } from "child_process";
import { createClient } from "@supabase/supabase-js";
import * as path from "path";
import * as dotenv from "dotenv";

// Try both possible .env locations
dotenv.config({ path: path.resolve(__dirname, "../../server/.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PROJECT_REF = "cejiylmomlxnscknustp";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários no .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function tableExists(name: string): Promise<boolean> {
  const { error } = await supabase.from(name as any).select("*").limit(0);
  if (!error) return true;
  if (error.message?.includes("does not exist") || error.code === "42P01") return false;
  return true; // outros erros = tabela existe mas RLS bloqueou, etc.
}

async function columnExists(table: string, column: string): Promise<boolean> {
  // Tenta selecionar a coluna específica com LIMIT 0
  const query = `${table}?select=${column}&limit=0`;
  const { error } = await supabase.from(table as any).select(column).limit(0);
  if (!error) return true;
  if (error.message?.includes(column) && error.message?.includes("does not exist")) return false;
  return true;
}

async function main() {
  console.log("\n====================================================");
  console.log("  🔍 DIAGNÓSTICO - MIGRATION SUBSCRIPTIONS");
  console.log("====================================================\n");

  // Verificar o que existe
  const status = {
    usuarios: await tableExists("usuarios"),
    payments: await tableExists("payments"),
    subscription_events: await tableExists("subscription_events"),
    webhook_logs: await tableExists("webhook_logs"),
    usuarios_access_until: false,
    usuarios_trial_end_date: false,
    usuarios_plan_type: false,
  };

  if (status.usuarios) {
    status.usuarios_access_until = await columnExists("usuarios", "access_until");
    status.usuarios_trial_end_date = await columnExists("usuarios", "trial_end_date");
    status.usuarios_plan_type = await columnExists("usuarios", "plan_type");
  }

  console.log("📋 Estado atual do banco:\n");
  console.log(`  ${status.usuarios ? "✅" : "❌"} tabela usuarios`);
  if (status.usuarios) {
    console.log(`  ${status.usuarios_access_until ? "  ✅" : "  ❌"} usuarios.access_until`);
    console.log(`  ${status.usuarios_trial_end_date ? "  ✅" : "  ❌"} usuarios.trial_end_date`);
    console.log(`  ${status.usuarios_plan_type ? "  ✅" : "  ❌"} usuarios.plan_type`);
  }
  console.log(`  ${status.payments ? "✅" : "❌"} tabela payments`);
  console.log(`  ${status.subscription_events ? "✅" : "❌"} tabela subscription_events`);
  console.log(`  ${status.webhook_logs ? "✅" : "❌"} tabela webhook_logs`);

  // Gerar SQL baseado no diagnóstico
  const sqlParts: string[] = [];

  // 1. Colunas faltantes em usuarios
  if (status.usuarios && (!status.usuarios_access_until || !status.usuarios_trial_end_date || !status.usuarios_plan_type)) {
    sqlParts.push(`-- ============================================================
-- 1. Adicionar colunas de subscription em usuarios
-- ============================================================
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS plan_type TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_usuarios_subscription_status ON public.usuarios(subscription_status);
CREATE INDEX IF NOT EXISTS idx_usuarios_access_until ON public.usuarios(access_until);
CREATE INDEX IF NOT EXISTS idx_usuarios_provider_preapproval_id ON public.usuarios(provider_preapproval_id) WHERE provider_preapproval_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_provider_payment_id ON public.usuarios(provider_payment_id) WHERE provider_payment_id IS NOT NULL;

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_own" ON public.usuarios;
CREATE POLICY "usuarios_select_own" ON public.usuarios
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "usuarios_service_role_all" ON public.usuarios;
CREATE POLICY "usuarios_service_role_all" ON public.usuarios
  FOR ALL USING (auth.role() = 'service_role');
`);
  }

  // 2. Criar tabela payments se não existe
  if (!status.payments) {
    sqlParts.push(`-- ============================================================
-- 2. Criar tabela payments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  provider_payment_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('approved', 'pending', 'rejected', 'refunded', 'cancelled')),
  amount DECIMAL(10, 2) NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'annual', 'essentials')),
  payment_method TEXT,
  receipt_url TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON public.payments(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at_desc ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "payments_service_role_all" ON public.payments;
CREATE POLICY "payments_service_role_all" ON public.payments
  FOR ALL USING (auth.role() = 'service_role');
`);
  }

  // 3. Criar subscription_events se não existe (ou corrigir constraints)
  if (!status.subscription_events) {
    sqlParts.push(`-- ============================================================
-- 3. Criar tabela subscription_events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'checkout_initiated', 'trial_started', 'subscription_renewed',
    'payment_approved', 'payment_failed', 'payment_rejected', 'payment_pending',
    'subscription_cancelled', 'subscription_reactivated', 'subscription_expired',
    'subscription_authorized', 'subscription_cancelled_by_provider'
  )),
  plan TEXT CHECK (plan IN ('monthly', 'annual', 'essentials')),
  provider_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON public.subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON public.subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at_desc ON public.subscription_events(created_at DESC);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_events_select_own" ON public.subscription_events;
CREATE POLICY "subscription_events_select_own" ON public.subscription_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "subscription_events_service_role_all" ON public.subscription_events;
CREATE POLICY "subscription_events_service_role_all" ON public.subscription_events
  FOR ALL USING (auth.role() = 'service_role');
`);
  } else {
    // Corrigir constraints da tabela existente
    sqlParts.push(`-- ============================================================
-- 3. Corrigir constraints em subscription_events (já existe)
-- ============================================================
ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;

ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_event_type_check
  CHECK (event_type IN (
    'checkout_initiated', 'trial_started', 'subscription_renewed',
    'payment_approved', 'payment_failed', 'payment_rejected', 'payment_pending',
    'subscription_cancelled', 'subscription_reactivated', 'subscription_expired',
    'subscription_authorized', 'subscription_cancelled_by_provider'
  ));

ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_plan_check;

ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_plan_check
  CHECK (plan IN ('monthly', 'annual', 'essentials'));
`);
  }

  // 4. Criar webhook_logs se não existe
  if (!status.webhook_logs) {
    sqlParts.push(`-- ============================================================
-- 4. Criar tabela webhook_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'mercadopago',
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT webhook_logs_unique_event UNIQUE (source, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_id ON public.webhook_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON public.webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at_desc ON public.webhook_logs(received_at DESC);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_logs_service_role_all" ON public.webhook_logs;
CREATE POLICY "webhook_logs_service_role_all" ON public.webhook_logs
  FOR ALL USING (auth.role() = 'service_role');
`);
  }

  // 5. Trigger para updated_at
  sqlParts.push(`-- ============================================================
-- 5. Trigger para auto-update de updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_usuarios_updated_at ON public.usuarios;
CREATE TRIGGER update_usuarios_updated_at
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`);

  // 6. Verificação final
  sqlParts.push(`-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================
SELECT table_name, 'ok' as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('usuarios', 'payments', 'subscription_events', 'webhook_logs')
ORDER BY table_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'usuarios'
  AND column_name IN ('plan_type', 'subscription_status', 'access_until', 'trial_end_date')
ORDER BY column_name;

SELECT 'Migration concluída com sucesso! ✅' as resultado;
`);

  const finalSQL = sqlParts.join("\n");

  // Copiar para clipboard
  copyToClipboard(finalSQL);

  // Abrir Supabase SQL Editor
  const dashboardUrl = `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`;
  openBrowser(dashboardUrl);

  console.log("\n====================================================");
  console.log("  ✅ SQL GERADO E COPIADO PARA CLIPBOARD");
  console.log("====================================================\n");
  console.log(`🌐 Supabase SQL Editor abrindo...`);
  console.log(`   ${dashboardUrl}\n`);
  console.log(`📋 SQL copiado para clipboard (Ctrl+V para colar)\n`);
  console.log("📄 SQL a executar:\n");
  console.log("─".repeat(60));
  console.log(finalSQL);
  console.log("─".repeat(60));
  console.log("\n✅ Cole o SQL no editor e clique em Run\n");
}

function copyToClipboard(text: string) {
  // Escreve em arquivo temp e usa PowerShell para ler
  const tmpFile = path.resolve(__dirname, "../../.migration_sql_tmp.sql");
  require("fs").writeFileSync(tmpFile, text, "utf-8");
  exec(`powershell -command "Get-Content '${tmpFile}' -Raw | Set-Clipboard"`, (err) => {
    if (err) {
      exec(`type "${tmpFile}" | clip`, () => {});
    }
    // Cleanup após 5 segundos
    setTimeout(() => {
      try { require("fs").unlinkSync(tmpFile); } catch {}
    }, 5000);
  });
}

function openBrowser(url: string) {
  exec(`start "" "${url}"`, () => {});
}

main().catch(console.error);
