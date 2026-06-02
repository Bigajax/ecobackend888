# Correção: Injeção de Memórias no Contexto da ECO

## Problema Identificado

As memórias estavam sendo **salvas** mas **não eram utilizadas** nas respostas subsequentes. Quando um usuário cadastrado perguntava sobre um sentimento similar a um da semana anterior, a ECO não fazia referência às memórias passadas.

### Causa Raiz

No arquivo `server/services/promptContext/ContextBuilder.ts`, o código original:
1. Tentava recuperar memórias **novamente** de forma síncrona (linhas 426-433)
2. **Ignorava** as memórias que já haviam sido recuperadas em paralelo e passadas via `params.memoriasSemelhantes`
3. Usava um padrão de busca que não era compatível com o novo fluxo de contexto

## Solução Implementada

### Mudança Principal
Substituir a busca redundante de memórias pela reutilização das memórias já recuperadas em `params.memoriasSemelhantes`.

**Arquivo modificado:** `server/services/promptContext/ContextBuilder.ts` (linhas 408-451)

**Antes:**
```typescript
// Tentava buscar memórias novamente (redundante e ineficiente)
const memoriesResult = await buscarMemoriasSemanticasComTimeout({
  usuarioId: userId,
  queryText: texto,
  bearerToken: params.bearerToken ?? undefined,
  topK: 10,
  minScore: 0.30,
  includeRefs: ecoDecision.openness >= 2,
});
```

**Depois:**
```typescript
// Usa memórias que já foram recuperadas em paralelo
const isGuestUser = !params.userId || typeof params.userId !== "string" || params.userId.trim().length === 0;
const hasMemoriesToInject = Array.isArray(memsSemelhantesNorm) && memsSemelhantesNorm.length > 0;

if (!isGuestUser && hasMemoriesToInject) {
  // Formata e injeta as memórias no prompt
  const memoriesFormatted = memsSemelhantesNorm.map((mem: any) => ({
    id: mem.id || "",
    texto: mem.resumo_eco || mem.texto || mem.analise_resumo || "",
    score: typeof mem.similarity === "number" ? mem.similarity : 0.5,
    tags: Array.isArray(mem.tags) ? mem.tags : [],
    dominio_vida: mem.dominio_vida || null,
    created_at: mem.created_at || null,
  }));

  const memoriesSection = formatMemoriesSection(memoriesFormatted, clampTokens(1500, 2000));
  baseWithMemories = injectMemoriesIntoPrompt(base, memoriesSection);
}
```

## Fluxo Agora Correto

```
1. POST /api/ask-eco (usuário autenticado faz pergunta)
   ↓
2. parallelFetch.ts recupera memórias em paralelo → params.memoriasSemelhantes
   ↓
3. contextCache.build() passa memoriasSemelhantes para ContextBuilder
   ↓
4. ContextBuilder.montarContextoEco():
   a. Inicializa contexto com memsSemelhantesNorm
   b. Formata memórias com formatMemoriesSection()
   c. Injeta no prompt com injectMemoriesIntoPrompt()
   ↓
5. Claude recebe prompt com seção "MEMÓRIAS PERTINENTES"
   ↓
6. Claude pode responder como: "Lembro que você se sentiu assim dia X..."
```

## Comportamento

### Para Usuários Cadastrados ✅
- Memórias são recuperadas automaticamente
- São formatadas e injetadas no prompt
- Claude pode fazer referências às memórias passadas
- Exemplo: "Lembro que você sentiu tristeza há 3 dias quando perdeu seu emprego. Vejo que está acontecendo novamente..."

### Para Guests (Convidados) ❌
- Memórias **NÃO** são recuperadas
- Nenhuma seção de memórias é injetada
- Cada conversa é tratada como primeira interação

## Testes

Execute o teste de injeção de memórias:
```bash
npm test -- tests/memory-injection.test.ts
```

### Teste Manual

1. **Criar memória:**
```bash
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mensagem": "Estou me sentindo muito triste porque perdi meu emprego"
  }'
```

2. **Referência de memória (próxima conversa):**
```bash
curl -X POST http://localhost:3001/api/ask-eco \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mensagem": "Estou triste novamente essa semana"
  }'
```

**Esperado:** A resposta incluirá uma referência como:
> "Lembro que você passou por algo similar há alguns dias quando perdeu seu emprego. Resolvemos focando em suas habilidades..."

## Logs de Debug

Para ver as memórias sendo injetadas:
```bash
ECO_DEBUG=true npm run dev
```

Procure por logs como:
```
[ContextBuilder] injecting_semantic_memories
[ContextBuilder] memories_injected
```

## Próximos Passos

1. ✅ Injeta memórias no prompt
2. ⏳ Treinar Claude com exemplos de como referenciar memórias
3. ⏳ Adicionar módulo específico para "memória e continuidade" no manifest
4. ⏳ Melhorar formatação da seção de memórias com datas e emojis

## Arquivos Afetados

- `server/services/promptContext/ContextBuilder.ts` - Lógica de injeção
- `server/services/promptContext/memoryInjector.ts` - Funções auxiliares (já existiam)
- `tests/memory-injection.test.ts` - Novo teste (criado)
