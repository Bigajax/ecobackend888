# 🧪 GUIA DE TESTE: Validar Salvamento de Memórias

---

## ⚡ Quick Test (5 minutos)

### 1. Compile o código atualizado:
```bash
npm run build
```
✅ Deve passar sem erros

### 2. Inicie o servidor:
```bash
npm run dev
```
✅ Deve iniciar sem problemas

### 3. Abra o frontend em seu navegador e teste:

**Mensagem de teste** (intensidade >= 7):
```
"Estou extremamente triste. Tive uma discussão muito séria com meu
namorado sobre nosso futuro juntos, e ele disse coisas que me magoaram
profundamente. Não sei se consigo confiar nele novamente. Estou sentindo
uma tristeza avassaladora."
```

### 4. Abra DevTools (F12) → Console e procure por:
```
[Memory] handleMemorySaved chamado
[Memory] Dados da memória extraídos
[Memory] ✅ Memória registrada com sucesso
```

---

## 🔍 Teste Detalhado (15 minutos)

### Passo 1: Verificar logs do backend

Ao enviar uma mensagem que deveria gerar memória (intensity >= 7):

**Procure por estes logs no console do backend**:

```
[StreamingBloco] state=success { durationMs: XXX, emitted: true }
```

Isso indica que o bloco técnico foi gerado com sucesso.

### Passo 2: Verificar Network Request

No DevTools → Network → procure por `/api/ask-eco`:

1. Clique na requisição
2. Vá para aba **Response** ou **Message**
3. Procure por linhas com:

```
data: {"type":"memory_saved",...}
```

**Essa linha deve conter**:
- ✅ `"type":"memory_saved"`
- ✅ `"payload":{"memory":{...}`
- ✅ `"id":"<uuid>"`
- ✅ `"usuario_id":"<uuid>"`
- ✅ `"resumo_eco":"..."`
- ✅ `"emocao_principal":"..."`
- ✅ `"intensidade":<number>`
- ✅ `"tags":[...]`
- ✅ `"primeiraMemoriaSignificativa":<boolean>`

### Passo 3: Verificar Console do Frontend

Abra DevTools → Console (F12) e procure por logs `[Memory]`:

**Log esperado #1**:
```
[Memory] handleMemorySaved chamado: {
  hasEvent: true,
  hasUserId: true,
  userIdValue: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**Log esperado #2**:
```
[Memory] Dados da memória extraídos: {
  hasMemory: true,
  memoryDataKeys: ["id", "usuario_id", "resumo_eco",
                   "emocao_principal", "intensidade", "contexto",
                   "dominio_vida", "tags", "analise_resumo", ...]
}
```

**Log esperado #3**:
```
[Memory] Chamando registrarMemoria com payload: {
  usuario_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  resumo_eco: "Estou extremamente triste...",
  emocao_principal: "tristeza",
  intensidade: 9,
  tags: [...],
  ...outros campos
}
```

**Log esperado #4** (sucesso):
```
[Memory] ✅ Memória registrada com sucesso: {
  memoryId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  isFirstSignificant: false,
  memoryCreatedAt: "2025-11-15T12:00:00.000Z"
}
```

### Passo 4: Verificar se memória foi salva no banco

Execute a query no Supabase:

```sql
SELECT * FROM public.memorias
WHERE usuario_id = '<seu-usuario-id>'
ORDER BY created_at DESC
LIMIT 1;
```

Deve retornar:
- ✅ Uma linha com `intensidade >= 7`
- ✅ Campo `resumo` preenchido
- ✅ Campo `emocao_principal` preenchido
- ✅ Timestamp recente (`created_at`)

---

## 🚨 Troubleshooting

### ❌ "Logs [Memory] não aparecem no console"

**Possível causa**: Evento memory_saved não está sendo enviado

**Como verificar**:
1. Backend → Procure por: `[StreamingBloco] state=success`
2. Se encontrou: problema está no evento
3. Se não encontrou: bloco técnico não foi gerado (intensidade < 7 ou timeout)

**Solução**:
- Verifique se a mensagem tem intensidade >= 7
- Verifique logs: `[StreamingBloco] bloco payload inválido`

### ❌ "Evento memory_saved aparece mas com estrutura errada"

**Possível causa**: Atualização não foi aplicada corretamente

**Como verificar**:
```bash
npm run build
```

Se houver erros: não compile corretamente

**Solução**:
```bash
# Clear cache
rm -rf server/dist/

# Rebuild
npm run build
```

### ❌ "Logs [Memory] aparecem mas erro no final"

Procure por:
```
[Memory] ❌ Erro ao registrar memória: {
  errorName: "...",
  errorMessage: "..."
}
```

**Possíveis causas**:
- API `/api/memorias/registrar` retornando erro
- RLS bloqueando acesso
- Usuário não autenticado

**Solução**:
```bash
# Verificar se o endpoint está funcionando
curl -X POST http://localhost:3001/api/memorias/registrar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "usuario_id": "test-user",
    "resumo_eco": "Teste",
    "emocao_principal": "tristeza",
    "intensidade": 8
  }'
```

### ❌ "Mensagem é fraca" (intensidade < 7)

Teste com mensagens mais intensas:

```
"Estou em desespero total. Minha vida está desabando.
Perdi meu emprego, meu relacionamento terminou, e não sei como vou pagar
minhas contas. Sinto-me completamente sozinho e sem esperança.
Está tudo tão escuro e assustador. Não vejo saída."
```

**Verificar**:
1. Backend → Procure por: `[ecoDecision] intensity: X`
2. Deve estar >= 7

---

## ✅ Checklist de Validação

- [ ] `npm run build` compila sem erros
- [ ] Servidor inicia: `npm run dev`
- [ ] Envio mensagem com intensidade >= 7
- [ ] Console mostra logs `[Memory]`
- [ ] Network mostra evento `memory_saved` em `/api/ask-eco`
- [ ] Evento contém campo `memory` com id, usuario_id, resumo_eco, etc.
- [ ] Banco de dados tem nova memória em `public.memorias`
- [ ] Log final mostra: `[Memory] ✅ Memória registrada com sucesso`

---

## 📊 Teste Automatizado

```bash
# Rodar testes de contrato
npm test -- askEco.sse

# Procure por testes que mencionem "memory_saved"
# Exemplo:
# ✅ should emit memory_saved event when intensity >= 7
```

---

## 📞 Se encontrar problemas

1. **Colete os logs**:
   - Console do backend (todos os logs com `[StreamingBloco]` e `[Memory]`)
   - Console do frontend (DevTools)
   - Network tab (resposta SSE completa)

2. **Verifique a estrutura do evento**:
   - Network → `/api/ask-eco` → Response
   - Procure por: `data: {"type":"memory_saved",...}`
   - Verifique se contém: `"memory":{"id":...,"usuario_id":...}`

3. **Teste o endpoint de API**:
   ```bash
   curl -X POST http://localhost:3001/api/memorias/registrar \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <seu-token-jwt>" \
     -d '{
       "usuario_id": "<seu-user-id>",
       "resumo_eco": "Teste de memória",
       "emocao_principal": "tristeza",
       "intensidade": 8
     }'
   ```

---

## 🎉 Sucesso!

Quando tudo funcionar, você verá:

1. ✅ Backend envia evento SSE
2. ✅ Frontend recebe e processa
3. ✅ API persiste no banco
4. ✅ Logs confirmam salvamento
5. ✅ Usuário vê confirmação na UI

**A partir daqui**, o sistema de memórias está totalmente funcional!

---
