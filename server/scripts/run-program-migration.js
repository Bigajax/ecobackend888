/**
 * Script to apply program persistence migration
 * Run with: node scripts/run-program-migration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

// Create Supabase client with service role (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('🚀 Starting program persistence migration...\n');

  try {
    // Read the migration file
    const migrationPath = path.resolve(__dirname, '../../supabase/migrations/001_create_program_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Migration file loaded:', migrationPath);
    console.log('📊 SQL size:', migrationSQL.length, 'bytes\n');

    // Split SQL into individual statements (ignore comments)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    console.log('📝 Found', statements.length, 'SQL statements to execute\n');

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';

      // Skip comment blocks
      if (statement.includes('/*') || statement.includes('*/')) {
        continue;
      }

      try {
        // Extract a short description for logging
        let description = statement.substring(0, 60).replace(/\s+/g, ' ');
        if (statement.includes('CREATE TABLE')) {
          const match = statement.match(/CREATE TABLE[^(]*\s+(\w+)/i);
          description = match ? `CREATE TABLE ${match[1]}` : description;
        } else if (statement.includes('CREATE INDEX')) {
          const match = statement.match(/CREATE INDEX[^(]*\s+(\w+)/i);
          description = match ? `CREATE INDEX ${match[1]}` : description;
        } else if (statement.includes('CREATE POLICY')) {
          const match = statement.match(/CREATE POLICY\s+"([^"]+)"/i);
          description = match ? `CREATE POLICY "${match[1]}"` : description;
        } else if (statement.includes('ALTER TABLE')) {
          const match = statement.match(/ALTER TABLE\s+(\w+)/i);
          description = match ? `ALTER TABLE ${match[1]}` : description;
        } else if (statement.includes('COMMENT ON')) {
          description = 'COMMENT ON...';
        }

        process.stdout.write(`  [${i + 1}/${statements.length}] ${description}... `);

        const { error } = await supabase.rpc('exec_sql', { sql: statement });

        if (error) {
          // Try direct query if RPC fails
          const { error: directError } = await supabase.from('_').select('*').limit(0);

          // Some statements might fail if already exist, that's OK
          if (error.message.includes('already exists') ||
              error.message.includes('duplicate')) {
            console.log('⚠️  (already exists)');
            successCount++;
          } else {
            console.log('❌');
            console.error('    Error:', error.message);
            errorCount++;
          }
        } else {
          console.log('✅');
          successCount++;
        }
      } catch (err) {
        console.log('❌');
        console.error('    Unexpected error:', err.message);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    // Verify tables were created
    console.log('🔍 Verifying tables...\n');

    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .like('table_name', 'program_%');

    if (tablesError) {
      console.error('❌ Could not verify tables:', tablesError.message);
    } else {
      console.log('📋 Tables created:');
      tables.forEach(t => console.log(`   - ${t.table_name}`));
      console.log('');
    }

    // Check RLS
    console.log('🔒 Checking Row Level Security...\n');

    const { data: rlsStatus, error: rlsError } = await supabase
      .from('pg_tables')
      .select('tablename, rowsecurity')
      .eq('schemaname', 'public')
      .like('tablename', 'program_%');

    if (rlsError) {
      console.error('❌ Could not check RLS:', rlsError.message);
    } else {
      console.log('🔒 RLS Status:');
      rlsStatus.forEach(t => {
        const status = t.rowsecurity ? '✅' : '❌';
        console.log(`   ${status} ${t.tablename}: ${t.rowsecurity ? 'ENABLED' : 'DISABLED'}`);
      });
      console.log('');
    }

    console.log('✨ Migration complete!\n');

    if (errorCount > 0) {
      console.log('⚠️  Some statements had errors. This might be OK if tables already exist.');
      console.log('   Check the errors above to confirm.\n');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the migration
runMigration().then(() => {
  console.log('✅ Done!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
