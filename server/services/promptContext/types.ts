export type Nivel = 1 | 2 | 3;
export type Camada = "core" | "emotional" | "advanced";

export interface CondicaoEspecial {
  descricao: string;
  /** regra em DSL/expressão que seu selector interpreta */
  regra: string;
}

export interface Limites {
  prioridade?: string[];
}

export interface MatrizPromptBase {
  alwaysInclude: string[];
  byNivel: Record<number, string[]>;
  intensidadeMinima: Record<string, number>;
  condicoesEspeciais: Record<string, CondicaoEspecial>;
  limites?: Limites;
}

/** V2 estende a base com herança por camadas */
export interface MatrizPromptBaseV2 extends MatrizPromptBase {
  baseModules: Record<Camada, string[]>;
  byNivelV2: Record<Nivel, { specific: string[]; inherits: Camada[] }>;
}
