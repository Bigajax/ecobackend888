# Aplicar Migração de Meditation Feedback

## Via Supabase Dashboard

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Navegue até: **SQL Editor** (menu lateral)
4. Clique em "New query"
5. Copie e cole o conteúdo de: `supabase/migrations/20251219_create_meditation_feedback_table.sql`
6. Clique em "Run" para executar

## Via Supabase CLI (Projeto Local)

Se você tiver o Supabase CLI configurado e conectado ao projeto:

```bash
# Conectar ao projeto (se ainda não conectado)
npx supabase link --project-ref SEU_PROJECT_REF

# Aplicar todas as migrações pendentes
npx supabase db push

# OU aplicar apenas esta migração específica
npx supabase db push --dry-run  # Preview primeiro
npx supabase db push
```

## Verificar se a Migração Foi Aplicada

Execute este SQL no Supabase SQL Editor:

```sql
-- Verificar se a tabela existe
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'meditation_feedback';

-- Verificar estrutura da tabela
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'meditation_feedback'
ORDER BY ordinal_position;

-- Verificar políticas RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'meditation_feedback';

-- Verificar índices
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'meditation_feedback';
```

## Troubleshooting

### Erro: "function update_updated_at_column already exists"
Isso é normal se você já tiver outras tabelas com triggers similar. A migração usa `CREATE OR REPLACE FUNCTION` então não deve dar erro.

### Erro: "relation meditation_feedback already exists"
A tabela já foi criada anteriormente. Use `DROP TABLE meditation_feedback CASCADE;` com cuidado se precisar recriar.

### Erro de Permissões
Certifique-se de estar usando uma conta com permissões de admin no projeto Supabase.
