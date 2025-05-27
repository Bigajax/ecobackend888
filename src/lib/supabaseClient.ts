// src/lib/supabaseClient.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// --- ADICIONE ESTES LOGS PARA DEPURAR NA VERCEL ---
console.log('--- DEBUG VERCEL ---');
console.log('Supabase URL na Vercel:', supabaseUrl);
console.log('Supabase Anon Key na Vercel:', supabaseAnonKey ? 'KEY_EXISTS' : 'KEY_MISSING');
console.log('--- FIM DEBUG VERCEL ---');
// ----------------------------------------------------

if (!supabaseUrl) {
  console.error('Erro: A variável de ambiente VITE_SUPABASE_URL não está definida.');
}

if (!supabaseAnonKey) {
  console.error('Erro: A variável de ambiente VITE_SUPABASE_ANON_KEY não está definida.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);