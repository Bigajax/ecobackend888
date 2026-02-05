# Database Migrations

This directory contains SQL migration files for the ECO backend database.

## Running Migrations

### Option 1: Using Supabase CLI (Recommended)
```bash
# If you have supabase CLI installed
supabase db push
```

### Option 2: Manual SQL Execution
1. Open your Supabase dashboard
2. Go to SQL Editor
3. Copy and paste the migration file content
4. Execute the SQL

### Option 3: Using psql
```bash
# If you have direct database access
psql -h <host> -U <user> -d <database> -f migrations/001_create_program_tables.sql
```

## Migration Files

- `001_create_program_tables.sql` - Creates tables for program enrollment system
  - `program_enrollments` - Tracks user enrollments in programs
  - `program_step_answers` - Stores user answers for each step
  - `program_ai_feedback` - Stores AI-generated feedback (optional)

## Rollback

To rollback this migration, execute:

```sql
-- Drop tables in reverse order (respects foreign keys)
DROP TABLE IF EXISTS program_ai_feedback CASCADE;
DROP TABLE IF EXISTS program_step_answers CASCADE;
DROP TABLE IF EXISTS program_enrollments CASCADE;
```

## Testing

After running the migration, verify with:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'program_%';

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'program_%';

-- Check policies exist
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'program_%';
```
