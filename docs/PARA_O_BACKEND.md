# 🚀 INSTRUÇÕES PARA O BACKEND - Sistema de Memórias

**Preparado por**: Rafael (Frontend)
**Data**: 15 de Novembro de 2025
**Prioridade**: 🔴 CRÍTICO - Frontend aguardando evento SSE

---

## ⚡ RESUMO EXECUTIVO (1 minuto)

O **frontend já está 100% pronto** para processar memórias. O backend precisa fazer **UMA coisa simples**:

> **Durante o streaming SSE de `/api/ask-eco`, envie um evento com `type: "memory_saved"` contendo os dados da memória que foi identificada.**

É isso. O resto o frontend cuida automaticamente.

---

## 🎯 CHECKLIST RÁPIDO

Responda SIM a estas 5 perguntas:

- [ ] A rota `/api/ask-eco` está enviando respostas via SSE?
- [ ] Você consegue identificar quando uma memória deve ser salva?
- [ ] Você consegue estruturar os dados da memória em um objeto?
- [ ] Você consegue enviar um evento SSE personalizado?
- [ ] A tabela `memorias` no banco de dados existe e tem RLS?

Se respondeu NÃO a alguma, veja a seção correspondente abaixo.

---

## 📦 EXEMPLO DE IMPLEMENTAÇÃO PARA O BACKEND

### ✅ IMPLEMENTAÇÃO SIMPLES (Node.js/Express):

```typescript
// Quando identificar que deve salvar uma memória:

const memoriaData = {
  id: crypto.randomUUID(), // ou gerado pelo banco
  usuario_id: req.user.id, // obrigatório!
  resumo_eco: "Usuário relatou sentimento de tristeza extrema relacionado a...",
  emocao_principal: "tristeza",
  intensidade: 9,
  contexto: "Contexto completo da conversa...",
  dominio_vida: "relacionamento",
  padrao_comportamental: "Padrão de pensamento identificado",
  categoria: "emocional",
  nivel_abertura: 8,
  analise_resumo: "Análise detalhada da memória...",
  tags: ["tristeza", "intenso", "relacionamento"],
  created_at: new Date().toISOString(),
  primeiraMemoriaSignificativa: isFirstSignificant // boolean
};

// Enviar evento SSE:
res.write('data: ' + JSON.stringify({
  type: 'memory_saved',
  payload: {
    memory: memoriaData,
    primeiraMemoriaSignificativa: memoriaData.primeiraMemoriaSignificativa
  }
}) + '\n\n');

// Depois, persistir no banco de dados:
await db.memorias.insert({
  ...memoriaData,
  // Garantir que usuario_id está presente para RLS
});
```

### ✅ VARIANTE: Python/FastAPI:

```python
# Quando identificar que deve salvar memória:

memoria_data = {
    "id": str(uuid.uuid4()),
    "usuario_id": user_id,  # obrigatório!
    "resumo_eco": "Resumo identificado pela IA",
    "emocao_principal": "tristeza",
    "intensidade": 9,
    "contexto": "Contexto da conversa",
    "dominio_vida": "relacionamento",
    "padrao_comportamental": "Padrão identificado",
    "categoria": "emocional",
    "nivel_abertura": 8,
    "analise_resumo": "Análise detalhada",
    "tags": ["tristeza"],
    "created_at": datetime.now().isoformat()
}

# Enviar evento SSE:
await response.send(
    "data: " + json.dumps({
        "type": "memory_saved",
        "payload": {
            "memory": memoria_data,
            "primeiraMemoriaSignificativa": is_first_significant
        }
    }) + "\n\n"
)

# Persistir no banco:
await db.table("memorias").insert(memoria_data)
```

### ✅ ESTRUTURA MÍNIMA:

Se não tiver todos os dados, mande o que tiver:

```json
{
  "type": "memory_saved",
  "payload": {
    "memory": {
      "usuario_id": "user-uuid-required",
      "resumo_eco": "Resumo obrigatório",
      "emocao_principal": "tristeza"
    }
  }
}
```

Outros campos são opcionais. O frontend vai normalizar.

---

## 🔍 VALIDAÇÃO: COMO TESTAR

### Teste 1: Verificar se SSE está funcionando

```bash
# Terminal do servidor:
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer <seu_token>" \
  -d '{
    "usuario_id": "test-user-123",
    "texto": "estou muito triste"
  }' \
  | head -50
```

Espera ver:
```
data: {"type":"prompt_ready",...}

data: {"type":"chunk","payload":{...}}
data: {"type":"chunk","payload":{...}}

data: {"type":"memory_saved","payload":{"memory":{...}}}

data: {"type":"done",...}
```

### Teste 2: Verificar se memoria foi salva no banco

```sql
SELECT * FROM memorias
WHERE usuario_id = 'test-user-123'
ORDER BY created_at DESC
LIMIT 5;
```

Deve retornar a memória que foi salva.

### Teste 3: Verificar RLS (Row Level Security)

```sql
-- Conectar como um usuário diferente
-- Tentar acessar memória de outro usuário
SELECT * FROM memorias
WHERE usuario_id = 'test-user-123'; -- Como outro user

-- Deve retornar 0 linhas (RLS bloqueando)
```

### Teste 4: Frontend console

Abra DevTools (F12) → Console e envie uma mensagem:

**Se funcionar**, verá:
```
[Memory] handleMemorySaved chamado: {...}
[Memory] Chamando registrarMemoria com payload: {...}
[Memory] ✅ Memória registrada com sucesso: {...}
```

**Se não funcionar**, verá:
```
[Memory] ⚠️ Event não foi fornecido para handleMemorySaved
```
→ Backend não enviou o evento

---

## 📋 ESTRUTURA ESPERADA DO PAYLOAD

### Campo por campo:

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| `usuario_id` | string (UUID) | ✅ SIM | Identificador do usuário |
| `resumo_eco` | string | ✅ SIM | Resumo da memória |
| `emocao_principal` | string | ❌ Não | Emoção: "tristeza", "alegria", etc. |
| `intensidade` | number (0-10) | ❌ Não | Intensidade da emoção |
| `contexto` | string | ❌ Não | Contexto da situação |
| `dominio_vida` | string | ❌ Não | "trabalho", "relacionamento", etc. |
| `padrao_comportamental` | string | ❌ Não | Padrão identificado |
| `categoria` | string | ❌ Não | Categoria adicional |
| `nivel_abertura` | number | ❌ Não | Nível de vulnerabilidade (0-10) |
| `analise_resumo` | string | ❌ Não | Análise detalhada |
| `tags` | array[string] | ❌ Não | Tags de classificação |
| `mensagem_id` | string | ❌ Não | ID da mensagem que gerou |
| `created_at` | ISO string | ❌ Não | Timestamp criação |

### Exemplo com todos os campos:

```json
{
  "type": "memory_saved",
  "payload": {
    "memory": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "usuario_id": "user-123-abc",
      "mensagem_id": "msg-456-def",
      "resumo_eco": "Usuário experencia tristeza profunda relacionada a uma situação de relacionamento. Expressa sentimentos de inadequação e medo de abandono.",
      "emocao_principal": "tristeza",
      "intensidade": 9,
      "contexto": "Usuário estava falando sobre um desentendimento recente com parceiro. Mencionou falta de comunicação e sente-se isolado.",
      "dominio_vida": "relacionamento",
      "padrao_comportamental": "Tendência a internalizar problemas e evitar confrontação direta",
      "categoria": "emocional",
      "nivel_abertura": 7,
      "analise_resumo": "Identificado padrão de ansiedade em relacionamentos. Usuário mostra sabedoria emocional mas teme rejeição. Oportunidade de trabalhar comunicação assertiva.",
      "tags": ["tristeza", "relacionamento", "medo", "isolamento"],
      "created_at": "2025-11-15T15:30:00Z"
    },
    "primeiraMemoriaSignificativa": false
  }
}
```

---

## 🛠️ INTEGRAÇÃO COM SUPABASE

Se estiver usando Supabase (RLS), configure assim:

### 1️⃣ Tabela `memorias`:

```sql
CREATE TABLE memorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resumo_eco text NOT NULL,
  emocao_principal text,
  intensidade smallint,
  contexto text,
  dominio_vida text,
  padrao_comportamental text,
  categoria text,
  nivel_abertura smallint,
  analise_resumo text,
  tags text[],
  mensagem_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_memorias_usuario_id ON memorias(usuario_id);
CREATE INDEX idx_memorias_created_at ON memorias(created_at DESC);
```

### 2️⃣ RLS Policy:

```sql
ALTER TABLE memorias ENABLE ROW LEVEL SECURITY;

-- Usuários podem apenas ler suas próprias memórias
CREATE POLICY "Users can only read their own memories"
  ON memorias FOR SELECT
  USING (auth.uid() = usuario_id);

-- Usuários podem apenas criar memórias para si mesmos
CREATE POLICY "Users can only create their own memories"
  ON memorias FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

-- Usuários podem apenas atualizar suas próprias memórias
CREATE POLICY "Users can only update their own memories"
  ON memorias FOR UPDATE
  USING (auth.uid() = usuario_id);

-- Usuários podem apenas deletar suas próprias memórias
CREATE POLICY "Users can only delete their own memories"
  ON memorias FOR DELETE
  USING (auth.uid() = usuario_id);
```

### 3️⃣ Ao inserir via RPC:

```sql
CREATE OR REPLACE FUNCTION registrar_memoria(
  p_usuario_id uuid,
  p_resumo_eco text,
  p_emocao_principal text DEFAULT NULL,
  p_intensidade smallint DEFAULT NULL,
  p_contexto text DEFAULT NULL,
  p_dominio_vida text DEFAULT NULL,
  p_padrao_comportamental text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_nivel_abertura smallint DEFAULT NULL,
  p_analise_resumo text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_mensagem_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  usuario_id uuid,
  resumo_eco text,
  created_at timestamp with time zone,
  primeira_memoria_significativa boolean
) AS $$
DECLARE
  v_primeira_significativa boolean;
  v_memory_id uuid;
BEGIN
  -- Verificar se é a primeira memória significativa (intensidade >= 7)
  v_primeira_significativa := COALESCE(p_intensidade, 0) >= 7
    AND NOT EXISTS (
      SELECT 1 FROM memorias
      WHERE usuario_id = p_usuario_id
      AND intensidade >= 7
    );

  -- Inserir memória
  INSERT INTO memorias (
    usuario_id,
    resumo_eco,
    emocao_principal,
    intensidade,
    contexto,
    dominio_vida,
    padrao_comportamental,
    categoria,
    nivel_abertura,
    analise_resumo,
    tags,
    mensagem_id
  ) VALUES (
    p_usuario_id,
    p_resumo_eco,
    p_emocao_principal,
    p_intensidade,
    p_contexto,
    p_dominio_vida,
    p_padrao_comportamental,
    p_categoria,
    p_nivel_abertura,
    p_analise_resumo,
    p_tags,
    p_mensagem_id
  ) RETURNING memorias.id INTO v_memory_id;

  -- Retornar resultado
  RETURN QUERY
  SELECT
    memorias.id,
    memorias.usuario_id,
    memorias.resumo_eco,
    memorias.created_at,
    v_primeira_significativa;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 🚦 QUANDO ENVIAR O EVENTO

### Critérios para salvar memória:

Você decide quando salvar (lógica do backend), mas sugestões:

1. **Sempre quando há sinal de emoção forte**
   - Palavras-chave: "triste", "feliz", "com medo", "raiva", "ansioso"
   - Intensidade >= 6/10

2. **Padrões comportamentais detectados**
   - Se a IA identificou um padrão recorrente
   - Se é uma realização/insight do usuário

3. **Mudanças significativas de estado**
   - Progresso em terapia
   - Resolução de conflito

### NÃO enviar quando:

- Apenas pergunta factual (ex: "qual é a capital do Brasil?")
- Pequena conversa cotidiana
- Erro do servidor

---

## 🔒 SEGURANÇA

### ✅ Obrigatório:

1. **Validar JWT**: Extrair `usuario_id` do token
2. **RLS ativo**: Garantir que memórias estejam protegidas
3. **Sanitizar input**: Limpar dados antes de salvar
4. **Rate limiting**: Não salvar >10 memórias por minuto
5. **Validação**: Garantir que `resumo_eco` não esteja vazio

### ⚠️ Cuidados:

```typescript
// ❌ ERRADO - Usuário pode hackear usuario_id
const memoriaData = {
  usuario_id: req.body.usuario_id, // NÃO!
  ...
};

// ✅ CORRETO - Extrair do JWT
const memoriaData = {
  usuario_id: req.user.id, // Do token JWT
  ...
};
```

---

## 🎯 RESUMO: 5 PASSOS PARA IMPLEMENTAR

### 1. Identificar quando salvar
```typescript
if (temEmocaoForte(mensagem) || temPadraoComportamental(analise)) {
  // Continuar com passo 2
}
```

### 2. Estruturar dados
```typescript
const memoria = {
  usuario_id: req.user.id,
  resumo_eco: analiseIA.resumo,
  emocao_principal: analiseIA.emocao,
  intensidade: analiseIA.intensidade,
  // ... outros campos
};
```

### 3. Enviar evento SSE
```typescript
res.write('data: ' + JSON.stringify({
  type: 'memory_saved',
  payload: { memory: memoria }
}) + '\n\n');
```

### 4. Persistir no banco
```typescript
await db.memorias.insert(memoria);
```

### 5. Pronto!
```
Frontend receberá o evento, processará automaticamente
e salvará novamente no banco (duplicação, mas segura).
```

---

## 📞 REFERÊNCIAS

- **Frontend**: `/src/hooks/useEcoStream/streamEventHandlers.ts` (linhas 584-699)
- **API esperada**: `POST /api/memorias/registrar`
- **Formato SSE**: [SSE Spec](https://html.spec.whatwg.org/multipage/server-sent-events.html)

---

## ❓ DÚVIDAS COMUNS

**P: E se o evento memory_saved for enviado mas a API falhar?**
R: O frontend vai fazer retry automaticamente via `registrarMemoria()`. Fica salvo mesmo assim.

**P: Preciso enviar no done ou pode ser antes?**
R: Pode ser qualquer momento durante o streaming. Frontend processa assim que recebe.

**P: E se tiver múltiplas memórias em uma conversa?**
R: Envie múltiplos eventos `memory_saved`, um para cada memória.

**P: O usuario_id pode vir vazio?**
R: Não! É obrigatório. Frontend vai ignorar se estiver vazio.

**P: Que formato de data usar?**
R: ISO 8601: `2025-11-15T15:30:00Z`

---

## ✅ CHECKLIST FINAL

Antes de considerar pronto:

- [ ] Rota `/api/ask-eco` envia SSE `memory_saved`
- [ ] Campo `usuario_id` está presente no evento
- [ ] Campo `resumo_eco` está presente e não vazio
- [ ] RLS está habilitado na tabela `memorias`
- [ ] JWT está sendo validado corretamente
- [ ] Teste manual: abri console e vi logs `[Memory]`
- [ ] Teste manual: memória aparece em `/api/memorias` (GET)
- [ ] Teste manual: memória aparece na página de Memórias

---

**Quando terminar: avise que o backend está pronto e faço um teste integrado!** 🚀
