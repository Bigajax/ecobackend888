const fs = require('fs');
const path = require('path');

const manifestPath = path.resolve(__dirname, '../dist/assets/modules.manifest.json');

(function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error('[sanitize] manifest não encontrado:', manifestPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(manifestPath, 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch (e) {
    console.error('[sanitize] JSON inválido:', e.message);
    process.exit(1);
  }

  // Garantir versão string
  data.version = String(data.version ?? '0.0.0');

  // Remover chaves não aceitas
  const drop = ['meta','path','categoria','nivelMin','nivelMax','ativaSe','excluiSe','peso','ordenacao','conteudo'];
  const allowedRoles = new Set(['instruction','context','toolhint']);

  data.modules = (data.modules ?? []).map(m => {
    const clean = { ...m };
    for (const k of drop) delete clean[k];
    clean.role = allowedRoles.has(clean.role) ? clean.role : 'instruction';
    return clean;
  });

  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('[sanitize] Manifest corrigido com sucesso.');
})();