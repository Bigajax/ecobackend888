# Sanitização de Mensagens - Backend ECO

**Objetivo**: Documentar como o backend sanitiza/processa mensagens durante o streaming SSE para o frontend entender responsabilidades compartilhadas.

---

## 📋 Resumo Executivo

O backend ECO sanitiza respostas de LLM em **duas camadas**:

1. **Normalização de chunks** (durante streaming)
2. **Sanitização de saída** (antes de enviar SSE)

O **frontend NÃO deve aplicar sanitização adicional** - tudo já vem limpo do backend.

---

## 🔄 Pipeline de Sanitização

```
OpenRouter/Claude LLM
        ↓
  pickDeltaFromStreamChunk()
        ↓
  normalizeOpenRouterText()  [Camada 1: Space preservation]
        ↓
  wordBuffer (SSE streaming)
        ↓
  sanitizeOutput()  [Camada 2: Remove blocos JSON/controle]
        ↓
  SSE Event (type: "chunk")
        ↓
  ➜ FRONTEND (consome diretamente)
```

---

## 🛡️ Camada 1: Normalização de Chunks

**Arquivo**: `server/core/ClaudeAdapter.ts` (linhas 108-125)

### O que faz:
- Preserva espaços entre palavras no streaming
- Remove espaços duplos em conteúdo estruturado

### Responsabilidade do Backend:
✅ Garantir que `"é o que " + "significa"` = `"é o que significa"`

### Responsabilidade do Frontend:
❌ **NÃO aplicar** `.trim()` ou `.replace(/\s+/g, " ")` nos chunks recebidos

### Exemplo:

```javascript
// ✅ CORRETO - Frontend recebe espaços preservados
const chunks = ["é o que ", "significa"];
const result = chunks.join(""); // "é o que significa"

// ❌ ERRADO - NÃO faça isto:
const badResult = chunks.map(c => c.trim()).join(" ");
// Resultado: "é o quesiginifica" (perde espaço!)
```

---

## 🧹 Camada 2: Sanitização de Saída

**Arquivo**: `server/utils/textExtractor.ts` (linhas 2-11)

### O que é removido:

| Padrão | Exemplo | Por quê |
|--------|---------|--------|
| Blocos markdown JSON | ````json { ... }``` ` | Artifacts de streaming |
| Payloads JSON finais | `{ "field": "value" }` ao final | Dados técnicos acidentais |
| Caracteres de controle | `\u0000-\u001F` (exceto espaços) | Seguridance/encoding |

### O que é PRESERVADO:

| Elemento | Preservado? | Razão |
|----------|------------|-------|
| Espaços simples | ✅ Sim | Necessários para legibilidade |
| Quebras de linha `\n` | ✅ Sim | Formatação de parágrafo |
| Tabulações `\t` | ✅ Sim | Indentação semântica |
| Acentos (é, ã, ç) | ✅ Sim | Idioma português |
| Emojis | ✅ Sim | Expressão emocional |
| Markdown (`**bold**`, `*italic*`) | ✅ Sim | Formatação de texto |
| Pontuação (.,!?;:) | ✅ Sim | Semântica |

### Código da sanitização:

```typescript
export function sanitizeOutput(input?: string): string {
  const txt = input ?? "";
  return txt
    // Remove blocos ```json ... ```
    .replace(/```(?:json)?[\s\S]*?```/gi, "")
    // Remove payload JSON final
    .replace(/\{[\s\S]*?\}\s*$/g, "")
    // Remove caracteres de controle perigosos, preservando espaços comuns
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}
```

---

## 📤 SSE Event Structure

### Event Type: "chunk"

```json
{
  "type": "chunk",
  "index": 5,
  "text": "é o que significa",
  "content": "é o que significa"
}
```

**O que você recebe no frontend:**
- ✅ Espaços já preservados
- ✅ Sem caracteres de controle
- ✅ Sem blocos JSON acidentais
- ✅ Pronto para renderizar direto

---

## ✅ Checklist Frontend - Responsabilidades

### Durante o streaming (recepção de chunks):

- [ ] **NÃO fazer** `.trim()` em chunks individuais
- [ ] **NÃO fazer** `.replace(/\s+/g, " ")` (remove espaços necessários)
- [ ] **NÃO fazer** `.split("").join("")` (remove tudo!)
- [ ] **Sim fazer** Concatenar chunks diretamente: `buffer += chunk.text`

### Exemplo correto de acumulação:

```javascript
let fullResponse = "";

eventSource.addEventListener("chunk", (event) => {
  const data = JSON.parse(event.data);

  // ✅ CORRETO: Concatenar sem processamento
  fullResponse += data.text;

  // ❌ ERRADO: Não fazer isto
  // fullResponse += data.text.trim();
  // fullResponse += data.text.replace(/\s+/g, " ");
});
```

### Renderização final:

```javascript
// ✅ CORRETO: Renderizar como está
element.innerText = fullResponse;
element.textContent = fullResponse;

// ❌ ERRADO: Processar novamente
// element.innerText = fullResponse.trim();
// element.innerText = fullResponse.replace(/\s+/g, " ");
```

---

## 🎨 Handling de Formatação Especial

### Markdown (preservado pelo backend)

O backend preserva markdown, o frontend deve renderizar:

```javascript
// Backend envia: "**Bold text** and *italic*"
// Frontend renderiza com markdown parser (ex: marked.js)
import { marked } from "marked";
const html = marked(chunk.text);
element.innerHTML = html;
```

### Quebras de linha (preservadas pelo backend)

```javascript
// Backend envia com \n preservado
const text = "Primeira linha\nSegunda linha";

// Frontend pode renderizar como:
element.innerText = text;  // ✅ Preserva quebras
element.textContent = text; // ✅ Preserva quebras

// Ou converter para <br> em HTML:
const html = text.replace(/\n/g, "<br>");
element.innerHTML = html; // ✅ Renderiza quebras como <br>
```

### Emojis e caracteres especiais (preservados)

```javascript
// Backend envia com emojis intactos
const text = "Ótimo! 🎉 Vamos começar...";

// Frontend renderiza normalmente
element.innerText = text; // ✅ Emoji renderiza corretamente
```

---

## ⚠️ Casos de Edge Case

### 1. Resposta com Technical Block (JSON emocional)

Quando `intensity >= 7`, o backend pode enviar um bloco técnico:

```
Aqui está minha resposta em português...

{
  "emocao_principal": "alegria",
  "intensidade": 7.5,
  "tags": ["progresso", "objetivo"],
  "dominio_vida": "trabalho"
}
```

**Responsabilidade Backend**: Remover este bloco antes de enviar SSE
**Responsabilidade Frontend**: O texto já virá limpo, sem o JSON

---

### 2. Múltiplos chunks chegando rapidamente

```javascript
// Backend: mantém ordem e espaçamento
// Frontend: apenas concatena

let buffer = "";
buffer += "O futuro ";       // Chunk 1
buffer += "da inteligência ";  // Chunk 2
buffer += "artificial é ";     // Chunk 3
buffer += "promissor";         // Chunk 4

// Resultado: "O futuro da inteligência artificial é promissor" ✅
```

---

### 3. Streaming com caracteres acentuados

```javascript
// Backend: preserva acentos UTF-8
// Frontend: renderiza normalmente

"Café com açúcar é delicioso! ☕"
// ✅ Tudo preservado do backend

// Não faça encoding/decoding adicional
```

---

## 🔗 Integração com Response Finalizer

**Arquivo**: `server/services/conversation/responseFinalizer.ts`

Após o streaming terminar, o backend:

1. ✅ Remove blocos técnicos (JSON emocional)
2. ✅ Extrai emoção detectada na resposta
3. ✅ Persiste memória (se intensity >= 7)
4. ✅ Envia evento `done` com stats

**Frontend recebe no evento `done`:**

```json
{
  "type": "done",
  "content": "Texto final sanitizado",
  "stats": {
    "tokens_used": 342,
    "response_time_ms": 2145
  }
}
```

---

## 📊 Fluxo Completo de Exemplo

### Entrada (user message):
```
"Estou com medo do futuro 😟"
```

### Backend processing:
```
1. Análise emocional → intensity = 8.2
2. Seleção de contexto → openness = 3
3. Claude LLM streaming:
   Chunk 1: "Entendo seu "
   Chunk 2: "medo. É natural "
   Chunk 3: "sentir incerteza... "
   ...
4. Sanitização (remove blocos técnicos)
5. SSE events enviados
```

### Frontend recebimento:

```javascript
eventSource.addEventListener("chunk", (e) => {
  const { text } = JSON.parse(e.data);
  fullText += text;  // ✅ Simples concatenação
  renderToUI(fullText);
});

eventSource.addEventListener("done", (e) => {
  const { content } = JSON.parse(e.data);
  // Content já é final, sanitizado, sem JSON técnico
  renderFinal(content);
});
```

### Saída final (renderizada):
```
Entendo seu medo. É natural sentir incerteza...
[resposta completa e bem formatada]
```

---

## 🚨 Troubleshooting

### Problema: Palavras aparecem juntas (sem espaço)

```
❌ "éoquesiginifica"
✅ "é o que significa"
```

**Causa**: Frontend está fazendo `.trim()` ou `.replace(/\s+/g, "")`

**Solução**:
```javascript
// ✅ Correto
fullText += chunk.text;

// ❌ Remova isto
fullText += chunk.text.trim();
fullText += chunk.text.replace(/\s+/g, " ");
```

---

### Problema: JSON técnico aparecendo na resposta

```
❌ "Resposta... { "emocao": "alegria" }"
✅ "Resposta... (sem JSON)"
```

**Causa**: Backend não removeu bloco técnico

**Ação**: Reportar ao backend - `sanitizeOutput()` pode estar desativada

---

### Problema: Caracteres estranhos (ex: `\u0000`, `\u001F`)

**Causa**: Caracteres de controle não foram removidos

**Ação**: Verificar se `sanitizeOutput()` foi chamado

---

## 📚 Referências

| Arquivo | Função |
|---------|--------|
| `server/core/ClaudeAdapter.ts` | `normalizeOpenRouterText()` - Preserve spaces |
| `server/utils/textExtractor.ts` | `sanitizeOutput()` - Remove technical blocks |
| `server/services/conversation/streamingOrchestrator.ts` | SSE event emission |
| `server/sse/sseEvents.ts` | Event serialization |

---

## 💬 Contacto/Dúvidas

Para discussões sobre sanitização:
- Verificar `ClaudeAdapter.ts` se houver dúvidas sobre espaços
- Verificar `textExtractor.ts` se houver dúvidas sobre blocos técnicos
- Abrir issue no repositório se encontrar comportamento inesperado

---

**Última atualização**: 2025-11-06
**Versão**: 1.0
**Status**: ✅ Em produção
