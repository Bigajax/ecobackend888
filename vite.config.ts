import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import string from 'vite-plugin-string'; // 🔹 Importa o plugin para arquivos .md

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      string({ include: '**/*.md' }) // 🔹 Habilita importação dos .md como texto
    ],
    define: {
      'process.env.VITE_OPENROUTER_API_KEY': JSON.stringify(env.VITE_OPENROUTER_API_KEY),
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});