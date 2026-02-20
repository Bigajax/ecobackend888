-- Migrar memórias "Neutro" para emoções válidas

-- Passo 1: Baixa intensidade -> Indefinida
UPDATE memories
SET emocao_principal = 'Indefinida'
WHERE emocao_principal IN ('Neutro', 'neutro', 'Neutra', 'neutra')
  AND (intensidade IS NULL OR intensidade < 7);

-- Passo 2: Alta intensidade com ansiedade -> Ansiedade
UPDATE memories
SET emocao_principal = 'Ansiedade'
WHERE emocao_principal IN ('Neutro', 'neutro', 'Neutra', 'neutra')
  AND intensidade >= 7
  AND (
    LOWER(contexto) LIKE '%angust%' OR
    LOWER(contexto) LIKE '%ansied%' OR
    LOWER(contexto) LIKE '%ansios%' OR
    LOWER(contexto) LIKE '%preocup%' OR
    LOWER(resumo_eco) LIKE '%angust%' OR
    LOWER(resumo_eco) LIKE '%ansied%'
  );

-- Passo 3: Alta intensidade restante -> Emoção Intensa
UPDATE memories
SET emocao_principal = 'Emoção Intensa'
WHERE emocao_principal IN ('Neutro', 'neutro', 'Neutra', 'neutra')
  AND intensidade >= 7;

-- Verificar resultados
SELECT emocao_principal, COUNT(*) as total
FROM memories
GROUP BY emocao_principal
ORDER BY total DESC;
