# 📊 Guia Completo: SQL para Embeddings no Supabase

## 🎯 O QUE FOI CRIADO

Um sistema completo para armazenar e buscar embeddings semânticos de módulos (cognitivos, emocionais, filosóficos).

---

## 📋 ESTRUTURA DA TABELA

```sql
CREATE TABLE heuristicas_embeddings (
  id UUID PRIMARY KEY,
  arquivo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  origem TEXT NOT NULL,
  embedding vector(1536),
  tags TEXT[],
  usuario_id UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

### Campos:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| **id** | UUID | ID único do registro |
| **arquivo** | TEXT | Nome do arquivo (ex: "eco_heuristica_certeza.txt") |
| **tipo** | TEXT | 'cognitiva', 'emocional' ou 'filosofico' |
| **origem** | TEXT | Pasta de origem (modulos_cognitivos, modulos_emocionais, etc) |
| **embedding** | vector(1536) | Vetor OpenAI 1536-dimensional |
| **tags** | TEXT[] | Array de tags para classificação |
| **usuario_id** | UUID | NULL = global; user UUID = user-specific |
| **created_at** | TIMESTAMP | Data de criação (auto) |
| **updated_at** | TIMESTAMP | Data de atualização (auto) |

---

## 🔍 ÍNDICES CRIADOS

### 1️⃣ **HNSW Index** (Busca Semântica Rápida)
```sql
CREATE INDEX heuristicas_embedding_hnsw_idx
ON heuristicas_embeddings
USING hnsw (embedding vector_cosine_ops)
```

**Por quê?**
- Busca por similaridade de vetores em O(log N)
- Perfeito para busca semântica
- Cosine distance: mede similaridade entre 0 (nenhuma) e 1 (idêntico)

**Exemplo:**
```
Query: [0.1, 0.2, ..., 0.9]  (seu embedding)
        ↓ HNSW Index
Encontra: [0.11, 0.21, ..., 0.89]  (similarity: 0.95)
          [0.15, 0.25, ..., 0.85]  (similarity: 0.88)
```

### 2️⃣ **B-Tree Indexes** (Filtros Rápidos)
```sql
CREATE INDEX heuristicas_tipo_idx ON heuristicas_embeddings(tipo);
CREATE INDEX heuristicas_arquivo_idx ON heuristicas_embeddings(arquivo);
CREATE INDEX heuristicas_origem_idx ON heuristicas_embeddings(origem);
CREATE INDEX heuristicas_usuario_id_idx ON heuristicas_embeddings(usuario_id);
```

**Por quê?**
- Filtra por tipo, arquivo, origem rapidamente
- Usa-se: `WHERE tipo = 'emocional'` → rápido

### 3️⃣ **GIN Index** (Busca em Arrays)
```sql
CREATE INDEX heuristicas_tags_gin_idx ON heuristicas_embeddings USING gin(tags);
```

**Por quê?**
- Busca rápida em arrays: `WHERE 'vergonha' = ANY(tags)`
- GIN = Generalized Inverted Index

---

## 🔧 FUNÇÕES RPC CRIADAS

### 1️⃣ `buscar_heuristica_semelhante()` (Recomendada - Rápida)

```sql
SELECT * FROM buscar_heuristica_semelhante(
  query_embedding => [0.1, 0.2, ...],  -- seu embedding (1536 dims)
  match_threshold => 0.8,               -- mínimo de similaridade (0-1)
  match_count => 4,                     -- quantos resultados retornar
  input_usuario_id => NULL              -- NULL = busca global
)
```

**Retorna:**
```
id            | similarity
──────────────┼───────────
abc123...     | 0.95
def456...     | 0.88
ghi789...     | 0.82
jkl012...     | 0.81
```

**Uso no código:**
```typescript
const { data, error } = await supabase.rpc("buscar_heuristica_semelhante", {
  query_embedding: userMessageEmbedding,
  match_threshold: 0.8,
  match_count: 4,
  input_usuario_id: null
});
```

### 2️⃣ `buscar_heuristica_completa()` (Com Metadados)

```sql
SELECT * FROM buscar_heuristica_completa(
  query_embedding => [...],
  match_threshold => 0.8,
  match_count => 4,
  input_usuario_id => NULL
)
```

**Retorna (mais completo):**
```
id   | arquivo              | tipo      | origem                | similarity
─────┼─────────────────────┼───────────┼──────────────────────┼───────────
abc  | eco_emo_vergonha... | emocional | modulos_emocionais   | 0.95
def  | eco_filo_estoico... | filosofic | modulos_filosoficos  | 0.88
```

### 3️⃣ `inserir_heuristica()` (Para Registrar)

```sql
SELECT inserir_heuristica(
  p_arquivo => 'eco_emo_vergonha.txt',
  p_embedding => [0.1, 0.2, ..., 1536 dims],
  p_tipo => 'emocional',
  p_origem => 'modulos_emocionais',
  p_tags => ARRAY['vergonha', 'autoestima']
)
```

**Retorna:**
```
uuid-da-linha-inserida
```

---

## 📖 HOW TO SETUP (Passo a Passo)

### **Passo 1: Copiar SQL para Supabase**

1. Acesse: https://app.supabase.com
2. Select seu projeto
3. Vá para: SQL Editor → New Query
4. Cole todo o conteúdo de `create_heuristicas_embeddings_table.sql`
5. Click "Run"

**Saída esperada:**
```
✅ 1 table created
✅ 5 indexes created
✅ 3 functions created
✅ RLS policies set
```

### **Passo 2: Verificar que foi criado**

```sql
-- Verificar tabela
SELECT * FROM heuristicas_embeddings LIMIT 1;

-- Verificar funções
SELECT proname FROM pg_proc WHERE proname LIKE 'buscar_%';

-- Verificar índices
SELECT indexname FROM pg_indexes
WHERE tablename = 'heuristicas_embeddings';
```

### **Passo 3: Testar Inserção Manual**

```sql
-- Inserir um teste
SELECT inserir_heuristica(
  'test_module.txt',
  '[0.1,0.2,0.3,...]'::vector(1536),
  'emocional',
  'modulos_emocionais',
  ARRAY['test', 'sample']
);

-- Verificar
SELECT arquivo, tipo, similarity FROM buscar_heuristica_completa(
  '[0.1,0.2,0.3,...]'::vector(1536),
  0.5,
  10,
  NULL
);
```

---

## 🚀 USANDO NO CÓDIGO TYPESCRIPT

### **Exemplo 1: Buscar Heurísticas (Seus Scripts)**

```typescript
import { embedTextoCompleto } from "../adapters/embeddingService";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";

async function buscarHeuristicasSemelhantes(texto: string) {
  // 1. Gerar embedding do texto
  const embedding = await embedTextoCompleto(texto, "heuristica");

  // 2. Buscar no Supabase
  const supabase = ensureSupabaseConfigured();
  const { data, error } = await supabase.rpc("buscar_heuristica_semelhante", {
    query_embedding: embedding,
    match_threshold: 0.8,
    match_count: 4,
    input_usuario_id: null
  });

  if (error) {
    console.error("Erro ao buscar:", error);
    return [];
  }

  // 3. Retornar resultados
  return data; // [{id: "...", similarity: 0.95}, ...]
}
```

### **Exemplo 2: Inserir Novo Módulo**

```typescript
async function registrarModuloEmocional(
  nomeArquivo: string,
  conteudo: string
) {
  // 1. Gerar embedding
  const embedding = await embedTextoCompleto(conteudo, "emocional");

  // 2. Inserir no Supabase
  const supabase = ensureSupabaseConfigured();
  const { data, error } = await supabase.rpc("inserir_heuristica", {
    p_arquivo: nomeArquivo,
    p_embedding: embedding,
    p_tipo: "emocional",
    p_origem: "modulos_emocionais",
    p_tags: ["vergonha", "emocional"]
  });

  if (error) {
    console.error("Erro ao inserir:", error);
    return null;
  }

  return data; // UUID do novo registro
}
```

---

## ⚙️ CONFIGURAÇÕES IMPORTANTES

### **HNSW Parameters** (Fine-tuning opcional)

```sql
CREATE INDEX ...
USING hnsw (embedding vector_cosine_ops)
WITH (
  m = 16,              -- número de conexões por nó (padrão: 16)
  ef_construction = 64 -- tamanho da candidatos na construção (padrão: 64)
);
```

**O que mudar:**
- `m = 16` → `m = 32` para mais precisão (mais lento)
- `ef_construction = 64` → `ef_construction = 128` para melhor qualidade

### **Threshold de Similaridade**

```typescript
// match_threshold = 0.8 significa:
// Retorna apenas módulos com similaridade > 80%

// Sugestões:
// - 0.5: Very liberal (até divergentes)
// - 0.7: Liberal (razoavelmente similar)
// - 0.8: Normal (bastante similar)
// - 0.9: Strict (muito similar)
```

### **RLS (Row Level Security)**

```sql
-- Permite ler módulos globais (usuario_id IS NULL)
CREATE POLICY "Allow public read" ON heuristicas_embeddings
FOR SELECT USING (usuario_id IS NULL);

-- Se precisar de dados por usuário:
CREATE POLICY "User data" ON heuristicas_embeddings
FOR SELECT USING (auth.uid() = usuario_id);
```

---

## 🔍 CONSULTANDO MANUALMENTE

### **Exemplo 1: Ver todos os módulos registrados**

```sql
SELECT arquivo, tipo, origem, array_length(tags, 1) as tag_count
FROM heuristicas_embeddings
ORDER BY tipo, arquivo;
```

### **Exemplo 2: Buscar por tipo**

```sql
SELECT COUNT(*) as total
FROM heuristicas_embeddings
WHERE tipo = 'emocional';
```

### **Exemplo 3: Buscar por tags**

```sql
SELECT arquivo, tipo
FROM heuristicas_embeddings
WHERE 'vergonha' = ANY(tags)
  AND tipo = 'emocional';
```

### **Exemplo 4: Simular busca semântica**

```sql
-- Assumindo um embedding de teste:
SELECT
  arquivo,
  tipo,
  (1 - (embedding <=> '[0.1,0.2,...,0.9]'::vector)) as similarity
FROM heuristicas_embeddings
WHERE (1 - (embedding <=> '[0.1,0.2,...,0.9]'::vector)) > 0.8
ORDER BY similarity DESC
LIMIT 5;
```

---

## 📈 PERFORMANCE ESPERADA

| Operação | Sem Índice | Com HNSW | Speedup |
|----------|-----------|----------|---------|
| Buscar 4 similares (1000 registros) | ~500ms | ~10ms | **50x** |
| Buscar 4 similares (10000 registros) | ~5s | ~15ms | **333x** |
| Inserir novo | ~50ms | ~100ms | (índice ↑) |

**Índices têm custo de escrita (+50%) mas benefício massivo em leitura.**

---

## 🐛 TROUBLESHOOTING

### **Erro: "Extension vector does not exist"**

```sql
-- Execute isto primeiro:
CREATE EXTENSION IF NOT EXISTS vector;
```

### **Erro: "Column embedding has wrong type"**

```sql
-- Certifique-se que é vector(1536), não float8[]
ALTER TABLE heuristicas_embeddings
ALTER COLUMN embedding TYPE vector(1536);
```

### **Erro: "RPC not found"**

```sql
-- Verifique se foi criada:
SELECT proname FROM pg_proc WHERE proname = 'buscar_heuristica_semelhante';

-- Se não existir, execute a migration novamente
```

### **Erro: "Permission denied" ao inserir**

```sql
-- Verifique grant:
SELECT grantee, privilege_type
FROM role_table_grants
WHERE table_name = 'heuristicas_embeddings';

-- Conceda permissão:
GRANT INSERT ON heuristicas_embeddings TO service_role;
```

---

## ✨ CHECKLIST FINAL

- [ ] Migration SQL executada no Supabase
- [ ] Tabela `heuristicas_embeddings` criada
- [ ] Índice HNSW criado
- [ ] 3 funções RPC criadas
- [ ] RLS políticas ativadas
- [ ] Teste de inserção funcionou
- [ ] Teste de busca funcionou
- [ ] `npm run registrar:todos` executado
- [ ] Logs mostram ✅ "Registro concluído"
- [ ] Sistema pronto para uso

---

## 🚀 PRÓXIMO PASSO

```bash
# Ativar os módulos
npm run registrar:todos

# Ver logs
npm run registrar:emocionais 2>&1 | grep "✅"
npm run registrar:filosoficos 2>&1 | grep "✅"
```

Pronto! 🎉
