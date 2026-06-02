# Quick Reference - Sanitização de Mensagens

**TL;DR - O que você precisa saber em 2 minutos:**

---

## 🎯 A Regra de Ouro

```javascript
// ✅ BACKEND JÁ FEZ ISTO:
// - Preservou espaços entre palavras
// - Removeu blocos JSON técnicos
// - Removeu caracteres de controle

// ✅ FRONTEND DEVE FAZER:
// - Receber chunks
// - Concatenar: fullText += chunk.text
// - Renderizar: element.innerText = fullText

// ❌ FRONTEND NÃO DEVE FAZER:
// - .trim() em chunks
// - .replace(/\s+/g, " ") em chunks
// - Qualquer outro processamento
```

---

## 🔴 O Problema (se não seguir a regra)

```javascript
// ❌ ERRADO
fullText += chunk.trim();
// Resultado: "éoquesiginifica" (sem espaço!)

// ✅ CORRETO
fullText += chunk;
// Resultado: "é o que significa" (com espaço!)
```

---

## 📋 Checklist Rápido

- [ ] Recebe chunks do SSE? ✅
- [ ] Concatena direto `fullText += chunk.text`? ✅
- [ ] Renderiza direto `element.innerText = fullText`? ✅
- [ ] NÃO faz `.trim()` nos chunks? ✅
- [ ] NÃO faz `.replace()` nos chunks? ✅

Se todas estiverem ✅, você está correto!

---

## 🔧 Copy-Paste Correto

```javascript
// Seu handler SSE
eventSource.addEventListener("chunk", (event) => {
  const { text } = JSON.parse(event.data);

  // ✅ ISTO:
  fullText += text;

  // ❌ NÃO ISTO:
  // fullText += text.trim();
  // fullText += text.replace(/\s+/g, " ");

  renderToUI(fullText);
});

function renderToUI(text) {
  // ✅ ISTO:
  document.getElementById("response").innerText = text;

  // ❌ NÃO ISTO:
  // document.getElementById("response").innerText = text.trim();
}
```

---

## 📦 O que vem do Backend

| Vem limpo? | Exemplos |
|-----------|----------|
| ✅ Espaços preservados | `"é o que significa"` |
| ✅ Sem JSON técnico | Blocos `{...}` removidos |
| ✅ Sem caracteres de controle | `\u0000`, `\u001F` removidos |
| ✅ Com acentos | `Café`, `açúcar`, `ção` |
| ✅ Com emojis | `🎉 ✅ ❌` |
| ✅ Com markdown | `**bold** *italic*` |
| ✅ Com quebras de linha | `\n` preservado |

---

## 🎨 Renderização Especial

### Markdown
```javascript
import { marked } from "marked";
element.innerHTML = marked(fullText); // ✅
```

### Código (com quebras preservadas)
```javascript
element.innerHTML = `<pre>${fullText}</pre>`; // ✅
```

### Plain text (normal)
```javascript
element.innerText = fullText; // ✅ Padrão
element.textContent = fullText; // ✅ Também funciona
```

---

## 🚨 Se der Problema

### "Palavras juntas sem espaço"
```
❌ "éoquesiginifica"
✅ "é o que significa"
```
**Culpa**: Frontend fez `.trim()` ou `.replace(/\s+/g, " ")`

**Solução**: Remove `.trim()` / `.replace()`

---

### "JSON técnico aparecendo"
```
❌ "Resposta... { "emocao": "alegria" }"
```
**Culpa**: Backend não removeu (raro)

**Solução**: Reportar ao backend

---

### "Caracteres estranhos/invisíveis"
```
❌ "Texto\u0000estranho"
```
**Culpa**: Backend não sanitizou (raro)

**Solução**: Reportar ao backend

---

## 📊 Arquivos Backend Relevantes

```
server/
├── core/
│   └── ClaudeAdapter.ts ← Preserva espaços
└── utils/
    └── textExtractor.ts ← Remove JSON/controle
```

---

## 💬 TL;DR em Uma Linha

> **Não processe chunks no frontend. Backend já fez tudo. Só concatena e renderiza.**

---

**Última atualização**: 2025-11-06

Para mais detalhes, veja: `MESSAGE_SANITIZATION_FRONTEND.md` ou `SANITIZATION_CODE_EXAMPLES.md`
