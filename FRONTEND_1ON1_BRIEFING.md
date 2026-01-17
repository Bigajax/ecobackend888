# 🎤 SSE Backend - Briefing para Frontend (1 on 1)

## Intro

Hey! Fiz algumas melhorias importantes no SSE do `/api/ask-eco`. Nada quebra o que vocês têm hoje, mas preciso de uma pequena mudança no frontend para ficarem bulletproof. Deixe-me explicar:

---

## 📺 O Problema que Tínhamos

### Sintomas que vocês provavelmente viram:
```
❌ "ready_timeout" - conexão SSE demora pra ficar ready
❌ "5s sem chunks" - parece que travou, mas backend tá mandando dados
❌ Duplicated streams - cliente manda 2 mensagens rápido, bagunça tudo
❌ Chunks chegando DEPOIS do "done" poluindo a resposta
```

### Por quê acontecia?
1. **Prompt ready emitido DUAS vezes** (uma sem streamId, outra com)
2. **Sem forma de o frontend saber qual stream é qual** (sem streamId consistente)
3. **Heartbeat às vezes falhava** (não prevenia timeout)
4. **Impossível filtrar eventos órfãos** (de streams antigos)

---

## ✅ O Que Eu Fixei

### 1️⃣ Removi Duplicação
```
ANTES:
  event: prompt_ready (SEM streamId) ❌
  event: stream_metadata (com streamId) ❌
  event: prompt_ready AGAIN (com streamId) ❌ ← Duplicate!

DEPOIS:
  event: control (name: "prompt_ready", com streamId) ✅
  (uma única, correta, completa)
```

### 2️⃣ Todos os Eventos Agora Têm streamId
```json
{
  "type": "prompt_ready",
  "streamId": "550e8400-e29b-41d4-a716-446655440000",
  "client_message_id": "...",
  "at": 1699564800000
}
```

**Todos os tipos têm isso agora:**
- ✅ prompt_ready
- ✅ chunk
- ✅ done
- ✅ memory_saved
- ✅ error

### 3️⃣ Heartbeat Funcionando Corretamente
```
A cada 12 segundos:
  :keepalive

Isso mantém a conexão viva mesmo durante
processamento longo do LLM (>30s)
```

### 4️⃣ Headers Sem Buffer
```
X-Accel-Buffering: no
Cache-Control: no-cache, no-transform
```
Isso garante que proxy (Nginx, Cloudflare) não bufferiza os chunks.

---

## 🎯 O Que Vocês Precisam Fazer

### Mudança Mínima - Só Isso:

**Capturar o streamId e filtrar eventos:**

```typescript
// 1. Captura streamId da response header
const streamId = response.headers.get('x-stream-id');
console.log('Stream ID:', streamId);

// 2. Quando receber um evento SSE:
eventSource.addEventListener('chunk', (event) => {
  const data = JSON.parse(event.data);

  // NOVO: Ignora eventos de streams antigos/órfãos
  if (data.streamId !== streamId) {
    console.warn('Ignorando evento de stream antigo:', data.streamId);
    return;
  }

  // Processa normalmente
  handleChunk(data);
});
```

### Por quê?
Quando o usuário manda 2 mensagens rapidamente:
- Primeira stream começa
- Segunda stream chega e substitui a primeira
- Primeira stream recebe: `finish_reason: "replaced_by_new_stream"`
- Eventos da primeira podem chegar depois do "done" da segunda

**Com streamId, você ignora os eventos "atrasados" da primeira.**

---

## 💻 Exemplo Prático - Antes vs Depois

### ANTES (problemático)
```typescript
async function sendMessage(message: string) {
  const response = await fetch('/api/ask-eco', {
    method: 'POST',
    body: JSON.stringify({ message })
  });

  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = new TextDecoder().decode(value);
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));

        // ❌ PROBLEMA: Recebe eventos de streams antigos
        // ❌ Se mandar 2 mensagens rápido, chunks se misturam
        handleEvent(event);
      }
    }
  }
}
```

### DEPOIS (robusto)
```typescript
async function sendMessage(message: string) {
  const response = await fetch('/api/ask-eco', {
    method: 'POST',
    body: JSON.stringify({ message })
  });

  // ✅ NOVO: Captura streamId
  const streamId = response.headers.get('x-stream-id');
  if (!streamId) {
    throw new Error('Server did not provide streamId');
  }

  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = new TextDecoder().decode(value);
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));

        // ✅ NOVO: Filtra por streamId
        if (event.streamId !== streamId) {
          console.debug('Ignorando evento de stream antigo');
          return;
        }

        handleEvent(event);
      }
    }
  }
}
```

---

## 🧪 Como Testar

### Teste 1: Verificar que é Uma Única prompt_ready
```bash
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message":"Hi","clientMessageId":"test"}' \
  --no-buffer 2>&1 | grep -c "prompt_ready"
```
**Esperado**: `1` (somente uma)

### Teste 2: Verificar streamId no Header
```bash
curl -i -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message":"Hi","clientMessageId":"test"}' 2>&1 | grep x-stream-id
```
**Esperado**:
```
x-stream-id: 550e8400-e29b-41d4-a716-446655440000
```

### Teste 3: Verificar streamId em Todos os Eventos
```bash
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -d '{"message":"Hi","clientMessageId":"test"}' \
  --no-buffer 2>&1 | grep -o '"streamId"' | wc -l
```
**Esperado**: Muitos matches (múltiplos eventos com streamId)

### Teste 4: Testar Duplicate Streams
```bash
# Manda 2 mensagens rápido no frontend
1. Clica em "enviar" com "Mensagem 1"
2. Imediatamente (antes de receber resposta) clica em "enviar" com "Mensagem 2"

Esperado:
- Mensagem 1 inicia a stream
- Mensagem 2 chega e substitui
- Mensagem 1 recebe: finish_reason: "replaced_by_new_stream" (SEM ERRO)
- Mensagem 2 continua normalmente
- Nenhum erro no console
```

---

## 🔍 O Que Muda e O Que Não Muda

### ✅ NÃO MUDA (backward compatible)
```
- Tipos de eventos: prompt_ready, chunk, done, etc. (IGUAIS)
- Estrutura JSON: (IGUAL)
- Response headers: (IGUAIS, agora com x-stream-id)
- Formatos: (IGUAIS)
- Nenhuma lib precisa atualizar
- Código existente continua funcionando
```

### ⚠️ MUDA (melhoria)
```
- Cada evento agora tem streamId (novo campo)
- Você pode filtrá-los por streamId (novo)
- prompt_ready não duplica mais (melhoria)
- Heartbeat mais consistente (melhoria)
```

---

## 🚨 Edge Cases Que Você Pode Ver

### Cenário 1: Usuário envia 2 mensagens rápido
```
Timeline:
T=0ms   → Msg 1 enviada (streamId: AAA)
T=50ms  → Msg 2 enviada (streamId: BBB)
T=100ms → AAA recebe: event: chunk (streamId: AAA)
T=150ms → BBB recebe: event: chunk (streamId: BBB)
T=200ms → AAA recebe: event: done (finish_reason: "replaced_by_new_stream")
T=250ms → BBB recebe: event: chunk (streamId: BBB)
T=300ms → BBB recebe: event: done (finish_reason: "stop")

Seu código (com filtro):
- T=100: Processa (streamId AAA === streamId no header? Sim, processa)
  Mas ESPERA, streamId muda em T=50!

IMPORTANTE: Você precisa ATUALIZAR o streamId quando manda nova msg!
```

**Solução**:
```typescript
async function sendMessage(message: string) {
  // ✅ Captura novo streamId ANTES de processar
  const response = await fetch('/api/ask-eco', {...});
  const newStreamId = response.headers.get('x-stream-id');

  // ✅ Atualiza a variável
  currentStreamId = newStreamId;

  // Agora processa com newStreamId
  const reader = response.body.getReader();
  // ... resto do código filtra por currentStreamId
}
```

### Cenário 2: Conexão cai e volta
```
1. Mensagem em progresso, conexão cai
2. Usuário quer reenviar
3. Você precisa cancelar a antiga (AbortController)

Código:
let abortController = null;

function sendMessage(message: string) {
  if (abortController) {
    abortController.abort(); // Cancela requisição antiga
  }

  abortController = new AbortController();

  fetch('/api/ask-eco', {
    signal: abortController.signal,
    ...
  });
}
```

### Cenário 3: Vê eventos de tipo "control"
```json
{
  "type": "control",
  "name": "prompt_ready",
  "streamId": "...",
  ...
}
```

**Isso é normal.** Eventos de controle (prompt_ready, etc) vêm como `type: "control"` com um campo `name` indicando qual controle.

---

## 📋 Checklist pro Frontend

- [ ] Capturar `x-stream-id` do header de response
- [ ] Filtrar eventos por `streamId` para ignorar eventos órfãos
- [ ] Atualizar `currentStreamId` quando nova mensagem é enviada
- [ ] Usar `AbortController` para cancelar requisições antigas
- [ ] Testar com 2 mensagens enviadas rapidamente
- [ ] Testar com conexão lenta (DevTools > Throttling)
- [ ] Verificar que não há eventos duplicados no console
- [ ] Verificar que "replaced_by_new_stream" não causa erro
- [ ] Carregar a página novamente e testar

---

## 🎬 Exemplo Completo (React Hook)

```typescript
import { useEffect, useState, useRef } from 'react';

function useEcoStream(message: string) {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentStreamIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!message.trim()) return;

    // Cancela requisição anterior se ainda tiver rodando
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setLoading(true);
    setError(null);
    setResponse('');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const clientMessageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    fetch('/api/ask-eco', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, clientMessageId }),
      signal: abortController.signal,
    })
      .then((response) => {
        // ✨ NOVO: Captura streamId
        const streamId = response.headers.get('x-stream-id');
        if (!streamId) {
          throw new Error('No stream ID from server');
        }
        currentStreamIdRef.current = streamId;
        console.log('[useEcoStream] streamId:', streamId);

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processChunk = async () => {
          try {
            const { done, value } = await reader.read();
            if (done) return;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim() || line.startsWith(':')) {
                // Ignora linhas vazias e comentários (heartbeat)
                continue;
              }

              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6));

                  // ✨ NOVO: Filtra por streamId
                  if (event.streamId !== currentStreamIdRef.current) {
                    console.debug(
                      '[useEcoStream] Ignorando evento de stream antigo:',
                      event.streamId
                    );
                    return;
                  }

                  // Processa o evento
                  if (event.type === 'chunk' || event.name === 'chunk') {
                    setResponse((prev) => prev + (event.delta || ''));
                  } else if (event.type === 'done' || event.name === 'done') {
                    console.log('[useEcoStream] Stream completo');
                  } else if (
                    event.type === 'prompt_ready' ||
                    event.name === 'prompt_ready'
                  ) {
                    console.log('[useEcoStream] prompt_ready recebido');
                  }
                } catch (parseError) {
                  console.error('[useEcoStream] Failed to parse event:', line);
                }
              }
            }

            return processChunk();
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              console.log('[useEcoStream] Stream cancelled by user');
              return;
            }
            throw error;
          }
        };

        return processChunk();
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('[useEcoStream] Request aborted');
        } else {
          setError(err instanceof Error ? err.message : 'Unknown error');
          console.error('[useEcoStream] Error:', err);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [message]);

  return { response, loading, error };
}

// Uso
export function ChatApp() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const { response, loading } = useEcoStream(messages[messages.length - 1] || '');

  const handleSend = () => {
    if (input.trim()) {
      setMessages([...messages, input]);
      setInput('');
    }
  };

  return (
    <div>
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i}>
            <p><strong>You:</strong> {msg}</p>
            {i === messages.length - 1 && (
              <p><strong>Eco:</strong> {response || (loading ? 'Thinking...' : '')}</p>
            )}
          </div>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        placeholder="Type a message..."
      />
      <button onClick={handleSend} disabled={loading}>
        Send
      </button>
    </div>
  );
}
```

---

## ❓ FAQ

**P: Preciso mudar todo o meu código?**
R: Não. Só adiciona o filtro por streamId. 5 linhas de código.

**P: E se eu não colocar o filtro?**
R: Vai funcionar 99% das vezes. Mas com 2 mensagens rápidas, vai misturar chunks.

**P: O heartbeat (`:keepalive`) é normal?**
R: Sim! É um comentário SSE. Seu parser deve ignorar (linhas começando com `:`).

**P: Por que "replaced_by_new_stream" não é um erro?**
R: Porque é esperado! Quando você manda nova msg, a antiga é substituída gracefully.

**P: Meus timeouts vão continuar iguais?**
R: Sim. Mas agora mais robusto - heartbeat a cada 12s previne falsos timeouts.

**P: Preciso fazer rebuild?**
R: Frontend: não. Backend: precisa fazer `npm run build` se ainda não fez.

**P: Quando vocês vão liberar no prod?**
R: Quando vocês tiverem testado e aprovado. Avisa quando estiver pronto!

---

## 📞 Próximos Passos

1. **Vocês**: Implementam o filtro de streamId
2. **Vocês**: Testam conforme os testes acima
3. **Vocês**: Avisa se encontrou algo estranho
4. **Eu**: Faço qualquer ajuste se precisar
5. **Deploy**: Primeiro backend, depois frontend

---

## 📚 Docs de Referência

Se precisa de mais detalhes, tem 3 docs:

1. **SSE_FRONTEND_INTEGRATION.md** - Exemplos mais detalhados
2. **SSE_TESTING_GUIDE.md** - Como testar tudo
3. **SSE_ROBUSTNESS_FIXES.md** - O que exatamente mudou no backend

Mas honestamente? Essa doc aqui já tem 90% do que vocês precisam.

---

**É isso!** Bora fazer isso rodar. 🚀

Alguma dúvida? Me chama no Slack!
