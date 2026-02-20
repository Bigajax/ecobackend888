/**
 * Apply program persistence migration to Supabase
 * Usage: node scripts/apply-migration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

console.log('🔌 Connecting to Supabase...');
console.log('   URL:', SUPABASE_URL);
console.log('');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  try {
    console.log('📄 Reading migration file...\n');

    const migrationPath = path.resolve(__dirname, '../../supabase/migrations/001_create_program_tables.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📊 SQL loaded:', sql.length, 'bytes');
    console.log('📁 From:', migrationPath);
    console.log('');

    console.log('⚠️  IMPORTANT:');
    console.log('   Supabase client cannot execute raw SQL directly.');
    console.log('   You need to run this migration via Supabase Dashboard.\n');

    console.log('📋 Instructions:\n');
    console.log('1. Open: https://supabase.com/dashboard/project/cejiylmomlxnscknustp');
    console.log('2. Go to: SQL Editor (left sidebar)');
    console.log('3. Click: "New Query"');
    console.log('4. Copy the file: supabase/migrations/001_create_program_tables.sql');
    console.log('5. Paste and click: "Run"\n');

    console.log('🔗 Direct link:');
    console.log('   https://supabase.com/dashboard/project/cejiylmomlxnscknustp/sql/new\n');

    // Try to verify if tables already exist
    console.log('🔍 Checking if tables already exist...\n');

    const { data: existingTables, error } = await supabase
      .from('program_enrollments')
      .select('id')
      .limit(1);

    if (error) {
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        console.log('❌ Tables do NOT exist yet. Migration needed.\n');
      } else {
        console.log('⚠️  Could not check tables:', error.message, '\n');
      }
    } else {
      console.log('✅ Tables already exist! Migration may have been applied.\n');
      console.log('📊 Checking existing data...\n');

      const { count } = await supabase
        .from('program_enrollments')
        .select('*', { count: 'exact', head: true });

      console.log('   program_enrollments: ', count || 0, 'records\n');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

runMigration().then(() => {
  console.log('✅ Check complete!\n');
  process.exit(0);
});
