# 🔧 Troubleshooting Guide

Bem-vindo à seção de troubleshooting! Aqui você encontra documentação para resolver problemas comuns no backend ECO.

---

## 🎯 Problemas Documentados

### 🆘 NON_SSE_EMPTY Error

**Sintomas**:
- Claude Sonnet retorna status 200
- Mas resposta é vazia ou não é SSE válido
- Erro: `NON_SSE_EMPTY`
- Streaming falha sem retry

**Solução**: [`non-sse-empty/`](non-sse-empty/)
- Comece com: [`non-sse-empty/README.md`](non-sse-empty/README.md)
- Implementação rápida: [`non-sse-empty/QUICK_REFERENCE.md`](non-sse-empty/QUICK_REFERENCE.md)
- Passo-a-passo: [`non-sse-empty/IMPLEMENTATION_GUIDE.md`](non-sse-empty/IMPLEMENTATION_GUIDE.md)

---

### 🌊 Streaming Issues

**Sintomas**:
- SSE stream não funciona corretamente
- Chunks chegam quebrados
- Timeout ou desconexão
- Problemas de robustez

**Solução**: [`streaming/`](streaming/)
- Análise: [`streaming/STREAMING_FIX_ANALYSIS.md`](streaming/STREAMING_FIX_ANALYSIS.md)
- Robustez: [`streaming/SSE_ROBUSTNESS_FIXES.md`](streaming/SSE_ROBUSTNESS_FIXES.md)
- Testes: [`streaming/SSE_TESTING_GUIDE.md`](streaming/SSE_TESTING_GUIDE.md)

---

### 🐛 Outros Bugs

**Cobertura**:
- FIX_SUMMARY.md - Sumário de todas as fixes
- REAL_BUG_FIX.md - Bug de rethrow
- ERROR_400_BAD_REQUEST_EXPLAINED.md - Erros 400
- FEEDBACK_SYSTEM_FIXES.md - Sistema de feedback
- E mais...

**Localização**: [`bugs/`](bugs/)

---

## 🚀 Como Usar Esta Seção

### Passo 1: Identificar o Problema
Qual é o seu problema?
- NON_SSE_EMPTY? → Vá para `non-sse-empty/`
- Streaming quebrado? → Vá para `streaming/`
- Outro bug? → Vá para `bugs/`

### Passo 2: Ler a Documentação
- Comece pelo **README.md** da pasta
- Depois leia o **QUICK_REFERENCE.md**
- Se precisar implementar: **IMPLEMENTATION_GUIDE.md**

### Passo 3: Implementar a Solução
Use o código/instruções fornecidas no documento

### Passo 4: Testar
Siga o guia de teste no documento

### Passo 5: Deploy
Faça commit e deploy para produção

---

## 📊 Status dos Problemas

| Problema | Status | Docs | Implementação |
|----------|--------|------|---------------|
| NON_SSE_EMPTY | ✅ Resolvido | ✅ Completo | ✅ Pronto |
| Streaming Issues | ✅ Resolvido | ✅ Completo | ✅ Pronto |
| 400 Bad Request | ✅ Resolvido | ✅ Completo | ✅ Pronto |
| Feedback System | ✅ Resolvido | ✅ Completo | ✅ Pronto |

---

## 💡 Tips

1. **Sempre use QUICK_REFERENCE** - Geralmente resolve o problema em 5 min
2. **Se não funcionar** - Leia a análise/diagrama para entender melhor
3. **Código pronto** - Procure por `.ts` files nos documentos
4. **Teste primeiro** - Use os guias de teste antes de fazer deploy

---

## 🔗 Relacionado

- Voltar para: [`docs/INDEX.md`](../INDEX.md)
- Documentação principal: [`../CLAUDE.md`](../../CLAUDE.md)
- Arquitetura: [`docs/architecture/`](../architecture/)

---

## 📝 Adicionando Novos Problemas

Se encontrar um novo problema:
1. Crie uma pasta: `problema-nome/`
2. Adicione `README.md` e `QUICK_REFERENCE.md`
3. Inclua análise e diagrama se relevante
4. Atualize este arquivo

---

**Última atualização**: 2025-11-06

Algum problema não documentado? Abra uma issue! 📋
