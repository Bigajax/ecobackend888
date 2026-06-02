-- Verificar se ainda existem memórias "Neutro" no banco

SELECT
  id,
  emocao_principal,
  intensidade,
  created_at,
  salvar_memoria,
  contexto
FROM memories
WHERE emocao_principal IN ('Neutro', 'neutro', 'Neutra', 'neutra')
ORDER BY created_at DESC
LIMIT 20;

-- Contar total
SELECT COUNT(*) as total_neutro
FROM memories
WHERE emocao_principal IN ('Neutro', 'neutro', 'Neutra', 'neutra');
