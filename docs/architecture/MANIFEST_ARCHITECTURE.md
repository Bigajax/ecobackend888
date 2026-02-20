# Manifest Architecture - ECO Backend

## Overview

The ECO backend uses a **unified module manifest system** to manage 36+ prompt modules across 5 families. This document describes the architecture, format, and usage of the module manifest.

## Evolution

### Before (Fragmented)
```
❌ modules.manifest.eco.json (legacy EcoManifest format, unused)
❌ modules.manifest.json (minimal, missing metadata)
❌ active-modules.json (only 5 core modules listed)
⚠️  Filesystem (36 modules, no documentation)
```

**Problem**: Manifests were out of sync, redundant, and didn't capture all modules or metadata.

### After (Consolidated)
```
✅ modules.manifest.json (single source of truth)
   └── Contains: defaults, families, 36 modules with gates/roles/sizes
✅ active-modules.json (authoritative module list)
   └── Lists all 36 active modules from filesystem
✅ MANIFEST.json (metadata snapshot)
   └── Generated from active-modules.json for build artifacts
✅ Filesystem (36 modules, perfectly synchronized)
```

**Benefits**: Single source of truth, consistent metadata, complete documentation.

---

## Manifest Format

### File: `server/assets/modules.manifest.json`

```json
{
  "version": "2",
  "defaults": {
    "window_days": 14,
    "alpha_prior": 1.5,
    "beta_prior": 1.5,
    "max_aux_tokens": 350,
    "cold_start_boost": 0.35
  },
  "families": {
    "core": {
      "reward_key": "core_guidance",
      "baseline": "ABERTURA_SUPERFICIE",
      "enabled": true
    },
    "emotional": {
      "reward_key": "emotional_resonance",
      "baseline": "ECO_VULNERABILIDADE_MITOS",
      "enabled": true
    },
    // ... more families
  },
  "modules": [
    {
      "id": "SISTEMA_IDENTIDADE",
      "family": "core",
      "role": "instruction",
      "size": "S",
      "tokens_avg": 414,
      "enabled": true,
      "gate": { "min_open": 2 },      // Optional: activation conditions
      "path_hint": "...",              // Optional: file path hint
      "excludes": ["other_id"],        // Optional: incompatible modules
      "depends_on": ["dependency_id"]  // Optional: required modules
    }
    // ... 36 total modules
  ]
}
```

---

## Key Sections

### 1. `defaults` (Bandit Configuration)
Global parameters for the multi-armed bandit optimization algorithm:

| Field | Type | Purpose |
|-------|------|---------|
| `window_days` | number | Lookback window for reward calculation (days) |
| `alpha_prior` | number | Beta distribution prior (exploration) |
| `beta_prior` | number | Beta distribution prior (exploitation) |
| `max_aux_tokens` | number | Maximum tokens for auxiliary modules |
| `cold_start_boost` | number | Boost for untested modules (0-1) |

Used by: `moduleManifest.ts` → bandit algorithms

---

### 2. `families` (Module Groupings)
Collections of related modules, each eligible to be a bandit arm:

```json
{
  "family_id": {
    "reward_key": "unique_key_for_metrics",
    "baseline": "MODULE_ID",           // Default when family selected
    "enabled": true
  }
}
```

**Current Families**:
- **core**: Base system modules (always active)
- **emotional**: Emotional intelligence & vulnerability modules
- **philosophical**: Stoic/philosophical reflection modules
- **cognitive**: Heuristic bias & cognitive pattern modules
- **extra**: Utility & reference modules

Used by: `moduleManifest.ts` (bandit arms), `familyBanditPlanner.ts` (selection)

---

### 3. `modules` (Module Definitions)
Complete metadata for all 36 modules:

#### Core Fields
| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `id` | string | ✓ | Unique module identifier (uppercase) |
| `family` | string | ✓ | Family assignment |
| `role` | enum | ✓ | `instruction` (core) or `context` (optional) |
| `size` | enum | ✓ | `S` (small), `M` (medium), `L` (large) |
| `tokens_avg` | number | ✓ | Average token count for budget planning |
| `enabled` | boolean | ✓ | Feature toggle for this module |

#### Conditional Fields
| Field | Type | Purpose |
|-------|------|---------|
| `gate` | object | Activation conditions (min_open, signals) |
| `path_hint` | string | File path hint (for ambiguous IDs) |
| `excludes` | array | Module IDs incompatible with this one |
| `depends_on` | array | Module IDs required before this one |

#### Gate Structure
```json
{
  "gate": {
    "min_open": 2,              // Min openness level (1-3)
    "signal": "cognitive_bias", // Heuristic signal trigger
    "min": 0.5                  // Min bandit score threshold
  }
}
```

---

## Module Families Breakdown

### Core Family (5 modules)
- **SISTEMA_IDENTIDADE**: System identity & values
- **ABERTURA_SUPERFICIE**: Level 1 openness (surface)
- **FORMATO_RESPOSTA**: Response formatting rules
- **INSTRUCOES_SISTEMA**: System instructions
- **TECNICO_BLOCO_MEMORIA**: Memory block formatting

**Usage**: Always loaded, provides foundation for all responses.

---

### Emotional Family (6 modules)
- **ECO_EMO_VERGONHA_COMBATE**: Shame resilience
- **ECO_MEMORIA_REVISITAR_PASSADO**: Memory reflection
- **ECO_VULNERABILIDADE_DEFESAS**: Vulnerability patterns
- **ECO_VULNERABILIDADE_MICRO_PRESENCA**: Micro-presence in vulnerability
- **ECO_VULNERABILIDADE_MICRO_REFRAME**: Reframing vulnerability
- **ECO_VULNERABILIDADE_MITOS**: Myths about vulnerability

**Gate**: `min_open: 2` (reflection level or above)
**Reward Key**: `emotional_resonance`

---

### Philosophical Family (8 modules)
- **ECO_CORPO_EMOCAO**: Body-emotion integration
- **ECO_CORPO_SENSACAO**: Embodied sensation
- **ECO_FIM_DO_SOFRIMENTO**: Path through suffering
- **ECO_IDENTIFICACAO_MENTE**: Mind identification
- **ECO_OBSERVADOR_PRESENTE**: Present observer (stoic)
- **ECO_PRESENCA_RACIONAL**: Rational presence (stoic)
- **ECO_OBSERVADOR_PRESENTE_ESTOICO**: Stoic version
- **ECO_PRESENCA_RACIONAL_ESTOICO**: Stoic version

**Gate**: `min_open: 2-3` (reflection or depth)
**Reward Key**: `philosophical_depth`

---

### Cognitive Family (10 modules)
- **ECO_HEURISTICA_ANCORAGEM**: Anchoring bias
- **ECO_HEURISTICA_CAUSAS_SUPERAM_ESTATISTICAS**: Cause bias
- **ECO_HEURISTICA_CERTEZA_EMOCIONAL**: Emotional certainty
- **ECO_HEURISTICA_DISPONIBILIDADE**: Availability heuristic
- **ECO_HEURISTICA_EXCESSO_CONFIANCA**: Overconfidence
- **ECO_HEURISTICA_ILUSAO_COMPREENSAO_PASSADO**: Hindsight bias
- **ECO_HEURISTICA_ILUSAO_VALIDADE**: Validity illusion
- **ECO_HEURISTICA_INTUICAO_ESPECIALISTA**: Intuition bias
- **ECO_HEURISTICA_REGRESSAO_MEDIA**: Regression to mean
- **HEURISTICA_ILUSAO_COMPREENSAO**: Illusion of understanding

**Gate**: `signal: "bias_name"` (heuristic trigger)
**Reward Key**: `cognitive_clarity`

---

### Extra Family (7 modules)
- **BLOCO_REFERENCIA_LEVE**: Light reference block
- **DETECÇÃOCRISE**: Crisis detection
- **ESCALA_INTENSIDADE_0A10**: Intensity scale
- **PEDIDOPRÁTICO**: Practical request framework
- **BLOCO_TECNICO_MEMORIA**: Technical memory block
- **ESCALA_ABERTURA_1A3**: Openness scale
- **METODO_VIVA_ENXUTO**: Lean/enxuto methodology

**Gate**: Optional, contextual
**Reward Key**: `contextual_support`

---

## Systems Using the Manifest

### 1. ModuleManifest Registry (`moduleManifest.ts`)
**Purpose**: Bandit optimization and family-based module selection

**Reads**:
- `families` → arm definitions for bandit
- `defaults` → bandit algorithm parameters
- `modules` → tokens_avg, gates, excludes, depends_on

**Caches**: Manifest snapshot with normalized IDs

**Usage**:
```typescript
const family = moduleManifest.getFamily("emotional");
const defaults = moduleManifest.getDefaults();
const module = moduleManifest.getModule("ECO_VULNERABILIDADE_MITOS");
```

---

### 2. ModuleCatalog (`moduleCatalog.ts`)
**Purpose**: Filesystem-based module loading and content delivery

**Reads**: Module content from `.txt` files in `server/assets/`

**Ignores**: Manifest structure (filesystem is source of truth)

**Usage**:
```typescript
const content = await ModuleCatalog.read("modulos_filosoficos/eco_corpo_emocao.txt");
```

---

### 3. ContextBuilder (`ContextBuilder.ts`)
**Purpose**: Dynamic prompt assembly based on emotional state

**Uses**: ModuleCatalog for content, manifest gates for conditional loading

**Flow**:
1. Get emotional decision (intensity, openness)
2. Query manifest for available modules (gates)
3. Load module content via ModuleCatalog
4. Assemble final prompt

---

## Build Pipeline

### 1. `active-modules.json` (Source of Truth)
```bash
server/assets/config/active-modules.json
├── Manually maintained list of 36 active modules
└── Canonical reference for what's "active"
```

### 2. `build:manifest` Script
```bash
npm run build:manifest
# → Calls: server/assets/scripts/build-manifest.cjs

# Reads: active-modules.json
# Generates:
#   - MANIFEST.json (metadata: path, bytes, mtime)
#   - modules.manifest.json (full manifest with gates/families)
```

### 3. Build Process
```bash
npm run build
  └── tsc (compile TypeScript)
  └── npm run copy:assets (copy .txt files to dist/)
  └── npm run build:manifest (generate manifests)
  └── npm run postbuild:sanitize (validate)
```

---

## Synchronization

### Keeping Manifests in Sync

When adding/removing modules:

1. **Edit** `server/assets/config/active-modules.json`
   ```json
   {
     "active": [
       "modulos_core/new_module.txt",
       // ... existing modules
     ]
   }
   ```

2. **Run** `npm run build:manifest`
   - Regenerates `MANIFEST.json`
   - Regenerates `modules.manifest.json` (but preserves gates/families!)

3. **Update** `modules.manifest.json` manually to add:
   - Gate conditions
   - Family assignment
   - Dependencies

4. **Commit** all three files

### Verification
```bash
npm run modules:inventory
# Lists all loaded modules and their metadata
```

---

## Migration Notes

### What Changed
| Before | After | Reason |
|--------|-------|--------|
| 3 manifest files | 1 unified manifest | Single source of truth |
| 5 modules documented | 36 modules documented | Complete coverage |
| No families/gates | Full gates & families | Enables optimization |
| Inconsistent IDs | Normalized IDs (uppercase) | Type safety |
| `.eco.json` format | `.json` v2 format | Consolidation |

### Backward Compatibility
- ModuleStore.ts still works (filesystem is authoritative)
- Build process is backward compatible
- Old `.eco.json` file was never used in production

### Breaking Changes
- Removed `copy-eco-manifest` script (no longer needed)
- `modules.manifest.json` format changed (but v2 is same as before)
- Manifest now required for complete metadata

---

## Examples

### Example 1: Add Gate Condition to Module
```json
{
  "id": "ECO_CORPO_EMOCAO",
  "family": "philosophical",
  "gate": {
    "min_open": 2,
    "min": 0.3
  }
}
```

Result: Module only loads if:
- Openness level ≥ 2 (reflection or depth)
- AND bandit score ≥ 0.3

### Example 2: Add Heuristic Signal Gate
```json
{
  "id": "ECO_HEURISTICA_ANCORAGEM",
  "family": "cognitive",
  "gate": {
    "signal": "ancoragem"
  }
}
```

Result: Module loads when `ancoragem` signal detected in conversation

### Example 3: Module Dependencies
```json
{
  "id": "ECO_MICRO_REFRAME",
  "depends_on": ["ECO_VULNERABILIDADE_DEFESAS"],
  "excludes": ["ECO_CORPO_SENSACAO"]
}
```

Result:
- Must load DEFESAS first
- Never loads with CORPO_SENSACAO

---

## Troubleshooting

### Warning: "Source manifest not found"
**Cause**: Build script looking for deleted `.eco.json`
**Fix**: Removed in refactor. Update your build process.

### Modules not loading
**Check**:
1. Module in `active-modules.json`? ✓
2. File exists in `server/assets/`? ✓
3. Gate conditions met? ✓
4. `npm run build:manifest` run recently? ✓

### Manifest out of sync
**Solution**:
```bash
npm run build:manifest
git add server/assets/*.json server/assets/config/active-modules.json
git commit -m "refactor: rebuild manifests"
```

---

## Future Enhancements

1. **Manifest Validation Schema** (Zod)
   - Type-safe manifest loading
   - Build-time validation

2. **Manifest Versioning**
   - Semantic versioning for breaking changes
   - Migration guides

3. **Dynamic Manifest Loading**
   - Load module descriptions from manifest comments
   - Reduce duplicate metadata

4. **Module Discovery API**
   - `GET /api/modules` endpoint
   - List available modules with metadata

---

## Related Documentation

- [`CLAUDE.md`](./CLAUDE.md) - Project overview
- [`server/assets/config/active-modules.json`](./server/assets/config/active-modules.json) - Active module list
- [`server/assets/modules.manifest.json`](./server/assets/modules.manifest.json) - Full manifest
- [`server/services/promptContext/moduleManifest.ts`](./server/services/promptContext/moduleManifest.ts) - Manifest registry
- [`server/assets/scripts/build-manifest.cjs`](./server/assets/scripts/build-manifest.cjs) - Build script
