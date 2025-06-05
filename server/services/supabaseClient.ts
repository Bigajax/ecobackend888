import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error(
    '❌ Erro: As variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não estão definidas no backend. Verifique seu arquivo .env.'
  );
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
