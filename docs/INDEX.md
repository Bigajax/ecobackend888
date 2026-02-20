# 📚 ECO Backend Documentation Index

Bem-vindo à documentação do backend ECO! Esta página te ajuda a navegar pela documentação.

---

## 🚀 Quick Start

**Primeira vez aqui?**
- Comece com: [`QUICK_REFERENCE.md`](QUICK_REFERENCE.md)
- Depois leia: [`CLAUDE.md`](../CLAUDE.md) (Visão geral completa)

---

## 📁 Estrutura de Documentação

### 🔧 Troubleshooting & Bugs

#### 🆘 NON_SSE_EMPTY Error
Resolvendo erros de resposta vazia do Claude Sonnet 4.5.

- 📖 [`README.md`](troubleshooting/non-sse-empty/README.md) - Comece aqui
- ⚡ [`QUICK_REFERENCE.md`](troubleshooting/non-sse-empty/QUICK_REFERENCE.md) - Referência rápida
- 📋 [`IMPLEMENTATION_GUIDE.md`](troubleshooting/non-sse-empty/IMPLEMENTATION_GUIDE.md) - Passo-a-passo
- 🔍 [`ANALYSIS.md`](troubleshooting/non-sse-empty/ANALYSIS.md) - Análise técnica
- 📊 [`FLOW_DIAGRAM.md`](troubleshooting/non-sse-empty/FLOW_DIAGRAM.md) - Diagrama antes/depois
- 💾 [`CLAUDE_ADAPTER_IMPROVEMENTS.ts`](troubleshooting/non-sse-empty/CLAUDE_ADAPTER_IMPROVEMENTS.ts) - Código pronto

#### 🌊 Streaming Issues
Documentação sobre SSE streaming, robustez e testes.

- 📄 [`STREAMING_FIX_ANALYSIS.md`](troubleshooting/streaming/STREAMING_FIX_ANALYSIS.md)
- 🔐 [`SSE_ROBUSTNESS_FIXES.md`](troubleshooting/streaming/SSE_ROBUSTNESS_FIXES.md)
- 🧪 [`SSE_TESTING_GUIDE.md`](troubleshooting/streaming/SSE_TESTING_GUIDE.md)
- 📘 [`PATCH_STREAMING_NOTES.md`](troubleshooting/streaming/PATCH_STREAMING_NOTES.md)
- 🌐 [`SSE_FRONTEND_INTEGRATION.md`](troubleshooting/streaming/SSE_FRONTEND_INTEGRATION.md)
- 📚 [`STREAMING_SSE.md`](troubleshooting/streaming/STREAMING_SSE.md)
- ✅ [`TESTING_STREAMING_FIX.md`](troubleshooting/streaming/TESTING_STREAMING_FIX.md)

#### 🐛 Other Bugs & Fixes
Documentação de outros bugs corrigidos.

- 📋 [`FIX_SUMMARY.md`](troubleshooting/bugs/FIX_SUMMARY.md)
- 🔴 [`REAL_BUG_FIX.md`](troubleshooting/bugs/REAL_BUG_FIX.md)
- 📊 [`COMPLETE_BUG_FIX_SUMMARY.md`](troubleshooting/bugs/COMPLETE_BUG_FIX_SUMMARY.md)
- ⚠️ [`ERROR_400_BAD_REQUEST_EXPLAINED.md`](troubleshooting/bugs/ERROR_400_BAD_REQUEST_EXPLAINED.md)
- 📝 [`FEEDBACK_SYSTEM_FIXES.md`](troubleshooting/bugs/FEEDBACK_SYSTEM_FIXES.md)

---

### 📖 Guides

Guias operacionais e de desenvolvimento.

- 🚀 [`DEPLOY_RUNBOOK.md`](guides/DEPLOY_RUNBOOK.md) - Checklist de deploy
- 🧪 [`TESTING.md`](guides/TESTING.md) - Guia de testes

---

### 🏗️ Architecture & Design

Documentação de arquitetura, modelos de dados e configuração.

- 🏛️ [`ARCHITECTURE.md`](architecture/ARCHITECTURE.md) - Visão geral da arquitetura
- 📊 [`API_REFERENCE.md`](architecture/API_REFERENCE.md) - Referência de APIs
- 💾 [`DATA_MODEL.md`](architecture/DATA_MODEL.md) - Modelo de dados
- ⚙️ [`ENVIRONMENT.md`](architecture/ENVIRONMENT.md) - Variáveis de ambiente
- 🔍 [`OBSERVABILITY.md`](architecture/OBSERVABILITY.md) - Observabilidade e logs
- 🔒 [`SECURITY.md`](architecture/SECURITY.md) - Segurança e RLS
- 📦 [`MANIFEST_ARCHITECTURE.md`](architecture/MANIFEST_ARCHITECTURE.md) - Arquitetura de modules
- 🔄 [`MODEL_UPGRADE_NOTES.md`](architecture/MODEL_UPGRADE_NOTES.md) - Upgrade do modelo
- 🧠 [`ECO_SYSTEM_1to1_DOCUMENTATION.md`](architecture/ECO_System_1to1_Documentation.md) - Sistema ECO completo
- 🔧 [`ECO_CONTEXT_ENGINE.md`](architecture/ECO_CONTEXT_ENGINE.md) - Motor de contexto
- 📜 [`ECO_1to1_PACT.md`](architecture/ECO_1to1_PACT.md) - Pact do sistema

---

### 📚 Root Documentation

- 🎯 [`QUICK_REFERENCE.md`](QUICK_REFERENCE.md) - Quick start geral
- 📋 [`IMPLEMENTATION_SUMMARY.md`](IMPLEMENTATION_SUMMARY.md) - Sumário de implementações
- 👥 [`FRONTEND_1ON1_BRIEFING.md`](FRONTEND_1ON1_BRIEFING.md) - Briefing frontend
- 📖 [`../CLAUDE.md`](../CLAUDE.md) - **Documentação principal (NÃO MOVER)**

---

## 🎯 Por Tipo de Problema

### "Tenho um erro NON_SSE_EMPTY"
→ Comece em: [`troubleshooting/non-sse-empty/README.md`](troubleshooting/non-sse-empty/README.md)

### "Streaming não funciona corretamente"
→ Comece em: [`troubleshooting/streaming/SSE_ROBUSTNESS_FIXES.md`](troubleshooting/streaming/SSE_ROBUSTNESS_FIXES.md)

### "Preciso fazer deploy"
→ Comece em: [`guides/DEPLOY_RUNBOOK.md`](guides/DEPLOY_RUNBOOK.md)

### "Preciso entender a arquitetura"
→ Comece em: [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md)

### "Como configurar variáveis de ambiente?"
→ Leia: [`architecture/ENVIRONMENT.md`](architecture/ENVIRONMENT.md)

### "Quero entender como funciona a segurança?"
→ Leia: [`architecture/SECURITY.md`](architecture/SECURITY.md)

---

## 📊 Mapa Visual

```
docs/
├── INDEX.md (você está aqui!)
├── QUICK_REFERENCE.md
├── IMPLEMENTATION_SUMMARY.md
├── FRONTEND_1ON1_BRIEFING.md
│
├── troubleshooting/
│   ├── non-sse-empty/
│   │   ├── README.md
│   │   ├── QUICK_REFERENCE.md
│   │   ├── IMPLEMENTATION_GUIDE.md
│   │   ├── ANALYSIS.md
│   │   ├── FLOW_DIAGRAM.md
│   │   └── CLAUDE_ADAPTER_IMPROVEMENTS.ts
│   ├── streaming/
│   │   ├── STREAMING_FIX_ANALYSIS.md
│   │   ├── SSE_ROBUSTNESS_FIXES.md
│   │   ├── SSE_TESTING_GUIDE.md
│   │   ├── PATCH_STREAMING_NOTES.md
│   │   ├── SSE_FRONTEND_INTEGRATION.md
│   │   ├── STREAMING_SSE.md
│   │   └── TESTING_STREAMING_FIX.md
│   └── bugs/
│       ├── FIX_SUMMARY.md
│       ├── REAL_BUG_FIX.md
│       ├── COMPLETE_BUG_FIX_SUMMARY.md
│       ├── ERROR_400_BAD_REQUEST_EXPLAINED.md
│       └── FEEDBACK_SYSTEM_FIXES.md
│
├── guides/
│   ├── DEPLOY_RUNBOOK.md
│   └── TESTING.md
│
└── architecture/
    ├── ARCHITECTURE.md
    ├── API_REFERENCE.md
    ├── DATA_MODEL.md
    ├── ENVIRONMENT.md
    ├── OBSERVABILITY.md
    ├── SECURITY.md
    ├── MANIFEST_ARCHITECTURE.md
    ├── MODEL_UPGRADE_NOTES.md
    ├── ECO_System_1to1_Documentation.md
    ├── ECO_CONTEXT_ENGINE.md
    └── ECO_1to1_PACT.md
```

---

## 🔗 Links Úteis

- **Repositório**: Raiz do projeto
- **Servidor Principal**: `server/`
- **Testes**: `tests/`
- **Supabase**: `supabase/`

---

## 💡 Tips

1. **Sempre comece pelo README ou QUICK_REFERENCE** da pasta relevante
2. **Use ARCHITECTURE.md** para entender o sistema todo
3. **Use DEPLOY_RUNBOOK.md** antes de fazer deploy
4. **Mantenha CLAUDE.md atualizado** - é a fonte de verdade

---

## 📝 Contribuindo

Se adicionar nova documentação:
1. Coloque na pasta apropriada
2. Atualize este INDEX.md
3. Use o mesmo formato de outros documentos
4. Inclua headers com emojis para fácil identificação

---

**Última atualização**: 2025-11-06
**Versão**: 1.0

---

Alguma dúvida? Procure no índice acima! 🔍
