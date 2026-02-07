# 🔧 Como Aplicar a Migration do Meditation Feedback

## Passo a Passo

### 1. Abra o Supabase Dashboard
- Acesse seu projeto no Supabase
- Vá em **SQL Editor** (ícone de banco de dados no menu lateral)

### 2. Execute a Migration
- Clique em **"New Query"**
- Copie **TODO** o conteúdo do arquivo `MIGRAR_MEDITATION_FEEDBACK_PARA_ANALYTICS.sql`
- Cole no editor SQL
- Clique em **RUN** (ou pressione Ctrl+Enter)

### 3. Verifique o Resultado
Você verá mensagens como:
```
NOTICE: Backup criado com 0 registros
NOTICE: Dados restaurados: 0 registros em analytics.meditation_feedback
NOTICE: ✅ SUCESSO! Tabela analytics.meditation_feedback criada com 0 registros
```

### 4. Confirme a Migração
Execute este query para confirmar:
```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_name = 'meditation_feedback';
```

**Resultado esperado:**
```
table_schema | table_name
-------------+--------------------
analytics    | meditation_feedback
```

### 5. Teste o Feedback
- Reinicie o backend (se estiver rodando)
- Complete uma meditação no frontend
- Envie o feedback
- Verifique no Supabase: `Table Editor` → Schema: `analytics` → `meditation_feedback`

## O que a Migration Faz

✅ Faz backup dos dados existentes (se houver)
✅ Remove a tabela antiga do schema `public`
✅ Cria a tabela no schema `analytics` correto
✅ Restaura os dados
✅ Cria todos os índices
✅ Configura RLS policies
✅ Adiciona permissões para service_role
✅ Valida que tudo funcionou

## Troubleshooting

### Erro: "permission denied for schema analytics"
**Solução:** Execute primeiro:
```sql
CREATE SCHEMA IF NOT EXISTS analytics;
GRANT USAGE ON SCHEMA analytics TO service_role;
```

### Erro: "relation already exists"
**Solução:** A tabela já existe no analytics. Você pode:
1. Dropar manualmente: `DROP TABLE analytics.meditation_feedback CASCADE;`
2. Executar a migration novamente

### Verificar se deu certo
```sql
-- Ver estrutura da tabela
\d analytics.meditation_feedback

-- Ver políticas RLS
SELECT * FROM pg_policies WHERE tablename = 'meditation_feedback';

-- Ver permissões
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'analytics'
AND table_name = 'meditation_feedback';
```

## Após Aplicar

Não precisa alterar nada no código backend! O controller já está usando `getAnalyticsClient()` que aponta para o schema `analytics`.

Agora o feedback será salvo corretamente! 🎉
