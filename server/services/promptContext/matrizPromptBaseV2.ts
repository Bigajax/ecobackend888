// services/promptContext/matrizPromptBaseV2.ts
import {
  MatrizPromptBaseV2,
  Camada,
  CondicaoEspecial,
  Nivel,
} from "./types";

/* ======================== Matriz (V2) — atualizada ======================== */
const matrizPromptBaseV2: MatrizPromptBaseV2 = {
  /* ============== base ============== */
  baseModules: {
    core: [
      "IDENTIDADE.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "LINGUAGEM_NATURAL.txt", // guia de linguagem natural
      "ENCERRAMENTO_SENSIVEL.txt",

      // >>> NOVOS CORE
      "DETECÇÃOCRISE.txt",   // segurança crítica — sempre disponível
      "PEDIDOPRÁTICO.txt",   // pedidos factuais — ativa por flag
    ],
    emotional: [],
    advanced: [
      "ESCALA_ABERTURA_1a3.txt",
      "ESCALA_INTENSIDADE_0a10.txt",
      "METODO_VIVA_ENXUTO.txt",
      "BLOCO_TECNICO_MEMORIA.txt",

      // >>> NOVO ADVANCED
      "USOMEMÓRIAS.txt",     // continuidade entre sessões
    ],
  },

  /* ============== NV por camada ============== */
  byNivelV2: {
    1: {
      specific: [
        "NV1_CORE.txt",
        "IDENTIDADE_MINI.txt",
        "ANTISALDO_MIN.txt",
        "ESCALA_ABERTURA_1a3.txt",
      ],
      inherits: [] as Camada[],
    },
    2: { specific: [], inherits: ["core", "advanced"] as Camada[] },
    3: { specific: [], inherits: ["core", "advanced"] as Camada[] },
  },

  /* ============== compat legado ============== */
  alwaysInclude: [
    "PRINCIPIOS_CHAVE.txt",
    "IDENTIDADE.txt",
    "ECO_ESTRUTURA_DE_RESPOSTA.txt",
    "MODULACAO_TOM_REGISTRO.txt",
    "LINGUAGEM_NATURAL.txt",
    "MEMORIAS_CONTEXTO.txt",
    "ENCERRAMENTO_SENSIVEL.txt",
  ],
  byNivel: { 1: ["ENCERRAMENTO_SENSIVEL.txt"], 2: [], 3: [] },

  /* ============== gates mínimos ============== */
  intensidadeMinima: {
    "BLOCO_TECNICO_MEMORIA.txt": 7,
    "METODO_VIVA_ENXUTO.txt": 7,
  },

  /* ============== regras semânticas (condições) ============== */
  condicoesEspeciais: {
    /* ===== Mapas ===== */
    "ESCALA_ABERTURA_1a3.txt": {
      descricao: "Mapa de abertura 1–3 para calibrar tom/ritmo",
      regra: "nivel>=1",
    },
    "ESCALA_INTENSIDADE_0a10.txt": {
      descricao:
        "Mapa para calibrar tom/ritmo; usar quando houver emoção em cena",
      regra: "nivel>=1",
    },

    /* ===== Método VIVA (não coexistir com pedido prático/factual) ===== */
    "METODO_VIVA_ENXUTO.txt": {
      descricao:
        "Ativar quando emoção clara (≥7) e abertura ≥2; máx. 3 movimentos; evitar em saudação/factual/pedido prático/cansaço/desabafo.",
      regra:
        "intensidade>=7 && nivel>=2 && !pedido_pratico && !saudacao && !factual && !cansaco && !desabafo",
    },

    "BLOCO_TECNICO_MEMORIA.txt": {
      descricao: "Gerar bloco técnico ao final quando emoção ≥7",
      regra: "intensidade>=7",
    },
    "ENCERRAMENTO_SENSIVEL.txt": {
      descricao:
        "Fechar suave quando houver assentimento/pausa ou queda de energia",
      regra: "nivel>=1",
    },

    /* ====== NOVOS MÓDULOS ====== */
    "DETECÇÃOCRISE.txt": {
      descricao:
        "Protocolo de segurança: ideação suicida, psicose, violência, pânico severo",
      regra: "nivel>=1", // sempre disponível
    },

    "PEDIDOPRÁTICO.txt": {
      descricao:
        "Respostas diretas a pedidos factuais/práticos sem forçar reflexão emocional",
      regra: "pedido_pratico && nivel>=1", // ativa apenas se flag pedido_pratico=true
    },

    "USOMEMÓRIAS.txt": {
      descricao:
        "Guia de uso de memórias: citar explicitamente (≥7) ou usar como referência interna (<7)",
      // opção 1 (mais conservadora): não usar em NV1 superficial
      // regra: "(nivel>=2) || (nivel==1 && abertura>=2)",
      // opção 2 (sempre disponível, respeitando nuances internas):
      regra: "nivel>=1 && abertura>=1",
    },

    /* ====== Heurísticas cognitivas ====== */
    "eco_heuristica_disponibilidade.txt": {
      descricao: "Disponibilidade",
      regra:
        "((intensidade>=2 && intensidade<=6) || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_excesso_confianca.txt": {
      descricao: "Excesso de confiança",
      regra:
        "((intensidade>=2 && intensidade<=6) || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_ilusao_validade.txt": {
      descricao: "Ilusão de validade",
      regra:
        "((intensidade>=2 && intensidade<=6) || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },
    "heuristica_ilusao_compreensao.txt": {
      descricao: "Ilusão de compreensão",
      regra:
        "((intensidade>=2 && intensidade<=6) || intensidade>=8) && nivel>=2 && !pedido_pratico",
    },

    // novos cognitivos
    "eco_heuristica_ancoragem.txt": {
      descricao: "Efeito de ancoragem (primeiras referências dominam)",
      regra: "ancoragem && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_causas_superam_estatisticas.txt": {
      descricao:
        "Narrativas causais sedutoras superando evidências estatísticas",
      regra: "causas_superam_estatisticas && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_certeza_emocional.txt": {
      descricao:
        "Certeza emocional/convicção afetiva confundida com evidência",
      regra: "certeza_emocional && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_intuicao_especialista.txt": {
      descricao: "Excesso de confiança na própria ‘intuição de especialista’",
      regra: "excesso_intuicao_especialista && nivel>=2 && !pedido_pratico",
    },
    "eco_heuristica_regressao_media.txt": {
      descricao: "Ignorar regressão à média (resultados extremos tendem a cair)",
      regra: "ignora_regressao_media && nivel>=2 && !pedido_pratico",
    },

    /* ====== Emocionais / vulnerabilidade & vergonha ====== */
    "eco_emo_vergonha_combate.txt": {
      descricao: "Quando vergonha ativa mecanismos de combate/defesa",
      regra: "vergonha && (defesas_ativas || combate) && intensidade>=5 && nivel>=2",
    },
    "eco_vulnerabilidade_defesas.txt": {
      descricao: "Defesas comuns contra vulnerabilidade (racionalizar, evitar…)",
      regra: "vulnerabilidade && defesas_ativas && nivel>=2",
    },
    "eco_vulnerabilidade_mitos.txt": {
      descricao: "Mitos sobre vulnerabilidade (fraqueza, exposição total…)",
      regra: "vulnerabilidade && nivel>=2",
    },

    /* ====== Filosóficos / estoicos e somáticos ====== */
    "eco_observador_presente.txt": {
      descricao:
        "Postura do observador presente; separar estímulo de reação; reduzir ruminação",
      regra: "ruminacao && nivel>=2",
    },
    "eco_presenca_racional.txt": {
      descricao:
        "Trazer razão serena quando há confusão emocional moderada",
      regra: "confusao_emocional && intensidade>=3 && intensidade<=7 && nivel>=2",
    },
    "eco_corpo_emocao.txt": {
      descricao:
        "Ponte corpo–emoção: percepção somática para destravar identificação mental",
      regra:
        "(mencao_corporal || excesso_racionalizacao) && intensidade>=5 && nivel>=2",
    },
    "eco_fim_do_sofrimento.txt": {
      descricao:
        "Redução do sofrimento por avaliação/aversão; aceitar o que é (estoico)",
      regra: "sofrimento_avaliativo && intensidade>=6 && nivel>=2",
    },
    "eco_identificacao_mente.txt": {
      descricao:
        "Desidentificação de pensamentos (‘não sou meus pensamentos’)",
      regra: "identificacao_pensamentos && nivel>=2",
    },

    // (opcional) se você criou este arquivo
    "eco_corpo_sensacao.txt": {
      descricao: "Consciência corporal e escuta somática",
      regra:
        "(mencao_corporal || confusao_emocional || excesso_racionalizacao) && nivel>=2 && intensidade>=5",
    },

    // guia de linguagem natural — sempre que houver conversa real
    "LINGUAGEM_NATURAL.txt": {
      descricao:
        "Guia de linguagem natural da Eco: substituições sem clichê, aberturas contextuais/descritas e validações diretas.",
      regra: "nivel>=1",
    },
  } as Record<string, CondicaoEspecial>,

  /* ============== prioridade (budget) ============== */
  limites: {
    prioridade: [
      // ===== SEGURANÇA & CORE =====
      "DETECÇÃOCRISE.txt",         // MÁXIMA PRIORIDADE

      // NV1
      "NV1_CORE.txt",
      "IDENTIDADE_MINI.txt",
      "ANTISALDO_MIN.txt",

      // Pedidos factuais em alta logo após NV1 core
      "PEDIDOPRÁTICO.txt",         // ALTA PRIORIDADE

      // Mapas
      "ESCALA_ABERTURA_1a3.txt",
      "ESCALA_INTENSIDADE_0a10.txt",

      // Continuidade/uso de memórias
      "USOMEMÓRIAS.txt",           // PRIORIDADE MÉDIA

      // Core / legado
      "PRINCIPIOS_CHAVE.txt",
      "IDENTIDADE.txt",
      "ECO_ESTRUTURA_DE_RESPOSTA.txt",
      "MODULACAO_TOM_REGISTRO.txt",
      "LINGUAGEM_NATURAL.txt",
      "MEMORIAS_CONTEXTO.txt",
      "ENCERRAMENTO_SENSIVEL.txt",

      // ===== Filosóficos / somáticos =====
      "eco_observador_presente.txt",
      "eco_presenca_racional.txt",
      "eco_corpo_emocao.txt",
      "eco_fim_do_sofrimento.txt",
      "eco_identificacao_mente.txt",
      // se existir
      "eco_corpo_sensacao.txt",

      // ===== Cognitivos (heurísticas) =====
      "eco_heuristica_ancoragem.txt",
      "eco_heuristica_causas_superam_estatisticas.txt",
      "eco_heuristica_certeza_emocional.txt",
      "eco_heuristica_disponibilidade.txt",
      "eco_heuristica_excesso_confianca.txt",
      "eco_heuristica_ilusao_validade.txt",
      "eco_heuristica_intuicao_especialista.txt",
      "eco_heuristica_regressao_media.txt",
      "heuristica_ilusao_compreensao.txt",

      // Intervenções / técnico
      "METODO_VIVA_ENXUTO.txt",
      "BLOCO_TECNICO_MEMORIA.txt",
    ],
  },
};

export { matrizPromptBaseV2 };
export default matrizPromptBaseV2;

/* ======================== Helper opcional (backend) ======================== */
/** Heurística simples para marcar pedido_pratico */
export function detectarPedidoPratico(mensagem: string): boolean {
  const padroesPraticos: RegExp[] = [
    /^(o que é|o que sao|o que significa)\b/i,
    /^(como funciona|como usar|como faço|como fazer|como praticar|como começar)\b/i,
    /^me (explica|ajuda|mostra)\b/i,
    /^qual (a |o )?diferença\b/i,
    /(me recomenda|indica|sugere).*(livro|app|aplicativo|recurso|vídeo|video|curso)/i,
    /\b(passos|passo a passo|checklist)\b/i,
  ];
  return padroesPraticos.some((re) => re.test(mensagem.trim()));
}
