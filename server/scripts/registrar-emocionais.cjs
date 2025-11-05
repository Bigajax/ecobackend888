#!/usr/bin/env node
/**
 * scripts/registrar-emocionais.cjs
 * CLI entrypoint para registrar módulos emocionais no Supabase
 */

const path = require('path');
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
  },
  files: true,
});

const { registrarEmocionais } = require('../services/registrarEmocionaisService.ts');

console.log('🚀 Iniciando registro de módulos emocionais...\n');

registrarEmocionais()
  .then(() => {
    console.log('\n✨ Registro de emocionais concluído!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Erro fatal:', err);
    process.exit(1);
  });
