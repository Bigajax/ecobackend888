#!/usr/bin/env node

/**
 * Apply program persistence migration via Supabase REST API
 * Usage: node scripts/run-migration.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Extract project reference from URL
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
  console.error('❌ Invalid SUPABASE_URL format');
  process.exit(1);
}

console.log('🚀 Program Persistence Migration\n');
console.log('📌 Project:', projectRef);
console.log('🔗 URL:', SUPABASE_URL);
console.log('');

// Read migration file
const migrationPath = path.resolve(__dirname, '../../supabase/migrations/001_create_program_tables.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

console.log('📄 Migration loaded:', migrationSQL.length, 'bytes\n');

// Helper to make HTTPS requests
function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null
          });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function checkIfTablesExist() {
  try {
    const response = await makeRequest('GET', '/rest/v1/program_enrollments?limit=0');
    return response.status === 200;
  } catch {
    return false;
  }
}

async function executeSQL(sql) {
  try {
    // Try using postgrest RPC endpoint if available
    const response = await makeRequest('POST', '/rest/v1/rpc/exec_sql', { sql });
    return response;
  } catch (error) {
    return { error };
  }
}

async function main() {
  // Check if tables already exist
  console.log('🔍 Checking if migration already applied...\n');

  const tablesExist = await checkIfTablesExist();

  if (tablesExist) {
    console.log('✅ Tables already exist! Migration may have been applied before.\n');
    console.log('ℹ️  To verify, check your Supabase dashboard:\n');
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/editor\n`);

    console.log('📊 To see data:');
    console.log('   SELECT * FROM program_enrollments LIMIT 5;\n');

    process.exit(0);
  }

  console.log('❌ Tables do NOT exist yet.\n');
  console.log('🔧 Migration needs to be applied via Supabase Dashboard.\n');
  console.log('━'.repeat(70));
  console.log('\n📋 MANUAL STEPS:\n');
  console.log('1. Open this URL in your browser:');
  console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`);

  console.log('2. Copy the entire contents of this file:');
  console.log(`   ${migrationPath}\n`);

  console.log('3. Paste into the SQL Editor and click "Run"\n');

  console.log('4. You should see: "Success. No rows returned"\n');

  console.log('5. Verify tables were created:');
  console.log('   SELECT table_name FROM information_schema.tables');
  console.log('   WHERE table_schema = \'public\' AND table_name LIKE \'program_%\';\n');

  console.log('━'.repeat(70));
  console.log('\n💡 TIP: The SQL file is also available at:');
  console.log('   supabase/migrations/001_create_program_tables.sql\n');

  // Copy SQL to clipboard if possible (Windows)
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      const tempFile = path.join(__dirname, 'temp_migration.sql');
      fs.writeFileSync(tempFile, migrationSQL);
      execSync(`clip < "${tempFile}"`);
      fs.unlinkSync(tempFile);
      console.log('📋 SQL copied to clipboard! Just paste in Supabase.\n');
    } catch (err) {
      // Clipboard copy failed, that's OK
    }
  }

  console.log('After running the migration, run this script again to verify.\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
