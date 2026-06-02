# 🏗️ Architecture Documentation

Documentação de arquitetura, design e configuração do ECO Backend.

---

## 📚 Documentação Principal

### 🏛️ System Architecture
**Arquivo**: [`ARCHITECTURE.md`](ARCHITECTURE.md)

Visão geral completa da arquitetura do ECO Backend:
- Core components
- Request pipeline
- Service orchestration
- Data flow

**Quando ler**: Quando você quer entender como tudo funciona

---

### 🧠 ECO Context Engine
**Arquivo**: [`ECO_CONTEXT_ENGINE.md`](ECO_CONTEXT_ENGINE.md)

Documentação do motor de contexto do ECO:
- Dynamic context assembly
- Prompt building
- Module selection
- Token optimization

---

### 📊 Data Model
**Arquivo**: [`DATA_MODEL.md`](DATA_MODEL.md)

Modelo de dados completo:
- Database schema
- Tables and relationships
- Indexes
- RLS policies

---

## ⚙️ Configuration & Setup

### 🔧 Environment Variables
**Arquivo**: [`ENVIRONMENT.md`](ENVIRONMENT.md)

Todas as variáveis de ambiente do backend:
- Required variables
- Optional settings
- Examples
- Validation

---

### 🔒 Security & RLS
**Arquivo**: [`SECURITY.md`](SECURITY.md)

Segurança e Row-Level Security:
- JWT validation
- RLS policies
- CORS configuration
- Input validation

---

## 📖 API & References

### 📘 API Reference
**Arquivo**: [`API_REFERENCE.md`](API_REFERENCE.md)

Referência completa das APIs:
- Endpoints
- Parameters
- Responses
- Examples

---

### 📦 Module Manifest
**Arquivo**: [`MANIFEST_ARCHITECTURE.md`](MANIFEST_ARCHITECTURE.md)

Arquitetura de módulos e prompts:
- Module catalog
- Activation rules
- Dependencies
- Loading strategy

---

## 🔍 Observability & Monitoring

### 📊 Observability
**Arquivo**: [`OBSERVABILITY.md`](OBSERVABILITY.md)

Logging, metrics e monitoring:
- Structured logging
- Performance metrics
- Health checks
- Debugging techniques

---

## 🔄 System Guides

### 🎯 System 1-to-1
**Arquivo**: [`ECO_System_1to1_Documentation.md`](ECO_System_1to1_Documentation.md)

Documentação completa do sistema ECO:
- Features
- Workflows
- Integration points

---

### 📜 System Pact
**Arquivo**: [`ECO_1to1_PACT.md`](ECO_1to1_PACT.md)

Contrato/Pact do sistema ECO:
- Commitments
- Expectations
- Interfaces

---

## 🔄 Model & Upgrades

### 📦 Model Upgrade Notes
**Arquivo**: [`MODEL_UPGRADE_NOTES.md`](MODEL_UPGRADE_NOTES.md)

Notas sobre upgrade de modelos:
- Version changes
- Migration path
- Breaking changes
- Compatibility

---

## 🎯 Quick Navigation

### "Quero entender a arquitetura geral"
→ Comece com: [`ARCHITECTURE.md`](ARCHITECTURE.md)

### "Preciso configurar variáveis"
→ Leia: [`ENVIRONMENT.md`](ENVIRONMENT.md)

### "Como as APIs funcionam?"
→ Veja: [`API_REFERENCE.md`](API_REFERENCE.md)

### "Qual é o modelo de dados?"
→ Veja: [`DATA_MODEL.md`](DATA_MODEL.md)

### "Como fazer deploy seguro?"
→ Leia: [`SECURITY.md`](SECURITY.md)

### "Como monitorar o sistema?"
→ Veja: [`OBSERVABILITY.md`](OBSERVABILITY.md)

---

## 📊 Estrutura

```
architecture/
├── README.md (você está aqui)
│
├── 🏗️ Core Architecture
│   ├── ARCHITECTURE.md
│   ├── ECO_CONTEXT_ENGINE.md
│   ├── ECO_System_1to1_Documentation.md
│   └── ECO_1to1_PACT.md
│
├── 📊 Data & Design
│   ├── DATA_MODEL.md
│   ├── API_REFERENCE.md
│   └── MANIFEST_ARCHITECTURE.md
│
├── ⚙️ Configuration
│   ├── ENVIRONMENT.md
│   ├── SECURITY.md
│   └── MODEL_UPGRADE_NOTES.md
│
└── 🔍 Observability
    └── OBSERVABILITY.md
```

---

## 🔗 Relacionado

- Troubleshooting: [`../troubleshooting/`](../troubleshooting/)
- Guides: [`../guides/`](../guides/)
- Índice principal: [`../INDEX.md`](../INDEX.md)
- Main docs: [`../../CLAUDE.md`](../../CLAUDE.md)

---

## 💡 Tips

1. **Leia ARCHITECTURE.md primeiro** se for novo no projeto
2. **ENVIRONMENT.md é crítico** para setup
3. **SECURITY.md é importante** para produção
4. **OBSERVABILITY.md ajuda com debugging**

---

## 📝 Contribuindo

Se modificar a arquitetura:
1. Atualize os documentos relevantes
2. Atualize este README se necessário
3. Aumente versão na documentação
4. Documente breaking changes

---

**Última atualização**: 2025-11-06
**Versão**: 2.0

---

Alguma pergunta sobre arquitetura? Consulte os documentos acima! 🔍
