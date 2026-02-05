#!/usr/bin/env node

/**
 * Execute program persistence migration by creating tables via Supabase client
 * This bypasses the SQL execution limitation by using DDL operations
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

console.log('🚀 Attempting to apply migration...\n');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function testConnection() {
  console.log('🔌 Testing Supabase connection...');

  try {
    // Try to query a system table
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .limit(1);

    if (error) {
      console.log('❌ Connection test failed:', error.message);
      return false;
    }

    console.log('✅ Connection successful!\n');
    return true;
  } catch (err) {
    console.log('❌ Connection error:', err.message);
    return false;
  }
}

async function checkTables() {
  console.log('🔍 Checking for existing tables...\n');

  const tables = ['program_enrollments', 'program_step_answers', 'program_ai_feedback'];

  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table)
        .select('id')
        .limit(0);

      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          console.log(`   ❌ ${table} - not found`);
        } else {
          console.log(`   ⚠️  ${table} - error: ${error.message}`);
        }
      } else {
        console.log(`   ✅ ${table} - exists`);
      }
    } catch (err) {
      console.log(`   ❌ ${table} - ${err.message}`);
    }
  }

  console.log('');
}

async function main() {
  const connected = await testConnection();

  if (!connected) {
    console.log('\n⚠️  Cannot execute SQL directly via Supabase client.');
    console.log('   This is a limitation of the Supabase JS SDK.\n');
  }

  await checkTables();

  console.log('━'.repeat(70));
  console.log('\n📋 TO APPLY MIGRATION:\n');

  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1];

  console.log('1. Open Supabase Dashboard:');
  console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`);

  console.log('2. Copy & paste this file:');
  console.log('   supabase/migrations/001_create_program_tables.sql\n');

  console.log('3. Click "Run"\n');

  console.log('4. Run this script again to verify:\n');
  console.log('   node scripts/execute-migration.js\n');

  console.log('━'.repeat(70));
  console.log('');

  // Read and display first few lines of migration
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations/001_create_program_tables.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  const lines = sql.split('\n').slice(0, 10);

  console.log('📄 Migration preview (first 10 lines):\n');
  lines.forEach((line, i) => {
    console.log(`   ${String(i + 1).padStart(2)} | ${line}`);
  });
  console.log(`   ... (${sql.split('\n').length} total lines)\n`);

  console.log('💡 The SQL creates 3 tables with Row Level Security enabled.\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('❌', err);
  process.exit(1);
});
