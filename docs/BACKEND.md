⚙️ Backend — Orquestrador ECO Core
📋 Visão Geral

Servidor Node.js 18+ que expõe APIs HTTP e SSE para:

orquestrar diálogos (voz ↔ texto ↔ voz);

registrar memórias e perfis emocionais no Supabase;

executar relatórios e bandits de personalização;

servir módulos TXT de heurísticas e prompts filosóficos.

🚀 Quick Start
cd server
npm install
npm run dev

📁 Estrutura
server/
├── src/
│   ├── routes/            # Endpoints REST/SSE
│   ├── services/          # Lógica de IA, voz, Supabase
│   ├── orchestrator/      # getEcoResponse / montagem de contexto
│   ├── analytics/         # Mixpanel e telemetria
│   ├── utils/, middleware/, bootstrap/
│   └── core/, bandits/, promptPlan/
├── assets/                # Módulos .txt carregados em runtime
├── scripts/               # Migrações, smoke, bandit runner
└── tests/                 # Jest contracts e integrações

🛠️ Tech Stack (chaves)
Categoria	Ferramenta
Runtime	Node 18 +, Express 5
Banco	Supabase (Postgres + Storage)
IA / TTS	OpenRouter (GPT/Claude), ElevenLabs
Validação	Zod
Monitoramento	Mixpanel, Supabase Analytics
Testes	Jest (contratos e2e)
🔧 Variáveis de Ambiente (essenciais)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
ELEVEN_VOICE_ID=
ECO_MODEL_TECH=gpt-4o
PORT=8080
ECO_SSE_TIMEOUT_MS=60000


⚠️ O deploy só sobe com assets pré-compilados em server/dist/assets.

📜 Scripts Úteis
Script	Descrição
dev	Nodemon + TypeScript hot reload
build	Compila TS → dist e copia assets
start	Executa build em produção
test	Roda contratos de API (Jest)
migrate	Executa scripts Supabase (SQL ou ts-node)
🔗 Principais Endpoints
Método	Rota	Função
GET	/health	Ping de liveness
POST	/api/ask-eco	Chat streaming SSE
POST	/api/voice/tts	Texto → voz MP3
POST	/api/voice/transcribe-and-respond	Áudio → texto → resposta
GET/POST	/api/perfil-emocional	Perfil emocional do usuário
GET	/api/relatorio-emocional	Gera mapas e linha do tempo
POST	/api/feedback	Feedback like/dislike
PUT	/api/bandit/arms	Atualiza pesos de módulos IA
🧱 Fluxo Arquitetural
flowchart LR
User -->|HTTP/SSE| Routes --> Services --> Supabase[(DB)]
Services --> OpenRouter[LLM] --> ElevenLabs[TTS]
Services --> Mixpanel[Analytics]

🧪 Testes & Qualidade

npm run test → Jest contratos de resposta e telemetria

TypeScript estrito + ESLint

CI Render/Vercel valida build e assets