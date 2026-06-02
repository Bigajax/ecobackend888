-- Migration: Create heuristicas_embeddings table with pgvector support
-- Description: Stores embeddings for heuristics, emotional, and philosophical modules
-- Date: 2025-11-05

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the heuristicas_embeddings table
CREATE TABLE IF NOT EXISTS public.heuristicas_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core metadata
  arquivo TEXT NOT NULL UNIQUE,  -- filename (e.g., "eco_heuristica_certeza.txt")
  tipo TEXT NOT NULL DEFAULT 'cognitiva',  -- 'cognitiva', 'emocional', 'filosofico'
  origem TEXT NOT NULL,  -- 'modulos_cognitivos', 'modulos_emocionais', 'modulos_filosoficos'

  -- Embedding vector (OpenAI 1536-dimensional)
  embedding vector(1536) NOT NULL,

  -- Metadata
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],  -- tags like ['certeza', 'emocional', 'etc']
  usuario_id UUID,  -- NULL = global/system, otherwise user-specific

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_tipo CHECK (tipo IN ('cognitiva', 'emocional', 'filosofico')),
  CONSTRAINT arquivo_not_empty CHECK (length(arquivo) > 0)
);

-- Create indexes for optimal search
-- 1. HNSW index for fast semantic search (pgvector native)
CREATE INDEX IF NOT EXISTS heuristicas_embedding_hnsw_idx
ON public.heuristicas_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 2. B-tree index for metadata filtering
CREATE INDEX IF NOT EXISTS heuristicas_tipo_idx ON public.heuristicas_embeddings(tipo);
CREATE INDEX IF NOT EXISTS heuristicas_arquivo_idx ON public.heuristicas_embeddings(arquivo);
CREATE INDEX IF NOT EXISTS heuristicas_origem_idx ON public.heuristicas_embeddings(origem);
CREATE INDEX IF NOT EXISTS heuristicas_usuario_id_idx ON public.heuristicas_embeddings(usuario_id);

-- 3. GIN index for tags array search
CREATE INDEX IF NOT EXISTS heuristicas_tags_gin_idx ON public.heuristicas_embeddings USING gin(tags);

-- Create RPC function for semantic search
CREATE OR REPLACE FUNCTION public.buscar_heuristica_semelhante(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.8,
  match_count INT DEFAULT 4,
  input_usuario_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
SELECT
  he.id,
  (1 - (he.embedding <=> query_embedding)) AS similarity
FROM public.heuristicas_embeddings he
WHERE
  (1 - (he.embedding <=> query_embedding)) > match_threshold
  AND (input_usuario_id IS NULL OR he.usuario_id IS NULL OR he.usuario_id = input_usuario_id)
ORDER BY
  he.embedding <=> query_embedding
LIMIT match_count;
$$;

-- Create RPC function for getting embeddings with metadata
CREATE OR REPLACE FUNCTION public.buscar_heuristica_completa(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.8,
  match_count INT DEFAULT 4,
  input_usuario_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  arquivo TEXT,
  tipo TEXT,
  origem TEXT,
  tags TEXT[],
  similarity FLOAT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE SQL STABLE
AS $$
SELECT
  he.id,
  he.arquivo,
  he.tipo,
  he.origem,
  he.tags,
  (1 - (he.embedding <=> query_embedding)) AS similarity,
  he.created_at
FROM public.heuristicas_embeddings he
WHERE
  (1 - (he.embedding <=> query_embedding)) > match_threshold
  AND (input_usuario_id IS NULL OR he.usuario_id IS NULL OR he.usuario_id = input_usuario_id)
ORDER BY
  he.embedding <=> query_embedding
LIMIT match_count;
$$;

-- Create RPC for bulk insert (used by registration scripts)
CREATE OR REPLACE FUNCTION public.inserir_heuristica(
  p_arquivo TEXT,
  p_embedding vector(1536),
  p_tipo TEXT,
  p_origem TEXT,
  p_tags TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.heuristicas_embeddings (arquivo, embedding, tipo, origem, tags)
  VALUES (p_arquivo, p_embedding, p_tipo, p_origem, p_tags)
  RETURNING heuristicas_embeddings.id INTO v_id;

  RETURN v_id;
END;
$$;

-- Enable RLS (Row Level Security)
ALTER TABLE public.heuristicas_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow public read access to system modules (usuario_id IS NULL)
CREATE POLICY "Allow public read on system modules" ON public.heuristicas_embeddings
FOR SELECT USING (usuario_id IS NULL);

-- RLS Policy: Allow users to read their own modules
CREATE POLICY "Allow users to read own modules" ON public.heuristicas_embeddings
FOR SELECT USING (
  auth.uid() = usuario_id OR
  usuario_id IS NULL OR
  current_setting('role') = 'service_role'
);

-- RLS Policy: Allow service role to do everything
CREATE POLICY "Allow service role" ON public.heuristicas_embeddings
FOR ALL USING (current_setting('role') = 'service_role');

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_heuristicas_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_heuristicas_embeddings_updated_at_trigger ON public.heuristicas_embeddings;

CREATE TRIGGER update_heuristicas_embeddings_updated_at_trigger
BEFORE UPDATE ON public.heuristicas_embeddings
FOR EACH ROW
EXECUTE FUNCTION public.update_heuristicas_embeddings_updated_at();

-- Grant permissions
GRANT SELECT ON public.heuristicas_embeddings TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.buscar_heuristica_semelhante TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.buscar_heuristica_completa TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.inserir_heuristica TO service_role;

-- Add comment
COMMENT ON TABLE public.heuristicas_embeddings IS 'Stores embeddings for cognitive, emotional, and philosophical modules used by the ECO system for semantic search and context building.';
COMMENT ON COLUMN public.heuristicas_embeddings.embedding IS 'OpenAI 1536-dimensional vector embedding of the module content';
COMMENT ON COLUMN public.heuristicas_embeddings.tipo IS 'Type of module: cognitiva (heuristics), emocional (emotional support), filosofico (philosophical)';
COMMENT ON FUNCTION public.buscar_heuristica_semelhante IS 'Searches for heuristics similar to a query embedding using cosine distance (fast HNSW index)';
