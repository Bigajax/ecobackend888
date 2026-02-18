-- Normalizar TODAS as emoções para Title Case (primeira letra maiúscula)

-- Normalizar emoções restantes
UPDATE memories SET emocao_principal = 'Curiosidade' WHERE LOWER(emocao_principal) = 'curiosidade';
UPDATE memories SET emocao_principal = 'Alívio' WHERE LOWER(emocao_principal) = 'alívio';
UPDATE memories SET emocao_principal = 'Satisfação' WHERE LOWER(emocao_principal) = 'satisfação';
UPDATE memories SET emocao_principal = 'Determinação' WHERE LOWER(emocao_principal) = 'determinação';
UPDATE memories SET emocao_principal = 'Desejo' WHERE LOWER(emocao_principal) = 'desejo';
UPDATE memories SET emocao_principal = 'Vazio' WHERE LOWER(emocao_principal) = 'vazio';
UPDATE memories SET emocao_principal = 'Preocupação' WHERE LOWER(emocao_principal) = 'preocupação';
UPDATE memories SET emocao_principal = 'Coragem' WHERE LOWER(emocao_principal) = 'coragem';
UPDATE memories SET emocao_principal = 'Culpa' WHERE LOWER(emocao_principal) = 'culpa';
UPDATE memories SET emocao_principal = 'Conflito' WHERE LOWER(emocao_principal) = 'conflito';
UPDATE memories SET emocao_principal = 'Saudade' WHERE LOWER(emocao_principal) = 'saudade';
UPDATE memories SET emocao_principal = 'Confiança' WHERE LOWER(emocao_principal) = 'confiança';
UPDATE memories SET emocao_principal = 'Acolhimento' WHERE LOWER(emocao_principal) = 'acolhimento';
UPDATE memories SET emocao_principal = 'Inspiração' WHERE LOWER(emocao_principal) = 'inspiração';
UPDATE memories SET emocao_principal = 'Sufocamento' WHERE LOWER(emocao_principal) = 'sufocamento';
UPDATE memories SET emocao_principal = 'Peso' WHERE LOWER(emocao_principal) = 'peso';

-- Consolidar emoções que deveriam ser únicas
UPDATE memories SET emocao_principal = 'Ansiedade' WHERE emocao_principal = 'Preocupação';
UPDATE memories SET emocao_principal = 'Cansaço' WHERE emocao_principal = 'Peso';
UPDATE memories SET emocao_principal = 'Ansiedade' WHERE emocao_principal = 'Sufocamento';

-- Verificar resultado final - TOP 20 emoções
SELECT
  emocao_principal,
  COUNT(*) as total,
  ROUND(AVG(intensidade), 1) as intensidade_media,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as percentual
FROM memories
WHERE intensidade >= 5
GROUP BY emocao_principal
ORDER BY total DESC
LIMIT 20;
