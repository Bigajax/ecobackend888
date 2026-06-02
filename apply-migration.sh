#!/bin/bash

# Apply program persistence migration via psql
# This requires direct database access credentials

echo "🚀 Applying Program Persistence Migration"
echo ""

# Check if SQL file exists
MIGRATION_FILE="supabase/migrations/001_create_program_tables.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "📄 Migration file: $MIGRATION_FILE"
echo "📊 Size: $(wc -c < "$MIGRATION_FILE") bytes"
echo ""

# Supabase project details
PROJECT_REF="cejiylmomlxnscknustp"
SUPABASE_URL="https://cejiylmomlxnscknustp.supabase.co"

echo "📌 Project: $PROJECT_REF"
echo "🔗 Supabase URL: $SUPABASE_URL"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  IMPORTANT: Direct database access required"
echo ""
echo "The Supabase JS client cannot execute raw SQL."
echo "You have 3 options:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "OPTION 1: Supabase Dashboard (EASIEST) ⭐"
echo ""
echo "1. Open: https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
echo "2. The SQL is already in your clipboard (Ctrl+V to paste)"
echo "3. Click 'Run'"
echo "4. Verify: SELECT * FROM program_enrollments;"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "OPTION 2: Supabase CLI"
echo ""
echo "If you have supabase CLI installed:"
echo "  cd server"
echo "  supabase db push"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "OPTION 3: Direct psql (Advanced)"
echo ""
echo "If you have database connection string:"
echo "  psql 'postgresql://postgres:[PASSWORD]@db.$PROJECT_REF.supabase.co:5432/postgres' -f $MIGRATION_FILE"
echo ""
echo "Get connection string from:"
echo "  https://supabase.com/dashboard/project/$PROJECT_REF/settings/database"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "After applying, verify with:"
echo "  node scripts/run-migration.js"
echo ""
