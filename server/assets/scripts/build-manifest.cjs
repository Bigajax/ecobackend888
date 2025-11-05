#!/usr/bin/env node
/**
 * build-manifest.cjs
 * Builds asset manifests from active-modules.json
 * - Reads active modules list
 * - Resolves paths, collects metadata (bytes, mtime)
 * - Generates MANIFEST.json and modules.manifest.json
 * - Creates retrocompatible mirrors for legacy paths
 */

const fs = require('fs');
const path = require('path');

// Paths
const assetsRoot = path.dirname(path.dirname(__filename)); // assets/
const configFile = path.join(assetsRoot, 'config', 'active-modules.json');
const manifestFile = path.join(assetsRoot, 'MANIFEST.json');
const modulesManifestFile = path.join(assetsRoot, 'modules.manifest.json');

// Ensure config file exists
if (!fs.existsSync(configFile)) {
  console.error(`❌ Config file not found: ${configFile}`);
  process.exit(1);
}

// Load active modules config
let config;
try {
  config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
} catch (e) {
  console.error(`❌ Failed to parse ${configFile}: ${e.message}`);
  process.exit(1);
}

const activeModules = config.active || [];
console.log(`📦 Processing ${activeModules.length} active modules...`);

// Track manifests
const manifestItems = [];
const modulesManifestItems = [];
let mirrorsCreated = 0;

// Map of (legacy path → actual path) for retrocompat
const legacyPathMap = {
  'modulos_core/identidade_mini.txt': 'modulos_core/identidade_mini.txt',
  'modulos_core/nv1_core.txt': 'modulos_core/nv1_core.txt',
  'modulos_core/eco_estrutura_de_resposta.txt': 'modulos_core/eco_estrutura_de_resposta.txt',
  'prompts/eco_prompt_programavel.txt': 'prompts/eco_prompt_programavel.txt',
  'modulos_extras/bloco_tecnico_memoria.txt': 'modulos_extras/bloco_tecnico_memoria.txt',
};

/**
 * Determine family: "core" or "extra"
 */
function determineFamily(modulePath) {
  if (modulePath.startsWith('modulos_core/') || modulePath.startsWith('prompts/')) {
    return 'core';
  }
  return 'extra';
}

/**
 * Determine size category based on bytes
 */
function determineSize(bytes) {
  if (bytes <= 2048) return 'S';
  if (bytes <= 8192) return 'M';
  return 'L';
}

/**
 * Estimate average tokens (simple heuristic: bytes / 4)
 */
function estimateTokens(bytes) {
  return Math.max(0, Math.floor(bytes / 4));
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Create or update a mirror file (retrocompat)
 */
function createMirror(sourcePath, targetPath) {
  const sourceFullPath = path.join(assetsRoot, sourcePath);
  const targetFullPath = path.join(assetsRoot, targetPath);

  // Only create mirror if source and target are different
  if (path.normalize(sourceFullPath) === path.normalize(targetFullPath)) {
    return false;
  }

  // Ensure source exists
  if (!fs.existsSync(sourceFullPath)) {
    console.warn(`⚠️  Source file not found: ${sourcePath}`);
    return false;
  }

  // Ensure target directory
  ensureDir(path.dirname(targetFullPath));

  // Copy file
  try {
    const content = fs.readFileSync(sourceFullPath, 'utf8');
    fs.writeFileSync(targetFullPath, content, 'utf8');
    return true;
  } catch (e) {
    console.error(`❌ Failed to create mirror ${targetPath}: ${e.message}`);
    return false;
  }
}

// Process each active module
for (const modulePath of activeModules) {
  const fullPath = path.join(assetsRoot, modulePath);

  // Check file exists
  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  Module not found: ${modulePath}`);
    continue;
  }

  // Get file stats
  let stats;
  try {
    stats = fs.statSync(fullPath);
  } catch (e) {
    console.warn(`⚠️  Failed to stat ${modulePath}: ${e.message}`);
    continue;
  }

  const bytes = stats.size;
  const mtime = stats.mtime.toISOString();

  // Add to MANIFEST.json
  manifestItems.push({
    path: modulePath,
    bytes,
    mtime,
  });

  // Build modules.manifest.json entry
  const basename = path.basename(modulePath).toUpperCase();
  const family = determineFamily(modulePath);
  const size = determineSize(bytes);
  const tokens_avg = estimateTokens(bytes);

  modulesManifestItems.push({
    id: basename.replace(/\.TXT$/, ''),
    family,
    role: 'instruction',
    size,
    tokens_avg,
  });

  console.log(`✓ ${modulePath} (${bytes} bytes, ${family}, ${size})`);
}

// Write MANIFEST.json
try {
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({ items: manifestItems }, null, 2),
    'utf8'
  );
  console.log(`\n✅ Generated: ${path.relative(process.cwd(), manifestFile)}`);
} catch (e) {
  console.error(`❌ Failed to write MANIFEST.json: ${e.message}`);
  process.exit(1);
}

// Write modules.manifest.json
try {
  fs.writeFileSync(
    modulesManifestFile,
    JSON.stringify({ version: '2', modules: modulesManifestItems }, null, 2),
    'utf8'
  );
  console.log(`✅ Generated: ${path.relative(process.cwd(), modulesManifestFile)}`);
} catch (e) {
  console.error(`❌ Failed to write modules.manifest.json: ${e.message}`);
  process.exit(1);
}

// Create retrocompatible mirrors
console.log('\n🔄 Creating retrocompatibility mirrors...');
for (const modulePath of activeModules) {
  const legacyPath = legacyPathMap[modulePath];
  if (legacyPath && legacyPath !== modulePath) {
    if (createMirror(modulePath, legacyPath)) {
      mirrorsCreated++;
      console.log(`  ✓ Mirror: ${modulePath} → ${legacyPath}`);
    }
  } else if (legacyPath) {
    console.log(`  ✓ Already in place: ${modulePath}`);
  }
}

console.log(
  `\n✅ Build complete: ${activeModules.length} active modules, ${mirrorsCreated} mirrors created`
);
