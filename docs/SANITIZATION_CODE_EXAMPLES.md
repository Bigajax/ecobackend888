# Exemplos de Código - Sanitização de Mensagens

Exemplos práticos de como integrar corretamente com o streaming SSE do backend.

---

## 1. Recepção de Chunks (Frontend)

### ❌ ERRADO - Processamento excessivo

```javascript
// backend/ClaudeAdapter.ts
// Já fez: normalizeOpenRouterText() com espaços preservados

// frontend/badConsumer.js
class BadMessageHandler {
  constructor() {
    this.fullText = "";
  }

  onChunk(event) {
    const data = JSON.parse(event.data);
    let chunk = data.text;

    // ❌ ERRO 1: Trim remove espaço final necessário
    chunk = chunk.trim();

    // ❌ ERRO 2: Replace remove espaços múltiplos (que podem ser propositais)
    chunk = chunk.replace(/\s+/g, " ");

    // ❌ ERRO 3: Split/join remove tudo!
    chunk = chunk.split("").join("");

    this.fullText += chunk;
  }

  getResult() {
    // Resultado final: "éoquesiginifica" (BUG!)
    return this.fullText;
  }
}
```

**Por quê é errado:**
- Backend enviou: `"é o que "` (com espaço intencional)
- `.trim()` remove o espaço: `"é o que"`
- Próximo chunk: `"significa"`
- Concatenação: `"é o quesiginifica"` ❌

---

### ✅ CORRETO - Acumulação simples

```javascript
// frontend/goodConsumer.js
class GoodMessageHandler {
  constructor() {
    this.fullText = "";
    this.chunks = [];
  }

  onChunk(event) {
    const data = JSON.parse(event.data);

    // ✅ Simples concatenação, sem processamento
    const chunk = data.text;
    this.fullText += chunk;

    // Optional: guardar chunks para debug
    this.chunks.push({
      index: data.index,
      text: chunk,
      timestamp: Date.now()
    });

    // Renderizar em tempo real
    this.render();
  }

  render() {
    // ✅ Renderizar exatamente como recebido
    const element = document.getElementById("response");
    element.innerText = this.fullText;
  }

  getResult() {
    // Resultado final: "é o que significa" (✅ CORRETO!)
    return this.fullText;
  }

  getChunkDebugInfo() {
    return {
      totalChunks: this.chunks.length,
      chunks: this.chunks,
      finalLength: this.fullText.length,
      preview: this.fullText.substring(0, 100)
    };
  }
}
```

---

## 2. Renderização com Markdown

### Caso: Backend preserva markdown

```javascript
// Backend envia: "**Importante:** Isto é uma observação."
// Frontend renderiza com markdown

import { marked } from "marked";

class MarkdownRenderer {
  constructor() {
    this.fullText = "";
  }

  onChunk(event) {
    const data = JSON.parse(event.data);
    this.fullText += data.text;
    this.render();
  }

  render() {
    const element = document.getElementById("response");

    // ✅ Converter markdown para HTML
    const html = marked(this.fullText);
    element.innerHTML = html;
  }
}

// Resultado HTML:
// <p><strong>Importante:</strong> Isto é uma observação.</p>
```

### Alternativa com DOMPurify (segurança)

```javascript
import { marked } from "marked";
import DOMPurify from "dompurify";

class SecureMarkdownRenderer {
  constructor() {
    this.fullText = "";
  }

  onChunk(event) {
    const data = JSON.parse(event.data);
    this.fullText += data.text;
    this.render();
  }

  render() {
    const element = document.getElementById("response");

    // ✅ Converter markdown para HTML
    let html = marked(this.fullText);

    // ✅ Sanitizar HTML para evitar XSS
    html = DOMPurify.sanitize(html);

    element.innerHTML = html;
  }
}
```

---

## 3. Tratamento de Quebras de Linha

### Preservar como `<br>`

```javascript
class LineBreakRenderer {
  constructor() {
    this.fullText = "";
  }

  onChunk(event) {
    const data = JSON.parse(event.data);
    this.fullText += data.text;
    this.render();
  }

  render() {
    const element = document.getElementById("response");

    // ✅ Converter \n para <br> para renderizar
    const html = this.fullText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    element.innerHTML = html;
  }
}
```

### Preservar em `<pre>` (monoespaço)

```javascript
class CodeBlockRenderer {
  constructor() {
    this.fullText = "";
  }

  onChunk(event) {
    const data = JSON.parse(event.data);
    this.fullText += data.text;
    this.render();
  }

  render() {
    const element = document.getElementById("response");

    // ✅ Usar <pre> preserva quebras e espaços
    const textNode = document.createTextNode(this.fullText);
    element.innerHTML = "<pre></pre>";
    element.querySelector("pre").appendChild(textNode);
  }
}
```

---

## 4. Debounce para Renderização (Performance)

```javascript
class OptimizedRenderer {
  constructor(renderDebounceMs = 100) {
    this.fullText = "";
    this.renderDebounceMs = renderDebounceMs;
    this.renderTimer = null;
  }

  onChunk(event) {
    const data = JSON.parse(event.data);
    this.fullText += data.text;

    // ✅ Debounce renderização para economizar repaints
    this.scheduleRender();
  }

  scheduleRender() {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }

    this.renderTimer = setTimeout(() => {
      this.render();
    }, this.renderDebounceMs);
  }

  render() {
    const element = document.getElementById("response");
    element.innerText = this.fullText;
  }

  onStreamEnd() {
    // ✅ Renderizar uma última vez quando stream terminar
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
    }
    this.render();
  }
}
```

---

## 5. Integração Completa com EventSource

```javascript
class EcoMessageConsumer {
  constructor(elementId = "eco-response") {
    this.element = document.getElementById(elementId);
    this.fullText = "";
    this.isStreaming = false;
    this.stats = {};
  }

  async startListening(url, requestBody) {
    // Fazer request POST com resposta SSE
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Frontend adiciona headers necessários
        "X-Eco-Guest-Id": this.getGuestId()
      },
      body: JSON.stringify(requestBody)
    });

    // Consumir response como SSE
    this.consumeSSE(response);
  }

  async consumeSSE(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    this.isStreaming = true;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.slice(6));
              this.handleSSEEvent(eventData);
            } catch (e) {
              console.error("Invalid SSE data:", line);
            }
          }
        }
      }
    } finally {
      this.isStreaming = false;
      this.onStreamEnd();
    }
  }

  handleSSEEvent(event) {
    switch (event.type) {
      case "chunk":
        // ✅ Simples concatenação
        this.fullText += event.text;
        this.render();
        break;

      case "memory_saved":
        console.log("Memória salva:", event.memory_id);
        break;

      case "done":
        console.log("Stream finalizado", event.stats);
        this.stats = event.stats;
        break;

      case "error":
        console.error("Erro no stream:", event.error);
        this.element.innerText = "Erro: " + event.error;
        break;
    }
  }

  render() {
    // ✅ Renderizar exatamente como está
    this.element.innerText = this.fullText;
  }

  onStreamEnd() {
    console.log("Stream terminado!");
    console.log("Tokens usados:", this.stats.tokens_used);
    console.log("Tempo de resposta:", this.stats.response_time_ms + "ms");
  }

  getGuestId() {
    let id = localStorage.getItem("eco_guest_id");
    if (!id) {
      id = "guest_" + crypto.randomUUID();
      localStorage.setItem("eco_guest_id", id);
    }
    return id;
  }
}

// Uso
const consumer = new EcoMessageConsumer("response-container");
consumer.startListening("/api/ask-eco", {
  message: "Olá, tudo bem?"
});
```

---

## 6. Validação de Data Integrity

```javascript
class ValidatedMessageConsumer {
  constructor(elementId) {
    this.element = document.getElementById(elementId);
    this.fullText = "";
    this.chunks = [];
    this.nextExpectedIndex = 0;
  }

  onChunk(event) {
    const data = JSON.parse(event.data);

    // ✅ Validar sequência de chunks
    if (data.index !== this.nextExpectedIndex) {
      console.warn(
        `Chunk fora de ordem: esperado ${this.nextExpectedIndex}, recebido ${data.index}`
      );
    }
    this.nextExpectedIndex = data.index + 1;

    // ✅ Validar conteúdo não está vazio
    if (!data.text) {
      console.warn("Chunk vazio recebido no index", data.index);
      return;
    }

    // ✅ Guardar metadata do chunk
    this.chunks.push({
      index: data.index,
      length: data.text.length,
      hasLeadingSpace: data.text[0] === " ",
      hasTrailingSpace: data.text[data.text.length - 1] === " ",
      timestamp: Date.now()
    });

    // ✅ Simples concatenação
    this.fullText += data.text;
    this.render();
  }

  getDebugReport() {
    return {
      totalChunks: this.chunks.length,
      totalLength: this.fullText.length,
      chunks: this.chunks,
      spacePreservationSample: {
        first3Chunks: this.chunks.slice(0, 3),
        last3Chunks: this.chunks.slice(-3)
      },
      finalText: this.fullText
    };
  }

  render() {
    this.element.innerText = this.fullText;
  }
}
```

---

## 7. Teste Unit para Frontend

```javascript
// test/MessageConsumer.test.js
import { describe, it, expect, beforeEach } from "vitest";
import { GoodMessageHandler } from "../src/GoodMessageHandler";

describe("GoodMessageHandler - Space Preservation", () => {
  let handler;

  beforeEach(() => {
    handler = new GoodMessageHandler();
  });

  it("should preserve spaces between chunks", () => {
    // Simular chunks do backend
    handler.onChunk({
      data: JSON.stringify({ text: "é o que " })
    });
    handler.onChunk({
      data: JSON.stringify({ text: "significa" })
    });

    expect(handler.getResult()).toBe("é o que significa");
  });

  it("should handle multiple chunks with spacing", () => {
    const chunks = [
      "O futuro ",
      "da inteligência ",
      "artificial ",
      "é promissor"
    ];

    chunks.forEach((chunk, i) => {
      handler.onChunk({
        data: JSON.stringify({ text: chunk, index: i })
      });
    });

    expect(handler.getResult()).toBe(
      "O futuro da inteligência artificial é promissor"
    );
  });

  it("should preserve newlines", () => {
    handler.onChunk({
      data: JSON.stringify({ text: "Linha 1\n" })
    });
    handler.onChunk({
      data: JSON.stringify({ text: "Linha 2" })
    });

    expect(handler.getResult()).toBe("Linha 1\nLinha 2");
  });

  it("should not trim individual chunks", () => {
    handler.onChunk({
      data: JSON.stringify({ text: "  spaces  " })
    });

    // ✅ Espacos internos são preservados
    expect(handler.getResult()).toBe("  spaces  ");
  });

  it("should handle unicode and accents", () => {
    handler.onChunk({
      data: JSON.stringify({ text: "Café " })
    });
    handler.onChunk({
      data: JSON.stringify({ text: "com açúcar" })
    });

    expect(handler.getResult()).toBe("Café com açúcar");
  });

  it("should handle emojis", () => {
    handler.onChunk({
      data: JSON.stringify({ text: "Sucesso! " })
    });
    handler.onChunk({
      data: JSON.stringify({ text: "🎉" })
    });

    expect(handler.getResult()).toBe("Sucesso! 🎉");
  });
});
```

---

## 8. Comparação: Backend vs Frontend Responsabilidades

```javascript
/**
 * BACKEND RESPONSIBILIDADES (já feitas)
 */

// ✅ ClaudeAdapter.pickDeltaFromStreamChunk()
// Preserva espaços em chunks simples

// ✅ ClaudeAdapter.normalizeOpenRouterText()
// Só trim em structured arrays, não em chunks

// ✅ textExtractor.sanitizeOutput()
// Remove blocos JSON técnicos
// Remove caracteres de controle
// Preserva espaços normais, quebras, acentos

/**
 * FRONTEND RESPONSABILIDADES (seu trabalho)
 */

// ❌ NÃO FAZER:
fullText += chunk.trim();                  // Remove espaço necessário
fullText += chunk.replace(/\s+/g, " ");    // Perde múltiplos espaços
fullText += chunk.split("").join("");      // Remove TUDO

// ✅ FAZER:
fullText += chunk;                         // Simples concatenação

// ❌ NÃO FAZER na renderização:
element.innerText = fullText.trim();       // Remove espaço final
element.innerText = fullText.replace(/\s+/g, " "); // Normaliza espaços

// ✅ FAZER na renderização:
element.innerText = fullText;              // Renderizar como está
element.textContent = fullText;            // ou textContent
```

---

## Resumo Prático

| Ação | Backend | Frontend |
|------|---------|----------|
| Preservar espaços | ✅ Feito | ❌ Não mexa |
| Remover JSON técnico | ✅ Feito | ❌ Não precisa |
| Remover controle chars | ✅ Feito | ❌ Não precisa |
| Concatenar chunks | - | ✅ Sua vez |
| Renderizar | - | ✅ Sua vez |

**Regra de Ouro**: Se o backend já fez, o frontend não faz duas vezes!

---

**Última atualização**: 2025-11-06
