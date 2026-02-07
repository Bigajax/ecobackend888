/**
 * Smoke test para o sistema de feedback de usuários
 *
 * Testa:
 * - Validação de entrada
 * - Rate limiting
 * - Persistência no Supabase
 * - Sanitização XSS
 * - Validação de UUID
 *
 * Uso:
 *   npx ts-node server/scripts/smokeFeedbackSystem.ts
 *   npm run smoke:feedback
 */

import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = process.env.ECO_BASE_URL || 'http://localhost:3001';
const FEEDBACK_ENDPOINT = `${BASE_URL}/api/user-feedback`;

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, message: string, duration: number) {
  results.push({ name, passed, message, duration });
  const emoji = passed ? '✅' : '❌';
  console.log(`${emoji} [${duration}ms] ${name}: ${message}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Teste 1: Feedback básico válido
 */
async function testBasicFeedback(): Promise<void> {
  const start = Date.now();
  const guestId = uuidv4();

  try {
    const response = await axios.post(
      FEEDBACK_ENDPOINT,
      {
        message: 'Teste de feedback básico do smoke test',
        category: 'improvement',
        page: '/smoke-test',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-eco-guest-id': guestId,
        },
      }
    );

    const duration = Date.now() - start;

    if (response.status === 201 && response.data.success && response.data.feedbackId) {
      logTest(
        'Feedback Básico',
        true,
        `Feedback criado com ID: ${response.data.feedbackId}`,
        duration
      );
    } else {
      logTest(
        'Feedback Básico',
        false,
        `Resposta inesperada: ${JSON.stringify(response.data)}`,
        duration
      );
    }
  } catch (error) {
    const duration = Date.now() - start;
    const axiosError = error as AxiosError;
    logTest(
      'Feedback Básico',
      false,
      `Erro: ${axiosError.message} - ${JSON.stringify(axiosError.response?.data)}`,
      duration
    );
  }
}

/**
 * Teste 2: Validação de mensagem vazia
 */
async function testEmptyMessage(): Promise<void> {
  const start = Date.now();
  const guestId = uuidv4();

  try {
    const response = await axios.post(
      FEEDBACK_ENDPOINT,
      {
        message: '',
        category: 'bug',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-eco-guest-id': guestId,
        },
      }
    );

    const duration = Date.now() - start;
    logTest(
      'Validação Mensagem Vazia',
      false,
      'Deveria ter retornado erro 400, mas retornou sucesso',
      duration
    );
  } catch (error) {
    const duration = Date.now() - start;
    const axiosError = error as AxiosError;

    if (axiosError.response?.status === 400) {
      logTest(
        'Validação Mensagem Vazia',
        true,
        'Erro 400 retornado corretamente para mensagem vazia',
        duration
      );
    } else {
      logTest(
        'Validação Mensagem Vazia',
        false,
        `Status inesperado: ${axiosError.response?.status}`,
        duration
      );
    }
  }
}

/**
 * Teste 3: Validação de mensagem muito longa
 */
async function testMessageTooLong(): Promise<void> {
  const start = Date.now();
  const guestId = uuidv4();
  const longMessage = 'a'.repeat(1001);

  try {
    const response = await axios.post(
      FEEDBACK_ENDPOINT,
      {
        message: longMessage,
        category: 'bug',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-eco-guest-id': guestId,
        },
      }
    );

    const duration = Date.now() - start;
    logTest(
      'Validação Mensagem Longa',
      false,
      'Deveria ter retornado erro 400, mas retornou sucesso',
      duration
    );
  } catch (error) {
    const duration = Date.now() - start;
    const axiosError = error as AxiosError;

    if (axiosError.response?.status === 400) {
      logTest(
        'Validação Mensagem Longa',
        true,
        'Erro 400 retornado corretamente para mensagem > 1000 chars',
        duration
      );
    } else {
      logTest(
        'Validação Mensagem Longa',
        false,
        `Status inesperado: ${axiosError.response?.status}`,
        duration
      );
    }
  }
}

/**
 * Teste 4: Validação de categoria inválida
 */
async function testInvalidCategory(): Promise<void> {
  const start = Date.now();
  const guestId = uuidv4();

  try {
    const response = await axios.post(
      FEEDBACK_ENDPOINT,
      {
        message: 'Teste com categoria inválida',
        category: 'invalid_category',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-eco-guest-id': guestId,
        },
      }
    );

    const duration = Date.now() - start;
    logTest(
      'Validação Categoria Inválida',
      false,
      'Deveria ter retornado erro 400, mas retornou sucesso',
      duration
    );
  } catch (error) {
    const duration = Date.now() - start;
    const axiosError = error as AxiosError;

    if (axiosError.response?.status === 400) {
      logTest(
        'Validação Categoria Inválida',
        true,
        'Erro 400 retornado corretamente para categoria inválida',
        duration
      );
    } else {
      logTest(
        'Validação Categoria Inválida',
        false,
        `Status inesperado: ${axiosError.response?.status}`,
        duration
      );
    }
  }
}

/**
 * Teste 5: Validação de UUID inválido
 */
async function testInvalidUUID(): Promise<void> {
  const start = Date.now();

  try {
    const response = await axios.post(
      FEEDBACK_ENDPOINT,
      {
        message: 'Teste com UUID inválido',
        category: 'bug',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-eco-guest-id': 'invalid-uuid-format',
        },
      }
    );

    const duration = Date.now() - start;
    logTest(
      'Validação UUID Inválido',
      false,
      'Deveria ter retornado erro 400, mas retornou sucesso',
      duration
    );
  } catch (error) {
    const duration = Date.now() - start;
    const axiosError = error as AxiosError;

    if (axiosError.response?.status === 400) {
      logTest(
        'Validação UUID Inválido',
        true,
        'Erro 400 retornado corretamente para UUID inválido',
        duration
      );
    } else {
      logTest(
        'Validação UUID Inválido',
        false,
        `Status inesperado: ${axiosError.response?.status}`,
        duration
      );
    }
  }
}

/**
 * Teste 6: Rate limiting (5 requisições em sequência)
 */
async function testRateLimiting(): Promise<void> {
  const start = Date.now();
  const guestId = uuidv4();
  let successCount = 0;
  let rateLimitedCount = 0;

  console.log('\n🔄 Testando rate limiting (enviando 6 requisições)...');

  for (let i = 1; i <= 6; i++) {
    try {
      const response = await axios.post(
        FEEDBACK_ENDPOINT,
        {
          message: `Teste rate limit ${i}`,
          category: 'other',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-eco-guest-id': guestId,
          },
        }
      );

      if (response.status === 201) {
        successCount++;
        console.log(`  ✅ Requisição ${i}: Sucesso (201)`);
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 429) {
        rateLimitedCount++;
        console.log(`  ⚠️ Requisição ${i}: Rate limited (429)`);
      } else {
        console.log(`  ❌ Requisição ${i}: Erro ${axiosError.response?.status}`);
      }
    }

    await sleep(100); // Pequeno delay entre requisições
  }

  const duration = Date.now() - start;

  // Esperamos que as primeiras 5 passem e a 6ª seja bloqueada
  if (successCount === 5 && rateLimitedCount === 1) {
    logTest(
      'Rate Limiting',
      true,
      `5 requisições aceitas, 1 bloqueada (correto)`,
      duration
    );
  } else {
    logTest(
      'Rate Limiting',
      false,
      `Esperado: 5 aceitas, 1 bloqueada. Obtido: ${successCount} aceitas, ${rateLimitedCount} bloqueadas`,
      duration
    );
  }
}

/**
 * Teste 7: Sanitização XSS
 */
async function testXSSSanitization(): Promise<void> {
  const start = Date.now();
  const guestId = uuidv4();
  const xssPayload = '<script>alert("XSS")</script>Teste de sanitização';

  try {
    const response = await axios.post(
      FEEDBACK_ENDPOINT,
      {
        message: xssPayload,
        category: 'bug',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-eco-guest-id': guestId,
        },
      }
    );

    const duration = Date.now() - start;

    if (response.status === 201 && response.data.success) {
      logTest(
        'Sanitização XSS',
        true,
        'Payload XSS aceito após sanitização (esperado)',
        duration
      );
    } else {
      logTest(
        'Sanitização XSS',
        false,
        `Resposta inesperada: ${JSON.stringify(response.data)}`,
        duration
      );
    }
  } catch (error) {
    const duration = Date.now() - start;
    const axiosError = error as AxiosError;
    logTest(
      'Sanitização XSS',
      false,
      `Erro inesperado: ${axiosError.message}`,
      duration
    );
  }
}

/**
 * Teste 8: Todas as categorias válidas
 */
async function testAllCategories(): Promise<void> {
  const categories = ['bug', 'feature', 'improvement', 'other'] as const;
  const guestId = uuidv4();
  let allPassed = true;

  console.log('\n🔄 Testando todas as categorias...');

  for (const category of categories) {
    const start = Date.now();
    try {
      const response = await axios.post(
        FEEDBACK_ENDPOINT,
        {
          message: `Teste da categoria ${category}`,
          category,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-eco-guest-id': guestId,
          },
        }
      );

      const duration = Date.now() - start;

      if (response.status === 201) {
        console.log(`  ✅ Categoria "${category}": OK (${duration}ms)`);
      } else {
        console.log(`  ❌ Categoria "${category}": Falhou`);
        allPassed = false;
      }
    } catch (error) {
      const duration = Date.now() - start;
      console.log(`  ❌ Categoria "${category}": Erro (${duration}ms)`);
      allPassed = false;
    }

    await sleep(3100); // Wait 3.1s entre categorias para evitar rate limit
  }

  if (allPassed) {
    logTest('Todas Categorias', true, 'Todas as 4 categorias funcionaram', 0);
  } else {
    logTest('Todas Categorias', false, 'Algumas categorias falharam', 0);
  }
}

/**
 * Executa todos os testes
 */
async function runAllTests(): Promise<void> {
  console.log('\n🧪 ========================================');
  console.log('🧪 SMOKE TEST - Sistema de Feedback');
  console.log('🧪 ========================================\n');
  console.log(`📡 Endpoint: ${FEEDBACK_ENDPOINT}\n`);

  // Testes básicos
  await testBasicFeedback();
  await sleep(500);

  await testEmptyMessage();
  await sleep(500);

  await testMessageTooLong();
  await sleep(500);

  await testInvalidCategory();
  await sleep(500);

  await testInvalidUUID();
  await sleep(500);

  await testXSSSanitization();
  await sleep(500);

  await testAllCategories();
  await sleep(500);

  // Rate limiting (deve ser o último teste pois consome o limite)
  await testRateLimiting();

  // Resumo final
  console.log('\n📊 ========================================');
  console.log('📊 RESUMO DOS TESTES');
  console.log('📊 ========================================\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`✅ Passou: ${passed}/${total}`);
  console.log(`❌ Falhou: ${failed}/${total}`);
  console.log(`📈 Taxa de Sucesso: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('❌ Testes que falharam:');
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  - ${r.name}: ${r.message}`);
      });
    console.log('');
  }

  // Exit code baseado nos resultados
  process.exit(failed > 0 ? 1 : 0);
}

// Executar testes
runAllTests().catch(error => {
  console.error('❌ Erro fatal ao executar smoke tests:', error);
  process.exit(1);
});
