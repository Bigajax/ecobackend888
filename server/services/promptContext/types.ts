// server/services/promptContext/types.ts

/* ==================== Níveis / Camadas ==================== */
export type Nivel = 1 | 2 | 3;
export type Camada = "core" | "emotional" | "advanced";

/* ==================== VIVA ==================== */
/** Passos do VIVA — distingui V de Validação e V de Nomeação */
export type VivaStep = "V" | "I" | "V_nomeacao" | "A" | "Pausa";

/* ==================== Flags semânticas ==================== */
/** Expanda à vontade; mantenha nomes em snake_case para as regras */
export type FlagSemantica =
  // pedidos / roteamento leve
  | "pedido_pratico"
  | "saudacao"
  | "factual"
  | "cansaco"
  | "desabafo"
  | "urgencia"
  | "emocao_alta_linguagem"
  // crise (granulares)
  | "ideacao"
  | "desespero"
  | "vazio"
  | "autodesvalorizacao"
  // vulnerabilidade / padrões
  | "vulnerabilidade"
  | "vergonha"
  | "defesas_ativas"
  | "combate"
  | "evitamento"
  | "autocritica"
  | "culpa_marcada"
  | "catastrofizacao"
  // cognitivo / ruído mental
  | "ruminacao"
  | "confusao_emocional"
  | "mencao_corporal"
  | "excesso_racionalizacao"
  | "sofrimento_avaliativo"
  | "identificacao_pensamentos"
  // heurísticas cognitivas específicas
  | "ancoragem"
  | "causas_superam_estatisticas"
  | "certeza_emocional"
  | "excesso_intuicao_especialista"
  | "ignora_regressao_media";

/* ==================== Contexto para avaliação de regras ==================== */
/**
 * Variáveis disponíveis para a DSL de regras, ex.:
 *  "intensidade>=7 && hasTechBlock==true"
 *  "ancoragem && nivel>=2 && !pedido_pratico"
 */
export interface RegraContext {
  /** Intensidade atual (0..10) decidida para a mensagem */
  intensidade: number;
  /** Nível de abertura (1..3) para a mensagem */
  nivel: Nivel;
  /** Decisão do hub: existe bloco técnico para esta mensagem? */
  hasTechBlock?: boolean;
  /** Passos VIVA definidos pelo hub (opcional no selector) */
  vivaSteps?: VivaStep[];
  /** Mapa de flags semânticas (heurísticas, vulnerabilidade, crise, etc.) */
  flags: Partial<Record<FlagSemantica, boolean>>;
}

/* ==================== Matriz / Condições / Limites ==================== */
export interface CondicaoEspecial {
  descricao: string;
  /** Expressão em DSL simples usando: intensidade, nivel, hasTechBlock e flags */
  regra: string;
}

export interface Limites {
  /** Ordem de prioridade de composição (primeiros = maior prioridade) */
  prioridade?: string[];
}

/** Matriz base (legado) */
export interface MatrizPromptBase {
  /** Módulos sempre incluídos (compatibilidade) */
  alwaysInclude: string[];
  /** Inclusões por nível (compatibilidade) */
  byNivel: Record<number, string[]>;
  /** Gates mínimos por arquivo (ex.: intensidade mínima) */
  intensidadeMinima: Record<string, number>;
  /** Regras semânticas condicionais por arquivo */
  condicoesEspeciais: Record<string, CondicaoEspecial>;
  /** Limites e prioridades de composição */
  limites?: Limites;
}

/** V2 — estende a base com herança por camadas e organização moderna */
export interface MatrizPromptBaseV2 extends MatrizPromptBase {
  /** Conjunto base por camada (core, emotional, advanced) */
  baseModules: Record<Camada, string[]>;
  /** Definições específicas por nível + herança de camadas */
  byNivelV2: Record<Nivel, { specific: string[]; inherits: Camada[] }>;
}
