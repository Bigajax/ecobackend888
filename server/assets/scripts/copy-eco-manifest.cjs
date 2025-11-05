#!/usr/bin/env node
/**
 * copy-eco-manifest.cjs
 * Copies modules.manifest.eco.json to dist/assets/modules.manifest.json
 * Called after npm run copy:assets to ensure ModuleStore finds the manifest
 */

const fs = require('fs');
const path = require('path');

const assetsRoot = path.dirname(path.dirname(__filename)); // assets/
const ecoManifestSource = path.join(assetsRoot, 'modules.manifest.eco.json');
const distAssetsDir = path.join(assetsRoot, '..', 'dist', 'assets');
const distManifestTarget = path.join(distAssetsDir, 'modules.manifest.json');

// Check if ECO manifest exists
if (!fs.existsSync(ecoManifestSource)) {
  console.warn(`⚠️  Source manifest not found: ${ecoManifestSource}`);
  console.warn('   Run npm run build:manifest first');
  process.exit(0); // Don't fail, might be dev mode
}

// Ensure dist/assets dir exists
if (!fs.existsSync(distAssetsDir)) {
  fs.mkdirSync(distAssetsDir, { recursive: true });
  console.log(`✓ Created: ${distAssetsDir}`);
}

// Copy ECO manifest as modules.manifest.json for ModuleStore
try {
  const content = fs.readFileSync(ecoManifestSource, 'utf8');
  fs.writeFileSync(distManifestTarget, content, 'utf8');
  console.log(`✅ Copied: ${ecoManifestSource}`);
  console.log(`   → ${distManifestTarget}`);
} catch (e) {
  console.error(`❌ Failed to copy manifest: ${e.message}`);
  process.exit(1);
}
