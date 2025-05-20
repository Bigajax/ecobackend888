// C:\Users\Rafael\Desktop\eco5555\Eco666\vite.config.ts

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import string from 'vite-plugin-string';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      string({
        include: ['**/*.txt'],
      }),
    ],
    define: {
      'process.env.VITE_OPENROUTER_API_KEY': JSON.stringify(env.VITE_OPENROUTER_API_KEY),
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    resolve: {
      extensions: ['.js', '.ts', '.jsx', '.tsx', '.json', '.txt'],
    },
    server: {
      proxy: {
        '/api': { // Quando o frontend fizer uma requisição para '/api'
          target: 'http://localhost:3001', // Redireciona para o seu backend
          changeOrigin: true, // Muda o cabeçalho 'Origin' para o do destino
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});