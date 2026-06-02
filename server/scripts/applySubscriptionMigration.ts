/**
 * Script para aplicar a migration de correção do schema de assinaturas
 *
 * Uso:
 *   ts-node --transpile-only server/scripts/applySubscriptionMigration.ts
 */

import { createClient } from "@supabase/supabase-js";
import https from "https";
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias");
  process.exit(1);
}

// Extrair project ref da URL: https://PROJECTREF.supabase.co
const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];

const MIGRATION_PATH = path.join(
  __dirname,
  "../../supabase/migrations/20260223_fix_subscription_schema.sql"
);

const sql = fs.readFileSync(MIGRATION_PATH, "utf8");

const c = {
  reset: "\x1b[0m", bright: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m",
  blue: "\x1b[34m", cyan: "\x1b[36m", gray: "\x1b[90m",
};

function ok(msg: string)   { console.log(`  ${c.green}✓${c.reset} ${msg}`); }
function fail(msg: string) { console.log(`  ${c.red}✗${c.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${c.gray}→ ${msg}${c.reset}`); }

// ── Tentativa 1: Supabase Management API ─────────────────────────────────────

async function tryManagementApi(managementKey: string): Promise<boolean> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ query: sql });

    const options = {
      hostname: "api.supabase.com",
      path: `/v1/projects/${projectRef}/database/query`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${managementKey}`,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(true);
        } else {
          info(`Management API response: ${res.statusCode} — ${data.substring(0, 200)}`);
          resolve(false);
        }
      });
    });

    req.on("error", () => resolve(false));
    req.setTimeout(10000, () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

// ── Tentativa 2: SQL via statements individuais (verificação de colunas) ──────

async function applyViaStatements(): Promise<{ applied: string[]; skipped: string[]; failed: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const applied: string[] = [];
  const skipped: string[] = [];
  const failedOps: string[] = [];

  // Verificar quais colunas existem em usuarios
  const { data: cols } = await supabase
    .from("usuarios")
    .select("*")
    .limit(0);

  // Usar um select para detectar colunas existentes
  const { error: testSelect } = await supabase
    .from("usuarios")
    .select("access_until, current_period_end, trial_start_date, trial_end_date, provider_preapproval_id, provider_payment_id")
    .limit(0);

  const missingCols = testSelect
    ? ["access_until", "current_period_end", "trial_start_date", "trial_end_date", "provider_preapproval_id", "provider_payment_id"]
    : [];

  if (missingCols.length > 0) {
    info(`Colunas ausentes detectadas: ${missingCols.join(", ")}`);
  } else {
    info("Todas as colunas já existem em usuarios");
    skipped.push("ADD COLUMNS (já existem)");
  }

  return { applied, skipped, failed: failedOps };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bright}${c.blue}${"═".repeat(60)}${c.reset}`);
  console.log(`${c.bright}${c.blue}  🔧 APLICAR MIGRATION DE SCHEMA — ECO${c.reset}`);
  console.log(`${c.bright}${c.blue}${"═".repeat(60)}${c.reset}\n`);

  info(`Project ref: ${projectRef}`);
  info(`Migration: 20260223_fix_subscription_schema.sql`);

  // Verificar se há SUPABASE_ACCESS_TOKEN (chave de management)
  const managementKey = process.env.SUPABASE_ACCESS_TOKEN || "";

  if (managementKey) {
    console.log("\n📡 Tentando aplicar via Management API...");
    const success = await tryManagementApi(managementKey);
    if (success) {
      ok("Migration aplicada via Management API!");
      process.exit(0);
    } else {
      fail("Management API não disponível");
    }
  } else {
    info("SUPABASE_ACCESS_TOKEN não configurado — pulando Management API");
  }

  // Verificar estado atual do schema
  console.log("\n🔍 Verificando estado atual do schema...");
  await applyViaStatements();

  // Exibir instruções para aplicar manualmente
  console.log(`\n${c.bright}${c.cyan}━━━ SQL PARA APLICAR NO SUPABASE DASHBOARD ━━━${c.reset}`);
  console.log(`${c.gray}Acesse: https://supabase.com/dashboard/project/${projectRef}/sql/new${c.reset}`);
  console.log(`${c.gray}Cole e execute o SQL abaixo:${c.reset}\n`);

  // Mostrar SQL formatado
  console.log(`${c.cyan}${"─".repeat(60)}${c.reset}`);
  console.log(sql);
  console.log(`${c.cyan}${"─".repeat(60)}${c.reset}`);

  console.log(`\n${c.bright}${c.green}Após executar o SQL, rode novamente:${c.reset}`);
  console.log(`  npm run test:subscription-payments\n`);
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
