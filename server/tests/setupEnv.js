// Preload de ambiente para a suíte test:node.
// Carregado via `-r` ANTES de qualquer arquivo de teste, garante que os guards
// de configuração (ensureSupabaseConfigured, analytics, OpenRouter) não explodam
// por env ausente. Valores são dummies válidos em formato — nenhuma chamada de
// rede real é feita (os testes mockam os clientes/adapters).
//
// Só define o que ainda não veio do ambiente real, para não sobrescrever um
// .env de CI/dev caso exista.
const defaults = {
  NODE_ENV: "test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SUPABASE_ANALYTICS_SERVICE_ROLE_KEY: "test-analytics-service-role-key",
  OPENROUTER_API_KEY: "test-openrouter-key",
  ECO_ANALYTICS_ENABLED: "false",
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
