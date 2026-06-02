-- Queries administrativas para análise de feedback
-- Data: 2026-01-20
-- Versão: 1.0

-- ============================================
-- QUERIES DE ANÁLISE E MONITORAMENTO
-- ============================================

-- 1. Feedback por categoria (distribuição percentual)
-- Útil para: Entender quais tipos de feedback são mais comuns
/*
SELECT
  category,
  COUNT(*) as total,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentual
FROM user_feedback
GROUP BY category
ORDER BY total DESC;
*/

-- 2. Páginas com mais feedback
-- Útil para: Identificar páginas problemáticas ou populares
/*
SELECT
  page,
  COUNT(*) as total_feedback,
  COUNT(CASE WHEN category = 'bug' THEN 1 END) as bugs,
  COUNT(CASE WHEN category = 'feature' THEN 1 END) as features,
  COUNT(CASE WHEN category = 'improvement' THEN 1 END) as melhorias,
  COUNT(CASE WHEN category = 'other' THEN 1 END) as outros
FROM user_feedback
WHERE page IS NOT NULL
GROUP BY page
ORDER BY total_feedback DESC
LIMIT 10;
*/

-- 3. Feedback dos últimos 7 dias (agrupado por dia)
-- Útil para: Monitorar tendências temporais
/*
SELECT
  DATE(created_at) as dia,
  COUNT(*) as total,
  COUNT(CASE WHEN category = 'bug' THEN 1 END) as bugs,
  COUNT(CASE WHEN category = 'feature' THEN 1 END) as features,
  COUNT(CASE WHEN category = 'improvement' THEN 1 END) as melhorias,
  COUNT(CASE WHEN category = 'other' THEN 1 END) as outros
FROM user_feedback
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY dia DESC;
*/

-- 4. Usuários mais ativos (por guest_id)
-- Útil para: Identificar usuários engajados
/*
SELECT
  guest_id,
  COUNT(*) as total_feedback,
  MIN(created_at) as primeiro_feedback,
  MAX(created_at) as ultimo_feedback,
  ARRAY_AGG(DISTINCT category) as categorias_usadas
FROM user_feedback
WHERE guest_id IS NOT NULL
GROUP BY guest_id
ORDER BY total_feedback DESC
LIMIT 20;
*/

-- 5. Feedback com palavras-chave específicas (bugs/erros)
-- Útil para: Buscar problemas reportados
/*
SELECT
  id,
  message,
  category,
  page,
  created_at
FROM user_feedback
WHERE message ILIKE '%bug%'
   OR message ILIKE '%erro%'
   OR message ILIKE '%problema%'
   OR message ILIKE '%não funciona%'
   OR message ILIKE '%quebrado%'
ORDER BY created_at DESC;
*/

-- 6. Feedback recente (últimas 24 horas)
-- Útil para: Monitoramento em tempo real
/*
SELECT
  id,
  COALESCE(user_id::TEXT, guest_id::TEXT, 'anonymous') as identifier,
  category,
  LEFT(message, 100) as message_preview,
  page,
  created_at
FROM user_feedback
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
*/

-- 7. Taxa de feedback por hora do dia
-- Útil para: Entender padrões de uso
/*
SELECT
  EXTRACT(HOUR FROM created_at) as hora,
  COUNT(*) as total_feedback,
  COUNT(DISTINCT guest_id) as usuarios_unicos
FROM user_feedback
GROUP BY EXTRACT(HOUR FROM created_at)
ORDER BY hora;
*/

-- 8. Feedback mais longo (potencialmente mais detalhado)
-- Útil para: Encontrar feedback rico em informações
/*
SELECT
  id,
  category,
  LENGTH(message) as tamanho,
  LEFT(message, 200) as preview,
  created_at
FROM user_feedback
ORDER BY LENGTH(message) DESC
LIMIT 20;
*/

-- ============================================
-- FUNCTION: Estatísticas agregadas de feedback
-- ============================================

CREATE OR REPLACE FUNCTION get_feedback_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_feedback', (SELECT COUNT(*) FROM user_feedback),
    'total_usuarios', (SELECT COUNT(DISTINCT COALESCE(user_id, guest_id)) FROM user_feedback),
    'por_categoria', (
      SELECT json_object_agg(category, total)
      FROM (
        SELECT
          COALESCE(category, 'uncategorized') as category,
          COUNT(*) as total
        FROM user_feedback
        GROUP BY category
      ) cat_stats
    ),
    'ultimas_24h', (SELECT COUNT(*) FROM user_feedback WHERE created_at > NOW() - INTERVAL '24 hours'),
    'ultimos_7_dias', (SELECT COUNT(*) FROM user_feedback WHERE created_at > NOW() - INTERVAL '7 days'),
    'ultimos_30_dias', (SELECT COUNT(*) FROM user_feedback WHERE created_at > NOW() - INTERVAL '30 days'),
    'paginas_top_5', (
      SELECT json_agg(page_stat)
      FROM (
        SELECT json_build_object('page', page, 'count', COUNT(*)) as page_stat
        FROM user_feedback
        WHERE page IS NOT NULL
        GROUP BY page
        ORDER BY COUNT(*) DESC
        LIMIT 5
      ) top_pages
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Exemplo de uso:
-- SELECT get_feedback_stats();

-- ============================================
-- VIEW: Feedback recente com informações úteis
-- ============================================

CREATE OR REPLACE VIEW feedback_recente AS
SELECT
  id,
  COALESCE(user_id::TEXT, guest_id::TEXT, 'anonymous') as identifier_type,
  category,
  LEFT(message, 100) as message_preview,
  page,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as horas_atras
FROM user_feedback
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Exemplo de uso:
-- SELECT * FROM feedback_recente LIMIT 10;

-- ============================================
-- ÍNDICES ADICIONAIS (se necessário)
-- ============================================

-- Índice para busca full-text na mensagem (se necessário)
-- CREATE INDEX idx_user_feedback_message_fulltext ON user_feedback USING gin(to_tsvector('portuguese', message));

-- Índice composto para queries por página e categoria
-- CREATE INDEX idx_user_feedback_page_category ON user_feedback(page, category) WHERE page IS NOT NULL;

-- ============================================
-- LIMPEZA E MANUTENÇÃO
-- ============================================

-- Excluir feedback muito antigo (mais de 1 ano)
-- ATENÇÃO: Execute com cuidado em produção
/*
DELETE FROM user_feedback
WHERE created_at < NOW() - INTERVAL '1 year';
*/

-- Exportar feedback para análise externa (CSV)
/*
COPY (
  SELECT
    id,
    category,
    message,
    page,
    created_at
  FROM user_feedback
  ORDER BY created_at DESC
) TO '/tmp/feedback_export.csv' WITH CSV HEADER;
*/
