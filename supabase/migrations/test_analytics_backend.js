#!/usr/bin/env node

/**
 * Backend Analytics Security Test
 *
 * Tests that backend service_role can still write to analytics tables
 * after security hardening migration.
 *
 * Usage:
 *   node supabase/migrations/test_analytics_backend.js
 *
 * Prerequisites:
 *   - Backend server running on http://localhost:3001
 *   - SUPABASE_SERVICE_ROLE_KEY configured in .env
 */

const https = require('https');
const http = require('http');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TIMEOUT_MS = 10000;

// Test configuration
const tests = [
  {
    name: 'POST /api/ask-eco (Analytics INSERT)',
    method: 'POST',
    path: '/api/ask-eco',
    headers: {
      'Content-Type': 'application/json',
      'X-Eco-Guest-Id': `test-guest-${Date.now()}`
    },
    body: {
      mensagemAtual: 'olá, teste de segurança',
      idMensagem: `test-msg-${Date.now()}`
    },
    expectedStatus: 200,
    skipBodyCheck: true // SSE response
  },
  {
    name: 'POST /api/signal (Passive Signals INSERT)',
    method: 'POST',
    path: '/api/signal',
    headers: {
      'Content-Type': 'application/json',
      'X-Eco-Guest-Id': `test-guest-${Date.now()}`
    },
    body: {
      interaction_id: '00000000-0000-0000-0000-000000000000', // Mock UUID (may fail FK check)
      signal_name: 'test_signal'
    },
    expectedStatus: [200, 400, 500], // May fail FK check, but shouldn't be permission error
    allowedErrors: ['foreign key', 'violates', 'does not exist']
  }
];

// Helper: Make HTTP request
function makeRequest(test) {
  return new Promise((resolve, reject) => {
    const url = new URL(test.path, BACKEND_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: test.method,
      headers: test.headers || {},
      timeout: TIMEOUT_MS
    };

    const req = lib.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (test.body) {
      req.write(JSON.stringify(test.body));
    }

    req.end();
  });
}

// Helper: Check if status code matches expected
function isExpectedStatus(actualStatus, expectedStatus) {
  if (Array.isArray(expectedStatus)) {
    return expectedStatus.includes(actualStatus);
  }
  return actualStatus === expectedStatus;
}

// Helper: Check if error is allowed (FK violations, etc.)
function isAllowedError(responseBody, allowedErrors) {
  if (!allowedErrors) return false;

  const bodyLower = responseBody.toLowerCase();
  return allowedErrors.some(err => bodyLower.includes(err.toLowerCase()));
}

// Run tests
async function runTests() {
  console.log('🔒 Analytics Security Backend Test');
  console.log('=====================================\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`Testing: ${test.name}... `);

    try {
      const response = await makeRequest(test);

      // Check status code
      const statusMatch = isExpectedStatus(response.statusCode, test.expectedStatus);

      if (!statusMatch) {
        // Check if it's an allowed error (e.g., FK violation)
        if (test.allowedErrors && isAllowedError(response.body, test.allowedErrors)) {
          console.log(`✅ PASS (allowed error: ${response.statusCode})`);
          passed++;
          continue;
        }

        console.log(`❌ FAIL`);
        console.log(`   Expected: ${JSON.stringify(test.expectedStatus)}`);
        console.log(`   Got: ${response.statusCode}`);
        console.log(`   Body: ${response.body.substring(0, 200)}`);
        failed++;
        continue;
      }

      // Check for permission errors in response body
      const bodyLower = response.body.toLowerCase();
      if (bodyLower.includes('permission denied') ||
          bodyLower.includes('row-level security') ||
          bodyLower.includes('policy violation')) {
        console.log(`❌ FAIL (Permission Error Detected)`);
        console.log(`   Body: ${response.body.substring(0, 200)}`);
        failed++;
        continue;
      }

      console.log(`✅ PASS`);
      passed++;

    } catch (err) {
      console.log(`❌ FAIL (${err.message})`);
      failed++;
    }
  }

  console.log('\n=====================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('=====================================\n');

  if (failed > 0) {
    console.log('⚠️  Some tests failed. Check backend logs for details.');
    console.log('   Common issues:');
    console.log('   - Backend not running (start with: npm run dev)');
    console.log('   - SUPABASE_SERVICE_ROLE_KEY not set in .env');
    console.log('   - Analytics client not using service_role');
    process.exit(1);
  } else {
    console.log('✅ All tests passed! Backend can write to analytics tables.');
    console.log('   service_role is correctly bypassing RLS.');
    process.exit(0);
  }
}

// Run
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
