import { MatrizPromptBaseV2, Camada, CondicaoEspecial, Nivel } from "./types";

/* ======================== Matriz (V2) — refinada ======================== */
const matrizPromptBaseV2: MatrizPromptBaseV2 = {
  /* ============== base ============== */
  baseModules: {
    core: [
      // Prelúdio (ordem 0): missão, restrições, amplitude e confidencialidade
      "developer_prompt.txt",

      // Identidade e demais núcleos
      "IDENTIDADE.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "LINGUAGEM_NATURAL.txt",
      "ENCERRAMENTO_SENSIVEL.txt",
      "DETECÇÃOCRISE.txt",   // com acento, conforme filesystem
      "PEDIDOPRÁTICO.txt",   // com acento, conforme filesystem
    ],
    emotional: [],
    advanced: [
      "escala_abertura_1a3.txt",
      "ESCALA_INTENSIDADE_0a10.txt",
      "metodo_viva_enxuto.txt",
      "bloco_tecnico_memoria.txt",
      "usomemorias.txt",     // normalizado (ASCII)
    ],
  },

  /* ============== NV por camada ============== */
  byNivelV2: (({
    1: {
      specific: [
        "nv1_core.txt",
        "identidade_mini.txt",
        "ANTISALDO_MIN.txt",
        "escala_abertura_1a3.txt",
      ],
      inherits: [],
    },
    2: { specific: [], inherits: ["core", "advanced"] },
    3: { specific: [], inherits: ["core", "advanced"] },
  }) as Record<Nivel, { specific: string[]; inherits: Camada[] }>),

  /* ============== compat legado (limpo) ============== */
  alwaysInclude: [
    "developer_prompt.txt",
    "PRINCIPIOS_CHAVE.txt",
    "eco_estrutura_de_resposta.txt", // ✅ agora incluído
  ],
  byNivel: { 1: ["ENCERRAMENTO_SENSIVEL.txt"], 2: [], 3: [] },

  /* ============== gates mínimos (ajustados) ============== */
  intensidadeMinima: {
    // N/A — quem decide bloco técnico é DEC.hasTechBlock
    // ❌ não gateie VIVA por intensidade
  },

  /* ============== regras semânticas (condições) ============== */
  condicoesEspeciais: ({
    // Prelúdio
    "developer_prompt.txt": {
      descricao: "Prelúdio de missão, restrições, amplitude e confidencialidade (ordem 0).",
      regra: "nivel>=1",
    },

    "escala_abertura_1a3.txt": {
      descricao: "Mapa de abertura 1–3 para calibrar tom/ritmo",
      regra: "nivel>=1",
    },
    "ESCALA_INTENSIDADE_0a10.txt": {
      descricao: "Mapa para calibrar tom/ritmo; usar quando houver emoção",
      regra: "nivel>=1",
    },

    // Estrutura contemplativa (tua versão)
    "eco_estrutura_de_resposta.txt": {
      descricao: "Arquitetura de presença filosófica (espelho, exploração, paradoxo, presença).",
      regra: "nivel>=1",
    },

    /* ===== Método VIVA — controlado pelo hub (DEC.vivaSteps) ===== */
    "metodo_viva_enxuto.txt": {
      descricao: "Aplicar VIVA conforme DEC.vivaSteps; evitar quando pedido_pratico.",
      regra: "nivel>=1 && !pedido_pratico",
    },

    "bloco_tecnico_memoria.txt": {
      descricao: "Gerar bloco técnico quando DEC.hasTechBlock=true",
      regra: "hasTechBlock==true",
    },

    "ENCERRAMENTO_SENSIVEL.txt": {
      descricao: "Fechar suave quando houver assentimento/pausa/queda de energia",
      regra: "nivel>=1",
    },

    /* ===== Segurança (crise) — requer flags ===== */
    "DETECÇÃOCRISE.txt": {
      descricao: "Protocolo de segurança: ideação/risco — só com sinais e alta intensidade",
      regra: "intensidade>=7 && (ideacao || desespero || vazio || autodesvalorizacao)",
    },

    "PEDIDOPRÁTICO.txt": {
      descricao: "Respostas diretas a pedidos factuais/práticos sem forçar reflexão emocional",
      regra: "pedido_pratico && nivel>=1",
    },

    "usomemorias.txt": {
      descricao: "Continuidade: citar suavemente memórias quando fizer sentido",
      regra: "nivel>=1",
    },

    /* ===== Emocionais ===== */
    "eco_vulnerabilidade_mitos.txt": {
      descricao: "Reenquadrar vulnerabilidade como coragem com discernimento.",
      regra:
        "nivel>=2 && intensidade>=3 && (vulnerabilidade || vergonha || autocritica) && !pedido_pratico",
    },
    "eco_vulnerabilidade_defesas.txt": {
      descricao: "Nomear armaduras emocionais e abrir microespaço seguro.",
      regra:
        "nivel>=2 && intensidade>=4 && (defesas_ativas || evitamento || combate || vulnerabilidade) && !pedido_pratico",
    },
    "eco_emo_vergonha_combate.txt": {
      descricao: "Separar identidade de comportamento quando vergonha domina.",
      regra:
        "nivel>=2 && intensidade>=4 && (vergonha || autocritica || culpa_marcada) && !pedido_pratico",
    },
    "eco_memoria_revisitar_passado.txt": {
      descricao: "Costurar memórias emocionais registradas ao agora.",
      regra: "nivel>=2 && useMemories==true && !pedido_pratico",
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

    /* ===== Filosóficos / somáticos ===== */
    "eco_observador_presente.txt": {
      descricao: "Trazer presença estoica e atenção ao agora.",
      regra: "ruminacao && nivel>=2 && intensidade>=3 && intensidade<=7",
    },
    "eco_presenca_racional.txt": {
      descricao: "Discernimento estoico frente a inquietação.",
      regra: "confusao_emocional && intensidade>=3 && intensidade<=7 && nivel>=2",
    },
    "eco_corpo_emocao.txt": {
      descricao: "Ponte corpo–emoção para sensação encarnada.",
      regra: "(mencao_corporal || excesso_racionalizacao || confusao_emocional) && intensidade>=4 && nivel>=2",
    },
    "eco_fim_do_sofrimento.txt": {
      descricao: "Sofrimento avaliativo visto com presença compassiva.",
      regra: "sofrimento_avaliativo && intensidade>=6 && nivel>=2 && !crise",
    },
    "eco_identificacao_mente.txt": {
      descricao: "Desidentificação gentil de pensamentos repetitivos.",
      regra: "identificacao_pensamentos && nivel>=2",
    },
    "eco_corpo_sensacao.txt": {
      descricao: "Consciência corporal como âncora.",
      regra:
        "(mencao_corporal || confusao_emocional || excesso_racionalizacao) && nivel>=2 && intensidade>=5",
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
      "developer_prompt.txt",

      // Segurança
      "DETECÇÃOCRISE.txt",

      // NV1
      "nv1_core.txt",
      "identidade_mini.txt",
      "ANTISALDO_MIN.txt",

      // Pedido prático
      "PEDIDOPRÁTICO.txt",

      // Mapas
      "escala_abertura_1a3.txt",
      "ESCALA_INTENSIDADE_0a10.txt",

      // Memórias
      "usomemorias.txt",
      "eco_memoria_revisitar_passado.txt",

      // Core
      "PRINCIPIOS_CHAVE.txt",
      "IDENTIDADE.txt",
      "eco_estrutura_de_resposta.txt", // ✅ entra no core agora
      "MODULACAO_TOM_REGISTRO.txt",
      "LINGUAGEM_NATURAL.txt",
      "ENCERRAMENTO_SENSIVEL.txt",

      // Emocionais
      "eco_emo_vergonha_combate.txt",
      "eco_vulnerabilidade_mitos.txt",
      "eco_vulnerabilidade_defesas.txt",

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
      "metodo_viva_enxuto.txt",
      "bloco_tecnico_memoria.txt",
    ],
  },
};

/**
 * (Opcional) Pesos de ordenação absoluta para o builder.
 * Se o seu merge final aceitar esse mapa, use:
 *   items.sort((a,b) => (ordemAbsoluta[a] ?? 999) - (ordemAbsoluta[b] ?? 999))
 */
export const ordemAbsoluta: Record<string, number> = {
  "developer_prompt.txt": 0,
  "IDENTIDADE.txt": 2,
  "PRINCIPIOS_CHAVE.txt": 3,
  "ANTISALDO_MIN.txt": 5,
  "LINGUAGEM_NATURAL.txt": 15,
};

export { matrizPromptBaseV2 };
export default matrizPromptBaseV2;
