-- Compat wrapper to keep legacy RPC name buscar_memorias_semanticas available
-- while delegating to buscar_memorias_semelhantes_v2. The wrapper is created
-- only when the legacy function is missing so repeated migrations remain safe.

DO $$
DECLARE
    v_signature text := 'text, boolean, double precision, integer, vector, vector, integer, text[], integer, uuid';
    v_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE proname = 'buscar_memorias_semanticas'
          AND pg_catalog.pg_function_is_visible(oid)
          AND pg_catalog.pg_get_function_identity_arguments(oid) = v_signature
    )
    INTO v_exists;

    IF NOT v_exists THEN
        EXECUTE $$
        CREATE FUNCTION public.buscar_memorias_semanticas(
            p_emocao text DEFAULT NULL,
            p_include_referencias boolean DEFAULT false,
            p_lambda_mmr double precision DEFAULT 0.5,
            p_limit integer DEFAULT 5,
            p_query vector DEFAULT NULL,
            p_query_emocional vector DEFAULT NULL,
            p_recency_halflife_hours integer DEFAULT 720,
            p_tags text[] DEFAULT '{}',
            p_token_budget integer DEFAULT 1200,
            p_usuario_id uuid DEFAULT NULL
        )
        RETURNS TABLE (
            origem text,
            memoria_id uuid,
            mensagem_id uuid,
            texto text,
            resumo_eco text,
            tags text[],
            dominio_vida text,
            emocao_principal text,
            intensidade smallint,
            pin boolean,
            salvar_memoria boolean,
            created_at timestamptz,
            updated_at timestamptz,
            composite_score numeric,
            similarity_score numeric,
            emotional_similarity numeric,
            recency_score numeric,
            tag_overlap_score numeric,
            emotion_match_score numeric,
            effective_score numeric
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        DECLARE
            v_limit integer := GREATEST(COALESCE(p_limit, 5), 1);
            v_threshold numeric := LEAST(GREATEST(COALESCE(p_lambda_mmr, 0.5), 0), 1);
            v_half_life_hours integer := COALESCE(p_recency_halflife_hours, 720);
            v_days_back integer := CASE
                WHEN v_half_life_hours IS NULL THEN NULL
                WHEN v_half_life_hours <= 0 THEN NULL
                ELSE CEIL(v_half_life_hours / 24.0)::integer
            END;
            v_include_refs boolean := COALESCE(p_include_referencias, false);
        BEGIN
            IF p_query IS NULL THEN
                RETURN;
            END IF;

            RETURN QUERY
            WITH similares AS (
                SELECT *
                FROM public.buscar_memorias_semelhantes_v2(
                    query_embedding => p_query,
                    user_id_input => p_usuario_id,
                    match_count => v_limit,
                    match_threshold => v_threshold,
                    days_back => v_days_back
                ) AS s(
                    id uuid,
                    resumo_eco text,
                    tags text[],
                    emocao_principal text,
                    intensidade numeric,
                    created_at timestamptz,
                    similarity numeric,
                    distancia numeric
                )
            ), enriquecidas AS (
                SELECT
                    CASE
                        WHEN m.id IS NOT NULL THEN 'memories'
                        WHEN r.id IS NOT NULL THEN 'referencias_temporarias'
                        ELSE 'desconhecido'
                    END AS origem,
                    COALESCE(m.id, r.id, s.id) AS memoria_id,
                    COALESCE(m.mensagem_id, r.mensagem_id) AS mensagem_id,
                    COALESCE(m.texto, r.texto) AS texto,
                    COALESCE(m.resumo_eco, r.resumo_eco, s.resumo_eco) AS resumo_eco,
                    COALESCE(m.tags, r.tags, s.tags) AS tags,
                    COALESCE(m.dominio_vida, r.dominio_vida) AS dominio_vida,
                    COALESCE(m.emocao_principal, r.emocao_principal, s.emocao_principal) AS emocao_principal,
                    COALESCE(m.intensidade, r.intensidade, s.intensidade)::smallint AS intensidade,
                    COALESCE(m.pin, r.pin, false) AS pin,
                    COALESCE(m.salvar_memoria, r.salvar_memoria, true) AS salvar_memoria,
                    COALESCE(m.created_at, r.created_at, s.created_at) AS created_at,
                    COALESCE(m.updated_at, r.updated_at, s.created_at) AS updated_at,
                    NULL::numeric AS composite_score,
                    s.similarity::numeric AS similarity_score,
                    NULL::numeric AS emotional_similarity,
                    NULL::numeric AS recency_score,
                    NULL::numeric AS tag_overlap_score,
                    NULL::numeric AS emotion_match_score,
                    s.similarity::numeric AS effective_score
                FROM similares s
                LEFT JOIN public.memories m ON m.id = s.id
                LEFT JOIN public.referencias_temporarias r ON r.id = s.id
            )
            SELECT
                e.origem,
                e.memoria_id,
                e.mensagem_id,
                e.texto,
                e.resumo_eco,
                e.tags,
                e.dominio_vida,
                e.emocao_principal,
                e.intensidade,
                e.pin,
                e.salvar_memoria,
                e.created_at,
                e.updated_at,
                e.composite_score,
                e.similarity_score,
                e.emotional_similarity,
                e.recency_score,
                e.tag_overlap_score,
                e.emotion_match_score,
                e.effective_score
            FROM enriquecidas e
            WHERE v_include_refs OR e.origem <> 'referencias_temporarias'
            ORDER BY e.similarity_score DESC;
        END;
        $$;
        $$;

        COMMENT ON FUNCTION public.buscar_memorias_semanticas(
            text, boolean, double precision, integer, vector, vector, integer, text[], integer, uuid
        ) IS 'Legacy wrapper delegating to buscar_memorias_semelhantes_v2 with safe defaults.';
    END IF;
END
$$;
