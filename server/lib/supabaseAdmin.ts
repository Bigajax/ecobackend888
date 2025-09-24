import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "";
// Use SERVICE_ROLE_KEY se existir, senão ANON_KEY (para dev)
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

if (!url || !key) {
  console.warn("[supabaseAdmin] SUPABASE_URL ou KEY ausentes; o client ficará inoperante.");
}

// client sem sessão persistente (lado servidor)
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// export default (mais robusto para resolver o TS)
export default supabase;

// (opcional) se quiser também o nomeado, mantenha abaixo.
// Não é necessário para corrigir o erro atual.
// export { supabase };
