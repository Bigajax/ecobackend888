// server/utils/index.ts
export {
  now, sleep, mapRoleForOpenAI, limparResposta, formatarTextoEco, ensureEnvs
} from "./text";

export {
  LOG_LEVEL, MAX_PROMPT_TOKENS, NIVEL1_BUDGET, HARD_CAP_EXTRAS,
  TIMEOUT_FUZZY_MS, TIMEOUT_EMB_MS, TIMEOUT_MEM_MS, TIMEOUT_ENC_MS,
  MARGIN_TOKENS, MAX_LEN_FOR_GREETING, GREET_RE
} from "./config";

export type {
  AnyRecord, ChatMessage, ParalelasResult, TrendPack, ProactivePayload,
  GetEcoParams, GetEcoResult, Memoria, Heuristica, NivelNum, SessionMetadata
} from "./types";
