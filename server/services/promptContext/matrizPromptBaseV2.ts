import { MatrizPromptBaseV2, Camada, CondicaoEspecial, Nivel } from "./types";

/* ======================== Matriz (V2) — refinada ======================== */
const matrizPromptBaseV2: MatrizPromptBaseV2 = {
  /* ============== base ============== */
  baseModules: {
    core: [
      // Prelúdio (ordem 0): missão, restrições, amplitude e confidencialidade
      "DEVELOPER_PROMPT.txt",

      // Identidade e demais núcleos
      "IDENTIDADE.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "LINGUAGEM_NATURAL.txt",
      "ENCERRAMENTO_SENSIVEL.txt",
      "DETECCAOCRISE.txt",   // sem acento no nome do arquivo
      "PEDIDOPRATICO.txt",  // sem acento no nome do arquivo
    ],
    emotional: [],
    advanced: [
      "ESCALA_ABERTURA_1a3.txt",
      "ESCALA_INTENSIDADE_0a10.txt",
      "METODO_VIVA_ENXUTO.txt",
      "BLOCO_TECNICO_MEMORIA.txt",
      "USOMEMORIAS.txt",    // padronizado sem acento
    ],
  },

  /* ============== NV por camada ============== */
  byNivelV2: ({
    1: {
      specific: [
        "NV1_CORE.txt",
        "IDENTIDADE_MINI.txt",
        "ANTISALDO_MIN.txt",
        "ESCALA_ABERTURA_1a3.txt",
      ],
      inherits: [],
    },
    2: { specific: [], inherits: ["core", "advanced"] },
    3: { specific: [], inherits: ["core", "advanced"] },
  } as Record<Nivel, { specific: string[]; inherits: Camada[] }>),

  /* ============== compat legado (limpo) ============== */
  // Mantemos a ordem aqui para garantir precedência no merge final.
  alwaysInclude: [
    "DEVELOPER_PROMPT.txt",
    "PRINCIPIOS_CHAVE.txt",
    "ECO_ESTRUTURA_DE_RESPOSTA.txt",
  ],
  byNivel: { 1: ["ENCERRAMENTO_SENSIVEL.txt"], 2: [], 3: [] },

  /* ============== gates mínimos (ajustados) ============== */
  intensidadeMinima: {
    "BLOCO_TECNICO_MEMORIA.txt": 7,
    // ❌ não gateie VIVA por intensidade
  },

  /* ============== regras semânticas (condições) ============== */
  condicoesEspeciais: ({
    // Prelúdio: sempre incluir; sem gates de intensidade/nível.
    "DEVELOPER_PROMPT.txt": {
      descricao: "Prelúdio de missão, restrições, amplitude e confidencialidade (ordem 0).",
      regra: "nivel>=1",
    },

    "ESCALA_ABERTURA_1a3.txt": {
      descricao: "Mapa de abertura 1–3 para calibrar tom/ritmo",
      regra: "nivel>=1",
    },
    "ESCALA_INTENSIDADE_0a10.txt": {
      descricao: "Mapa para calibrar tom/ritmo; usar quando houver emoção",
      regra: "nivel>=1",
    },

    /* ===== Método VIVA — controlado pelo hub (subset por vivaSteps) ===== */
    "METODO_VIVA_ENXUTO.txt": {
      descricao: "Aplicar VIVA conforme DEC.vivaSteps; evitar quando pedido_pratico.",
      regra: "nivel>=1 && !pedido_pratico",
    },

    "BLOCO_TECNICO_MEMORIA.txt": {
      descricao: "Gerar bloco técnico quando DEC.hasTechBlock=true",
      regra: "intensidade>=7 && hasTechBlock==true",
    },

    "ENCERRAMENTO_SENSIVEL.txt": {
      descricao: "Fechar suave quando houver assentimento/pausa/queda de energia",
      regra: "nivel>=1",
    },

    /* ===== Segurança (crise) — requer flags ===== */
    "DETECCAOCRISE.txt": {
      descricao: "Protocolo de segurança: ideação/risco — só com sinais e alta intensidade",
      regra: "intensidade>=8 && nivel>=3 && (ideacao || desespero || vazio || autodesvalorizacao)",
    },

    "PEDIDOPRATICO.txt": {
      descricao: "Respostas diretas a pedidos factuais/práticos sem forçar reflexão emocional",
      regra: "pedido_pratico && nivel>=1",
    },

    "USOMEMORIAS.txt": {
      descricao: "Continuidade: citar suavemente memórias quando fizer sentido",
      regra: "nivel>=1",
    },

    /* ===== Heurísticas cognitivas ===== */
    "eco_heuristica_disponibilidade.txt": {
      descricao: "Disponibilidade",
      regra: "((intensidade>=2 && intensidade<=6) || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_excesso_confianca.txt": {
      descricao: "Excesso de confiança",
      regra: "((intensidade>=2 && intensidade<=6) || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_ilusao_validade.txt": {
      descricao: "Ilusão de validade",
      regra: "((intensidade>=2 && intensidade<=6) || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },
    "heuristica_ilusao_compreensao.txt": {
      descricao: "Ilusão de compreensão",
      regra: "((intensidade>=2 && intensidade<=6) || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },

    "eco_heuristica_ancoragem.txt": {
      descricao: "Efeito de ancoragem",
      regra: "ancoragem && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_causas_superam_estatisticas.txt": {
      descricao: "Narrativa causal vs estatística",
      regra: "causas_superam_estatisticas && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_certeza_emocional.txt": {
      descricao: "Convicção afetiva ≠ evidência",
      regra: "certeza_emocional && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_intuicao_especialista.txt": {
      descricao: "Intuição de especialista",
      regra: "excesso_intuicao_especialista && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_regressao_media.txt": {
      descricao: "Regressão à média",
      regra: "ignora_regressao_media && nivel>=2 && !pedido_pratico",
    },

    /* ===== Emocionais / vulnerabilidade ===== */
    "eco_emo_vergonha_combate.txt": {
      descricao: "Vergonha com defesa/combate",
      regra: "vergonha && (defesas_ativas || combate) && intensidade>=5 && nivel>=2",
    },
    "eco_vulnerabilidade_defesas.txt": {
      descricao: "Defesas diante da vulnerabilidade",
      regra: "vulnerabilidade && defesas_ativas && nivel>=2",
    },
    "eco_vulnerabilidade_mitos.txt": {
      descricao: "Mitos da vulnerabilidade",
      regra: "vulnerabilidade && nivel>=2",
    },

    /* ===== Filosóficos / somáticos ===== */
    "eco_observador_presente.txt": {
      descricao: "Observador presente",
      regra: "ruminacao && nivel>=2",
    },
    "eco_presenca_racional.txt": {
      descricao: "Razão serena",
      regra: "confusao_emocional && intensidade>=3 && intensidade<=7 && nivel>=2",
    },
    "eco_corpo_emocao.txt": {
      descricao: "Ponte corpo–emoção",
      regra: "(mencao_corporal || excesso_racionalizacao) && intensidade>=5 && nivel>=2",
    },
    "eco_fim_do_sofrimento.txt": {
      descricao: "Reduzir sofrimento por aversão/avaliação",
      regra: "sofrimento_avaliativo && intensidade>=6 && nivel>=2",
    },
    "eco_identificacao_mente.txt": {
      descricao: "Desidentificação de pensamentos",
      regra: "identificacao_pensamentos && nivel>=2",
    },
    "eco_corpo_sensacao.txt": {
      descricao: "Consciência corporal",
      regra: "(mencao_corporal || confusao_emocional || excesso_racionalizacao) && nivel>=2 && intensidade>=5",
    },

    "LINGUAGEM_NATURAL.txt": {
      descricao: "Guia de linguagem natural da Eco",
      regra: "nivel>=1",
    },
  } as Record<string, CondicaoEspecial>),

  /* ============== prioridade (budget) ============== */
  limites: {
    prioridade: [
      // Precedência absoluta
      "DEVELOPER_PROMPT.txt",

      // Segurança
      "DETECCAOCRISE.txt",

      // NV1
      "NV1_CORE.txt",
      "IDENTIDADE_MINI.txt",
      "ANTISALDO_MIN.txt",

      // Pedido prático
      "PEDIDOPRATICO.txt",

      // Mapas
      "ESCALA_ABERTURA_1a3.txt",
      "ESCALA_INTENSIDADE_0a10.txt",

      // Memórias
      "USOMEMORIAS.txt",

      // Core
      "PRINCIPIOS_CHAVE.txt",
      "IDENTIDADE.txt",
      "ECO_ESTRUTURA_DE_RESPOSTA.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "LINGUAGEM_NATURAL.txt",
      "ENCERRAMENTO_SENSIVEL.txt",

      // Filosóficos / Somáticos
      "eco_observador_presente.txt",
      "eco_presenca_racional.txt",
      "eco_corpo_emocao.txt",
      "eco_fim_do_sofrimento.txt",
      "eco_identificacao_mente.txt",
      "eco_corpo_sensacao.txt",

      // Heurísticas
      "eco_heuristica_ancoragem.txt",
      "eco_heuristica_causas_superam_estatisticas.txt",
      "eco_heuristica_certeza_emocional.txt",
      "eco_heuristica_disponibilidade.txt",
      "eco_heuristica_excesso_confianca.txt",
      "eco_heuristica_ilusao_validade.txt",
      "eco_heuristica_intuicao_especialista.txt",
      "eco_heuristica_regressao_media.txt",
      "heuristica_ilusao_compreensao.txt",

      // Intervenções / Técnico
      "METODO_VIVA_ENXUTO.txt",
      "BLOCO_TECNICO_MEMORIA.txt",
    ],
  },
};

/**
 * (Opcional) Pesos de ordenação absoluta para o builder.
 * Se o seu merge final aceitar esse mapa, use:
 *   items.sort((a,b) => (ordemAbsoluta[a] ?? 999) - (ordemAbsoluta[b] ?? 999))
 */
export const ordemAbsoluta: Record<string, number> = {
  "DEVELOPER_PROMPT.txt": 0,
  "IDENTIDADE.txt": 2,
  "PRINCIPIOS_CHAVE.txt": 3,
  "ANTISALDO_MIN.txt": 5,
  "LINGUAGEM_NATURAL.txt": 15,
};

export { matrizPromptBaseV2 };
export default matrizPromptBaseV2;
