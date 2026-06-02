# 🔍 Guia de Debug: Memória e Emoção

## Logs adicionados para diagnosticar os problemas

Foram adicionados 4 pontos de log estratégicos:

### 1. **ecoDecisionHub.ts** - Intensidade inicial
```
[ecoDecision] intensity=X.XX, threshold=7, saveMemory=true/false
```

### 2. **ConversationOrchestrator.ts** - Verificação de guest
```
[applyMemoryDecision] isGuest=true/false, beforeGuest=true/false, afterGuest=true/false, hasTechBlock=true/false
```

### 3. **EmotionalAnalyzer.ts** - Bloco técnico gerado
```
[blocoTecnico] modelo=X, emocao=Y, intensidade=Z
[blocoTecnico] BLOCOBRANCO - nenhum modelo retornou JSON válido
```

### 4. **MemoryService.ts** - Decisão de salvar
```
[MemoryService] decision.saveMemory=true/false, intensidadeNum=X, shouldSaveMemory=true/false, shouldSaveReference=true/false
[MemoryService.INSERT] shouldSaveMemory=true, error=null, insertedId=UUID
```

---

## 🧪 Como executar o teste de debug

### Passo 1: Ativar modo debug
```bash
ECO_DEBUG=true npm run dev
```

### Passo 2: Fazer requisição com intensidade alta
Use uma mensagem com forte carga emocional (intensidade >= 7):

**Exemplos de mensagens com alta intensidade:**
```
"Estou desesperado, não aguento mais essa situação, sinto que tudo desabou na minha vida"
"Tenho muito medo, estou com pânico e não consigo controlar meus pensamentos"
"Estou furioso com essa injustiça, é absolutamente insuportável!"
```

### Passo 3: Teste com usuário autenticado (NÃO guest)

**COM curl:**
```bash
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -H "X-User-Id: test-user-123" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Estou desesperado, não aguento mais essa situação, sinto que tudo desabou na minha vida"
      }
    ]
  }'
```

**COM JavaScript/Fetch:**
```javascript
fetch('http://localhost:3001/api/ask-eco', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Id': 'test-user-123'
  },
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: 'Estou desesperado, não aguento mais essa situação, sinto que tudo desabou na minha vida'
    }]
  })
})
```

### Passo 4: Analisar logs no terminal

Procure pela sequência de logs na ordem:

```
1️⃣  [ecoDecision] intensity=8.50, threshold=7, saveMemory=true
    ↓ Intensidade >= 7? SIM

2️⃣  [applyMemoryDecision] isGuest=false, beforeGuest=true, afterGuest=true, hasTechBlock=true
    ↓ É guest? NÃO

3️⃣  [blocoTecnico] modelo=openai/gpt-5.0, emocao=Desespero, intensidade=8
    ↓ Bloco técnico gerado com sucesso

4️⃣  [MemoryService] decision.saveMemory=true, intensidadeNum=8, shouldSaveMemory=true, shouldSaveReference=false
    [MemoryService.INSERT] shouldSaveMemory=true, error=null, insertedId=550e8400-e29b-41d4-a716-446655440000
    ↓ Memória salva com sucesso!
```

---

## 🔧 Fluxograma de Diagnóstico

```
┌─────────────────────────────────────────────────────────────┐
│ Memória NÃO está gravando? Siga este fluxograma:           │
└─────────────────────────────────────────────────────────────┘

1️⃣ Verifique log [ecoDecision]
   ├─ intensity < 7? → PROBLEMA: intensidade baixa
   │  └─ Tente com mensagem mais emocional
   │
   └─ intensity >= 7? → Vá para 2️⃣

2️⃣ Verifique log [applyMemoryDecision]
   ├─ isGuest=true? → PROBLEMA: usuário é guest
   │  └─ Use header X-User-Id para autenticar
   │
   ├─ afterGuest=false? → PROBLEMA: guest bloqueou
   │  └─ Use header X-User-Id para autenticar
   │
   └─ afterGuest=true, hasTechBlock=true? → Vá para 3️⃣

3️⃣ Verifique log [blocoTecnico]
   ├─ BLOCOBRANCO? → PROBLEMA: modelo não retornou JSON
   │  └─ Verificar API key OPENROUTER_API_KEY
   │  └─ Verificar modelo: ECO_MODEL_TECH
   │
   ├─ emocao=null ou ""? → PROBLEMA: emoção vazia
   │  └─ Vá para seção "Diagnóstico de Emoção"
   │
   └─ emocao com valor, intensidade >= 7? → Vá para 4️⃣

4️⃣ Verifique log [MemoryService]
   ├─ decision.saveMemory=false? → PROBLEMA: stage anterior falhou
   │  └─ Volta ao passo 2️⃣
   │
   ├─ shouldSaveMemory=false? → PROBLEMA: intensidade do bloco < 7
   │  └─ Verifique se modelo reduziu intensidade
   │
   └─ shouldSaveMemory=true? → Vá para 5️⃣

5️⃣ Verifique log [MemoryService.INSERT]
   ├─ error != null? → PROBLEMA: erro ao inserir no Supabase
   │  └─ Verifique Supabase: URL, chaves, tabela "memories"
   │
   └─ insertedId != null? → ✅ MEMÓRIA GRAVADA COM SUCESSO!
```

---

## 🎯 Diagnóstico de Emoção (Vindo como "Neutro")

Se a emoção está vindo como "Neutro" ou vazia:

### Checklist:
- [ ] Verificar se `bloco.emocao_principal` vem null/vazio no log [blocoTecnico]
- [ ] Se SIM, o modelo não extraiu a emoção corretamente
- [ ] Aumentar o prompt no `EmotionalAnalyzer.ts` linha 45-78

### Solução rápida:

Se o modelo está falhando, você pode melhorar o prompt:

**Arquivo**: `server/core/EmotionalAnalyzer.ts` (linhas 45-78)

```typescript
function mkPrompt(enxuto: boolean, mensagemUsuario: string, respostaIa: string) {
  if (enxuto) {
    return `Retorne SOMENTE este JSON válido, sem comentários:
{"emocao_principal":"[ESCOLHA: tristeza, alegria, raiva, medo, surpresa, nojo, esperança, amor, calma, ansiedade ou outra emoção]","intensidade":0,"tags":[],"dominio_vida":""}

IMPORTANTE: emocao_principal DEVE SER PREENCHIDA!

Mensagem do usuário: "${mensagemUsuario}"
Resposta da IA: "${respostaIa}"`;
  }
  // ... resto do código
}
```

---

## 📋 Checklist Final

Antes de enviar para produção:

- [ ] Todos os logs mostram sequência correta?
- [ ] Memória está sendo gravada (log INSERT com sucesso)?
- [ ] Emoção não está vindo como "Neutro"?
- [ ] Testes com usuário autenticado (X-User-Id)?
- [ ] Testes com intensidade >= 7?

---

## 💡 Dicas

1. **Use mensagens diferentes**: Cada requisição pode ter intensidade diferente
2. **Acompanhe pelo tempo**: Os logs aparecem em tempo real, veja sequência
3. **Copie os logs**: Salve para análise posterior
4. **Desative debug depois**: `ECO_DEBUG=false` ou remova a env

---

## ❓ Se os problemas persistirem:

1. Compartilhe os logs completos comigo
2. Indique em qual step da sequência o problema ocorre
3. Verifique se `.env` tem todas as chaves corretas:
   - `OPENROUTER_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
