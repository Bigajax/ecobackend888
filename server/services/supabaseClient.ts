import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '❌ Erro: As variáveis SUPABASE_URL e SUPABASE_ANON_KEY não estão definidas no backend. Verifique seu arquivo .env.'
  );
  process.exit(1); // força o backend a parar se faltar configuração
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
