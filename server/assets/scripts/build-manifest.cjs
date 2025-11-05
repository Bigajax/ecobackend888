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
const ecoManifestFile = path.join(assetsRoot, 'modules.manifest.eco.json'); // For ModuleStore compatibility

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
const ecoManifestItems = [];

/**
 * Determine family: "core" or "extra"
 */
function determineFamily(modulePath) {
  if (modulePath.startsWith('modulos_core/')) {
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
    role: 'instruction', // Must be: instruction | context | toolhint
    size,
    tokens_avg,
  });

  // Also generate EcoManifestEntry for ModuleStore compatibility
  ecoManifestItems.push({
    id: basename.replace(/\.TXT$/, ''),
    path: modulePath,
    role: 'assistant', // Required by ModuleStore
    categoria: family === 'core' ? 'core' : 'extra',
    nivelMin: 1,
    nivelMax: 3,
    excluiSe: [],
    peso: 1.0,
    ordenacao: 1,
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

// Write modules.manifest.eco.json (for ModuleStore compatibility)
try {
  fs.writeFileSync(
    ecoManifestFile,
    JSON.stringify({ modules: ecoManifestItems }, null, 2),
    'utf8'
  );
  console.log(`✅ Generated: ${path.relative(process.cwd(), ecoManifestFile)}`);
} catch (e) {
  console.error(`❌ Failed to write modules.manifest.eco.json: ${e.message}`);
  process.exit(1);
}

console.log(`\n✅ Build complete: ${activeModules.length} active modules processed`);
