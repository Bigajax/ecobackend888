#!/usr/bin/env node
/**
 * scripts/registrar-filosoficos.cjs
 * CLI entrypoint para registrar módulos filosóficos no Supabase
 */

const path = require('path');
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
  },
  files: true,
});

const { registrarFilosoficos } = require('../services/registrarFilosoficosService.ts');

console.log('🚀 Iniciando registro de módulos filosóficos...\n');

registrarFilosoficos()
  .then(() => {
    console.log('\n✨ Registro de filosóficos concluído!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Erro fatal:', err);
    process.exit(1);
  });
