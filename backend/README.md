📋 Visão Geral
Backend Node.js do ECO expõe APIs HTTP/SSE para orquestrar conversas, telemetria e relatórios emocionais apoiados em Supabase e serviços de IA.

🚀 Quick Start
- cd server
- npm install
- npm run dev

📁 Estrutura
- src/ → analytics/, bandits/, core/, orchestrator/, promptPlan/, quality/, utils/
- server/ → core/http, domains/, routes/, services/, middleware/, bootstrap/, scripts/
- assets/ → módulos obrigatórios carregados em runtime (server/dist/assets)
- tests/ → server/tests/ (Jest), tests/ e __tests__/ para cenários adicionais
- tools/ & scripts/ → automações ts-node (bandit, Supabase, smoke)

🛠️ Tech Stack (principais)
- Node.js 18+, Express 4/5, Nodemon (dev)
- Supabase JS SDK, Postgres (persistência)
- Zod para validações, Axios HTTP
- OpenRouter/OpenAI, ElevenLabs TTS, Mixpanel analytics

🔧 Variáveis de Ambiente
- Database: DATABASE_URL=N/D (usa Supabase) e SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, SUPABASE_ANALYTICS_SERVICE_ROLE_KEY
- Modelos: OPENROUTER_API_KEY, ECO_CLAUDE_MODEL(_FALLBACK), ECO_CLAUDE_TIMEOUT_MS, ECO_MODEL_TECH(_ALT)
- Voz & mídia: ELEVEN_VOICE_ID, VOICE_MAX_AUDIO_BYTES
- Rate/guest: GUEST_RATE_LIMIT, GUEST_MAX_INTERACTIONS, API_RATE_LIMIT_WINDOW_MS, API_RATE_LIMIT_MAX_REQUESTS
- Operação: PORT, DOTENV_PATH, ECO_DEBUG, ECO_LOG_LEVEL, ECO_BANDIT_SHADOW/EARLY/PILOT_PERCENT, ECO_SSE_TIMEOUT_MS

📜 Scripts-chave
- dev — `npm run dev` (server/) inicia Nodemon com server.ts
- build — `npm run build` (server/) copia assets e compila TypeScript para dist/
- start — `npm run start` (server/) executa dist/server.js
- test — `npm run test` (raiz) roda Jest de contratos (`jest.contract.config.ts`)
- migrate — Seção omitida se não detectado

🔗 Endpoints Principais
- GET /health — ping HTTP simples para liveness
- GET /api/health — status de prompts e módulos carregados
- POST /api/ask-eco — fluxo principal de chat/SSE com orquestração e telemetria
- POST /api/voice/tts — gera áudio MP3 via ElevenLabs para texto enviado
- POST /api/voice/transcribe-and-respond — transcreve áudio, registra métricas e responde via IA
- GET /api/perfil-emocional, POST /api/perfil-emocional/update — leitura/atualização de perfis emocionais (admin)
- GET /api/relatorio-emocional — monta relatório emocional do usuário
- POST /api/feedback — registra feedback textual do usuário
- POST /api/mensagens — persiste mensagens e sinaliza salvamento de memórias
- POST /api/module-usage, PUT /api/bandit/arms, PUT /api/policy — telemetria de módulos e ajustes operacionais
- POST /api/guest/claim, POST /api/signal — gestão de guest IDs e sinais rápidos

🏗️ Arquitetura (fluxo simples)
flowchart LR
  Client -->|HTTP/SSE| API[Routes/Controllers] --> Services --> DB[(Database)]

🧪 Testes & Qualidade (se existir)
- Jest (`npm run test`) para contratos de API e integrações críticas
- TypeScript (`npm run build`) valida tipos antes de gerar build
- Scripts adicionais (`ts-node` em server/scripts) fazem smoke de Supabase e bandit

❗Observações
- Requer assets pré-compilados em server/dist/assets para subir com sucesso
- Configurações Supabase precisam de tabelas existentes (perfis, memórias, telemetria)
- Ajuste variáveis ECO_* para personalizar limites de streaming, budgets e bandits
- Endpoints admin exigem middleware requireAdmin com autenticação válida
