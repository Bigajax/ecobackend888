// src/lib/supabaseClient.ts

import { createClient } from '@supabase/supabase-js';

// Certifique-se de que estas variáveis de ambiente estejam configuradas no seu projeto frontend (.env.local, .env, etc.)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Verifique se as variáveis de ambiente estão definidas
if (!supabaseUrl) {
  console.error('Erro: A variável de ambiente VITE_SUPABASE_URL não está definida.');
}

if (!supabaseAnonKey) {
  console.error('Erro: A variável de ambiente VITE_SUPABASE_ANON_KEY não está definida.');
}

// Crie o cliente Supabase para o frontend usando a chave anônima
export const supabase = createClient(supabaseUrl, supabaseAnonKey);