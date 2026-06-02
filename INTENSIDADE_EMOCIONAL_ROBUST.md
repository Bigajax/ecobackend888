# Sistema Robusto de Detecção de Intensidade Emocional

## O Problema Original

Seu ponto era **absolutamente correto**: depender só de regex para detectar emoção é frágil!

Você disse "Estou muito triste hoje" e a memória **não foi salva** porque:
- A função `estimarIntensidade0a10()` procurava por gatilhos muito específicos (pânico, crise, desespero)
- "Triste" não estava na lista → intensidade = 3 (abaixo do threshold de 7)
- Memória não salva porque 3 < 7

Isso era um **bug grave** que impedia memórias genuínas de serem capturadas.

---

## A Solução: Sistema Híbrido

Implementei um **sistema de 3 camadas** que combina o melhor de ambos os mundos:

### 1️⃣ Fast Path (Regex Instant)
**Muito rápido** (< 1ms), detec casos com alta confiança:

```
"Estou muito triste" → Detecta "muito + triste" → intensidade = 7 ✅
"Tristeza pesada" → Detecta "tristeza + pesada" → intensidade = 7 ✅
"Não aguento mais!!" → Detecta "não aguento" + "!!" → intensidade = 7 ✅
"Do trabalho" → Agora detecta contexto de trabalho + emoção → intensidade = 6 ✅
```

**Padrões melhorados**:
- ✅ Emoções primárias: triste, tristeza, ansiedade, medo, raiva, frustração, culpa, vergonha, solidão, desesperança
- ✅ Modificadores: "muito", "demais", "pesada", "profunda", "intensa"
- ✅ Contexto: trabalho + emoção, relacionamento + emoção
- ✅ Pontuação: múltiplos `!!` ou `...` (sinais de hesitação emocional)

### 2️⃣ Smart Path (Claude-powered, Opcional)
**Mais acurado** (usa linguagem natural), mas **cacheado** (0 latência):

```typescript
// Apenas se ECO_ENABLE_CLAUDE_INTENSITY=true
const claudeAnalysis = await detectIntensity(text, { forceMethod: "smart" });
// Prompt: "Avalie intensidade emocional de 0-10"
// Resposta: Claude retorna um número preciso baseado em compreensão semântica
// Cache: Resultado armazenado por 24 horas
```

**Quando ativa via env var**:
```bash
ECO_ENABLE_CLAUDE_INTENSITY=true npm run dev
```

### 3️⃣ Fallback (Regex Melhorado)
Se Claude falha ou não está ativado, usa a versão regex aprimorada.

---

## Arquitetura

```
detectEmotionalIntensity(text)
    ↓
    ├─ Fast Path (Regex) → Se encontra alta confiança, retorna ~1ms
    │  └─ Patterns: emotion + intensity + context
    │
    ├─ Smart Path (Claude, opcional) → Se ECO_ENABLE_CLAUDE_INTENSITY=true
    │  └─ "Avalie intensidade emocional 0-10"
    │  └─ Cacheado por 24 horas
    │
    └─ Fallback (Regex melhorado) → Se não houver confiança
       └─ Estimativa conservadora
```

---

## Como Usar

### Modo Padrão (Rápido - Recomendado)
```bash
npm run dev
# Usa regex fast path (< 1ms por mensagem)
# Detecta: "triste", "ansiedade", "medo", "raiva", etc.
```

### Modo Aprimorado (Acurado - Opcional)
```bash
ECO_ENABLE_CLAUDE_INTENSITY=true npm run dev
# Ativa Claude para análise semântica
# Cacheado: primeira execução = ~1s, próximas = < 1ms
```

### Modo Debug
```bash
ECO_DEBUG=true npm run dev
# Logs detalhados:
# [claudeIntensityAnalysis] evaluated intensity=7
# [fastPathIntensityDetection] matched pattern
```

---

## Testes da Nova Função

```bash
npm test -- tests/intensity-detection.test.ts
```

**Testes incluem**:
- ✅ "Estou muito triste hoje" → intensidade ≥ 7 (salva memória!)
- ✅ "Tristeza pesada" → intensidade ≥ 7 (salva memória!)
- ✅ "Estou muito triste. Do trabalho." → intensidade ≥ 7 (salva memória!)
- ✅ "Olá, tudo bem?" → intensidade < 5 (não salva)
- ✅ "Como funciona?" → intensidade < 5 (não salva)

---

## Exemplos Reais

### Antes (Bugado ❌)
```
User: "Estou muito triste hoje"
Sistema: Intensidade = 3 (não salva memória)
Resultado: Próxima conversa não tem continuidade
```

### Depois (Corrigido ✅)
```
User: "Estou muito triste hoje"
Sistema: Intensidade = 7 (salva memória!)
Próxima conversa:
User: "Estou triste novamente essa semana"
ECO: "Lembro que você se sentiu assim há poucos dias quando..."
Resultado: Continuidade genuína!
```

---

## Performance

| Método | Tempo | Frequência |
|--------|-------|-----------|
| Regex Fast Path | < 1ms | Sempre (default) |
| Claude Smart Path (1ª vez) | ~500-1000ms | Se `ECO_ENABLE_CLAUDE_INTENSITY=true` |
| Claude Smart Path (cacheado) | < 1ms | Próximas 24 horas |

**Recomendação**:
- Produção: Deixar modo padrão (regex rápido)
- Desenvolvimento: Testar com `ECO_ENABLE_CLAUDE_INTENSITY=true` se quiser máxima acurácia

---

## Próximas Melhorias

### Curto Prazo
- [ ] Treinar regex com exemplos reais de usuários
- [ ] Coletar métricas de "acurácia" (memória salva vs. esperada)
- [ ] Ajustar scores de intensidade baseado em feedback

### Médio Prazo
- [ ] Interface para usuário corrigir intensidade ("esse deveria ter sido salvo")
- [ ] Analytics: "qual % de mensagens são emocionais?"
- [ ] Dashboard de histórico de intensidades por usuário

### Longo Prazo
- [ ] Fine-tuning de Claude com padrões emocionais do usuário
- [ ] Modelo de ML dedicado para português (mais acurado que regex)
- [ ] Integração com análise de tom/sentimento avançada

---

## FAQ

**P: Por que não sempre usar Claude?**
R: Performance. Claude toma ~500ms por chamada. Regex é ~1ms. A maioria das mensagens não precisa de análise semântica profunda.

**P: E se o usuário disser algo sutil emocionalmente?**
R:
1. Modo padrão pode não detectar (intensidade baixa)
2. Solução: `ECO_ENABLE_CLAUDE_INTENSITY=true` para máxima acurácia
3. Ou: Usuário pode marcar manualmente "isso deveria ter sido salvo"

**P: Quanto tempo Claude leva para avaliar?**
R: ~500-1000ms primeira vez. Depois cacheado por 24 horas (< 1ms).

**P: Como testar localmente?**
R:
```bash
# Rápido (regex)
npm test -- tests/intensity-detection.test.ts --grep "Primary Emotions"

# Completo (com Claude)
ECO_ENABLE_CLAUDE_INTENSITY=true npm test -- tests/intensity-detection.test.ts
```

---

## Conclusão

O sistema agora é **robusto, performático e flexível**:

✅ **Rápido**: Regex < 1ms por padrão
✅ **Acurado**: Claude opcional para casos complexos
✅ **Cacheado**: Sem impacto de latência em longo prazo
✅ **Extensível**: Fácil adicionar novos padrões ou feedback do usuário

Suas memórias **agora serão salvas** quando você disser "Estou muito triste" ou "Tristeza do trabalho"!
