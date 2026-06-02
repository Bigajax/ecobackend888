-- Script para verificar a estrutura ATUAL da tabela bandit_rewards

-- 1. Ver todas as colunas da tabela
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'analytics'
  AND table_name = 'bandit_rewards'
ORDER BY ordinal_position;

-- 2. Ver todos os constraints (CHECK, UNIQUE, etc)
SELECT
  constraint_name,
  constraint_type,
  table_name
FROM information_schema.table_constraints
WHERE table_schema = 'analytics'
  AND table_name = 'bandit_rewards';

-- 3. Ver detalhes de CHECK constraints especificamente
SELECT
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'analytics'
  AND constraint_name LIKE '%bandit_rewards%';

-- 4. Ver todos os indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'analytics'
  AND tablename = 'bandit_rewards'
ORDER BY indexname;

-- 5. Ver quantos registros existem (para saber se tem dados importantes)
SELECT COUNT(*) as total_records FROM analytics.bandit_rewards;

-- 6. Ver uma amostra dos dados (se houver)
SELECT * FROM analytics.bandit_rewards LIMIT 5;

-- 7. Ver o schema completo em um resumo
SELECT
  'bandit_rewards' as table_name,
  (SELECT json_agg(json_build_object('column', column_name, 'type', data_type))
   FROM information_schema.columns
   WHERE table_schema = 'analytics' AND table_name = 'bandit_rewards'
  ) as columns,
  (SELECT COUNT(*) FROM analytics.bandit_rewards) as row_count;
