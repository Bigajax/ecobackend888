-- Migration: Fix buscar_heuristica_semelhante function overload ambiguity
-- Description: Removes conflicting function overloads by dropping and recreating with consistent parameter order
-- Date: 2025-11-06

-- Drop all existing overloads of the function
DROP FUNCTION IF EXISTS public.buscar_heuristica_semelhante(vector, uuid, integer, double precision) CASCADE;
DROP FUNCTION IF EXISTS public.buscar_heuristica_semelhante(vector, double precision, integer, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.buscar_heuristica_semelhante(vector(1536), uuid, integer, double precision) CASCADE;
DROP FUNCTION IF EXISTS public.buscar_heuristica_semelhante(vector(1536), double precision, integer, uuid) CASCADE;

-- Recreate with consistent parameter order: query_embedding, match_threshold, match_count, input_usuario_id
CREATE FUNCTION public.buscar_heuristica_semelhante(
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.buscar_heuristica_semelhante TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION public.buscar_heuristica_semelhante IS 'Searches for heuristics similar to a query embedding using cosine distance (fast HNSW index)';
