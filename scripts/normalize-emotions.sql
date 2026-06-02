-- Normalizar emoções para padrão consistente

-- 1. Normalizar case inconsistente
UPDATE memories SET emocao_principal = 'Ansiedade' WHERE LOWER(emocao_principal) = 'ansiedade';
UPDATE memories SET emocao_principal = 'Indefinida' WHERE LOWER(emocao_principal) = 'indefinida';
UPDATE memories SET emocao_principal = 'Cansaço' WHERE LOWER(emocao_principal) = 'cansaço';
UPDATE memories SET emocao_principal = 'Frustração' WHERE LOWER(emocao_principal) = 'frustração';
UPDATE memories SET emocao_principal = 'Tristeza' WHERE LOWER(emocao_principal) = 'tristeza';
UPDATE memories SET emocao_principal = 'Medo' WHERE LOWER(emocao_principal) = 'medo';
UPDATE memories SET emocao_principal = 'Insegurança' WHERE LOWER(emocao_principal) IN ('insegurança', 'inseguranca');
UPDATE memories SET emocao_principal = 'Confusão' WHERE LOWER(emocao_principal) = 'confusão';
UPDATE memories SET emocao_principal = 'Solidão' WHERE LOWER(emocao_principal) = 'solidão';
UPDATE memories SET emocao_principal = 'Esperança' WHERE LOWER(emocao_principal) = 'esperança';
UPDATE memories SET emocao_principal = 'Felicidade' WHERE LOWER(emocao_principal) = 'felicidade';
UPDATE memories SET emocao_principal = 'Alegria' WHERE LOWER(emocao_principal) = 'alegria';
UPDATE memories SET emocao_principal = 'Calma' WHERE LOWER(emocao_principal) = 'calma';

-- 2. Agrupar variações de "medo"
UPDATE memories SET emocao_principal = 'Medo'
WHERE emocao_principal IN (
  'medo de falhar', 'medo de rejeição', 'medo de ser abandonado',
  'receio', 'apreensão'
);

-- 3. Agrupar variações de "cansaço"
UPDATE memories SET emocao_principal = 'Cansaço'
WHERE emocao_principal IN (
  'cansaço profundo', 'cansaço pesado', 'cansaço e frustração',
  'exaustão', 'esgotamento', 'desgaste', 'desgaste emocional'
);

-- 4. Agrupar variações de "ansiedade"
UPDATE memories SET emocao_principal = 'Ansiedade'
WHERE emocao_principal IN (
  'nervosismo', 'inquietação', 'pressão', 'pressão interna',
  'pressão/ansiedade', 'sobrecarga', 'angústia', 'ansioso',
  'apreensão', 'tensão'
);

-- 5. Agrupar variações de "conflito"
UPDATE memories SET emocao_principal = 'Conflito'
WHERE emocao_principal IN (
  'conflito interno', 'conflito_interno', 'conflito relacional',
  'ambivalência', 'dualidade', 'paradoxo emocional'
);

-- 6. Agrupar variações de "tristeza"
UPDATE memories SET emocao_principal = 'Tristeza'
WHERE emocao_principal IN (
  'desânimo', 'desesperança', 'desespero', 'sofrimento',
  'tristeza e vazio', 'melancolia', 'luto', 'dor'
);

-- 7. Agrupar variações de "vazio"
UPDATE memories SET emocao_principal = 'Vazio'
WHERE emocao_principal IN (
  'solidão', 'desconexão', 'não pertencimento', 'abandono',
  'sentimento de vazio/não reconhecimento'
);

-- 8. Agrupar variações de "culpa"
UPDATE memories SET emocao_principal = 'Culpa'
WHERE emocao_principal IN (
  'vergonha', 'arrependimento', 'autocrítica'
);

-- 9. Agrupar variações de "insegurança"
UPDATE memories SET emocao_principal = 'Insegurança'
WHERE emocao_principal IN (
  'dúvida', 'incerteza', 'inadequação', 'insuficiência',
  'vulnerabilidade', 'desconfiança', 'impotência'
);

-- 10. Agrupar variações de "alegria/felicidade"
UPDATE memories SET emocao_principal = 'Alegria'
WHERE emocao_principal IN (
  'felicidade', 'entusiasmo', 'empolgação', 'euforia',
  'energia/euforia', 'energizado', 'excitação'
);

-- 11. Agrupar variações de "satisfação"
UPDATE memories SET emocao_principal = 'Satisfação'
WHERE emocao_principal IN (
  'realização', 'gratificação', 'orgulho', 'plenitude',
  'bem-estar', 'paz', 'serenidade', 'tranquilidade'
);

-- 12. Agrupar variações de "alívio"
UPDATE memories SET emocao_principal = 'Alívio'
WHERE emocao_principal IN (
  'leveza', 'renovação', 'libertação', 'superação'
);

-- 13. Agrupar variações de "desejo"
UPDATE memories SET emocao_principal = 'Desejo'
WHERE emocao_principal IN (
  'anseio', 'expectativa', 'tesão', 'paixão',
  'desejo intenso', 'carência', 'carência afetiva e desejo de fusão'
);

-- 14. Agrupar emoções existenciais/filosóficas em "Reflexão"
UPDATE memories SET emocao_principal = 'Reflexão'
WHERE emocao_principal IN (
  'introspecção', 'contemplação', 'reflexão', 'reflexão/existencial',
  'busca por significado', 'busca espiritual', 'estranhamento existencial',
  'desorientação existencial'
);

-- 15. Remover emoções compostas muito específicas -> agrupar como primeira palavra
UPDATE memories SET emocao_principal = 'Desejo'
WHERE emocao_principal LIKE 'desejo de %';

UPDATE memories SET emocao_principal = 'Necessidade'
WHERE emocao_principal LIKE 'necessidade de %';

UPDATE memories SET emocao_principal = 'Sentimento'
WHERE emocao_principal LIKE 'sentimento de %';

-- 16. Verificar resultado final
SELECT
  emocao_principal,
  COUNT(*) as total,
  ROUND(AVG(intensidade), 1) as intensidade_media
FROM memories
GROUP BY emocao_principal
HAVING COUNT(*) >= 3
ORDER BY total DESC;
