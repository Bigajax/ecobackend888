-- Script para migrar memórias "Neutro" para "Indefinida" ou emoções inferidas
-- Execute no Supabase SQL Editor

-- 1. Atualizar memórias de baixa intensidade (< 7): "Neutro" → "Indefinida"
UPDATE memories
SET emocao_principal = 'Indefinida'
WHERE emocao_principal IN ('Neutro', 'neutro', 'Neutra', 'neutra')
  AND (intensidade IS NULL OR intensidade < 7);

-- 2. Atualizar memórias de alta intensidade (>= 7) com sinais de ansiedade
UPDATE memories
SET emocao_principal = 'Ansiedade'
WHERE emocao_principal IN ('Neutro', 'neutro', 'Neutra', 'neutra')
  AND intensidade >= 7
  AND (
    LOWER(contexto) LIKE '%angust%'
    OR LOWER(contexto) LIKE '%ansied%'
    OR LOWER(contexto) LIKE '%ansios%'
    OR LOWER(contexto) LIKE '%preocup%'
    OR LOWER(resumo_eco) LIKE '%angust%'
    OR LOWER(resumo_eco) LIKE '%ansied%'
    OR 'ansiedade' = ANY(tags)
    OR 'angustia' = ANY(tags)
  );

-- 3. Atualizar memórias de alta intensidade (>= 7) restantes → "Emoção Intensa"
UPDATE memories
SET emocao_principal = 'Emoção Intensa'
WHERE emocao_principal IN ('Neutro', 'neutro', 'Neutra', 'neutra')
  AND intensidade >= 7;

-- 4. Verificar resultados
SELECT
  emocao_principal,
  COUNT(*) as total,
  AVG(intensidade) as intensidade_media,
  MIN(created_at) as mais_antiga,
  MAX(created_at) as mais_recente
FROM memories
WHERE emocao_principal IN ('Neutro', 'Indefinida', 'Ansiedade', 'Emoção Intensa')
GROUP BY emocao_principal
ORDER BY total DESC;

-- Exemplo de saída esperada:
-- emocao_principal | total | intensidade_media | mais_antiga | mais_recente
-- Indefinida       | 5     | 3.2              | 2026-02-01  | 2026-02-13
-- Ansiedade        | 3     | 8.0              | 2026-02-05  | 2026-02-12
-- Emoção Intensa   | 1     | 9.0              | 2026-02-10  | 2026-02-10
-- (Neutro deveria estar com 0 após migração)
