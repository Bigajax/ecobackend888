import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Erro: As variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY não estão definidas.',
    'Certifique-se de tê-las configurado corretamente no seu arquivo .env.local e reiniciado o servidor de desenvolvimento.'
  );
}

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!);