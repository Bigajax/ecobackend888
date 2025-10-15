# Thompson Sampling Bandits

Módulos em `./thompson.ts` e `./storage.ts` implementam os bandits de Thompson Sampling usados para escolher variantes de módulos por pilar (Linguagem, Encerramento, Modulação).

- `thompson.ts` expõe inicialização, escolha (`pickArm`) e atualização (`updateArm`) dos parâmetros Beta.
- `storage.ts` persiste o estado agregando cache em memória e fallback em `.cache/bandits.json` para sobreviver a reinícios do serviço.

Os bandits trabalham com recompensas normalizadas em `[-1, 1]` derivadas do score `Q` no final da resposta. O estado é persistido automaticamente pela camada de finalização (`src/core/responseFinalizer.ts`).
