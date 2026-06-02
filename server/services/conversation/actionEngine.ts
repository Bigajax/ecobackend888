// services/conversation/actionEngine.ts
//
// "Action Engine": depois da resposta, decide UMA próxima ação concreta para a pessoa
// (meditar / dormir / escrever / refletir / ver evolução), como "próximo passo natural".
//
// Regras determinísticas e CONSERVADORAS: só dispara quando há sinal claro (palavra-chave no
// texto OU flag emocional já calculada em ecoDecision). Sem gatilho → null (nenhum card).
//
// SEGURANÇA: em crise (ou sinais granulares de crise — ideação, desespero, vazio,
// autodesvalorização) NUNCA sugere ação de upsell → retorna null.
//
// DECISÃO: monta a lista de candidatos por prioridade e escolhe o melhor que não esteja em
// cooldown (anti-repetição). Apenas uma ação por turno.
//
// ANTI-REPETIÇÃO: quando `usuarioId` é informado (usuário autenticado), a mesma ação não é
// sugerida de novo dentro da janela de cooldown. Sem `usuarioId`, não há cooldown.
//
// O frontend mapeia `tipo` → rota/ícone; este módulo só decide a ação semântica + copy.

/** Ids legados (compat de payload). */
export type TipoAcao = "meditacao" | "sono" | "diario" | "estoicismo" | "relatorio";

/** Catálogo completo de ações recomendáveis (v2). */
export type AcaoId = TipoAcao | "aneis" | "riqueza_mental" | "energy_blessings" | "liberar_estresse";

/** Como o frontend navega: programa abre rota; meditação abre o player. */
export type AcaoKind = "programa" | "meditacao";

export interface AcaoRecomendada {
  /** Contrato compartilhado com o frontend (chave do CATALOG). */
  id: AcaoId;
  kind: AcaoKind;
  titulo: string;
  descricao: string;
  cta: string;
  /** Maior = mais prioritário. */
  prioridade: number;
  /** Alias legado: presente apenas para os 5 ids antigos (id === tipo). */
  tipo?: TipoAcao;
}

export interface DecideAcaoInput {
  /** Mensagem do usuário no turno atual. */
  texto: string;
  /** Intensidade emocional 0–10 (ecoDecision.intensity). */
  intensidade: number;
  /** Nível de abertura 1–3. */
  openness?: 1 | 2 | 3;
  /** Flags já derivadas (ecoDecision.flags): crise, autocritica, culpa_marcada, vergonha, etc. */
  flags?: Record<string, unknown> | null;
  /** Tema recorrente (ex.: do perfil/derivados). Habilita a ação "relatorio". */
  temaRecorrente?: { tema: string; freq: number } | null;
  /**
   * Id do usuário autenticado. Habilita o cooldown anti-repetição por ação.
   * Ausente/null → sem cooldown (comportamento puro, usado em testes e guests).
   */
  usuarioId?: string | null;
  /** Override do "agora" (epoch ms) para testes determinísticos do cooldown. */
  agoraMs?: number;
}

function normalize(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function flag(flags: Record<string, unknown> | null | undefined, key: string): boolean {
  return Boolean(flags && (flags as Record<string, unknown>)[key]);
}

// Limiar de frequência para sugerir "ver evolução" a partir de um tema recorrente.
const RECORRENCIA_LIMIAR = Number(process.env.ECO_ACAO_RECORRENCIA_LIMIAR ?? 5);

// Janela de anti-repetição: a mesma ação não volta a ser sugerida ao mesmo usuário antes disso.
const COOLDOWN_MS = Number(process.env.ECO_ACAO_COOLDOWN_MS ?? 1000 * 60 * 60 * 2); // 2h

// Flags que, se presentes, suprimem qualquer sugestão de ação (segurança).
const FLAGS_BLOQUEIO_CRISE = [
  "crise",
  "ideacao",
  "desespero",
  "vazio",
  "autodesvalorizacao",
] as const;

type CatalogTemplate = Pick<AcaoRecomendada, "id" | "kind" | "titulo" | "descricao" | "cta">;

const CATALOG: Record<AcaoId, CatalogTemplate> = {
  meditacao: {
    id: "meditacao", kind: "programa",
    titulo: "Uma pausa para desacelerar",
    descricao:
      "Tem bastante coisa ativada aí agora. Às vezes o corpo precisa desacelerar antes da cabeça entender — 5 minutos de respiração ajudam.",
    cta: "Respirar por 5 minutos",
  },
  sono: {
    id: "sono", kind: "programa",
    titulo: "Preparar para a noite",
    descricao:
      "O que você descreve soa mais como mente que não desliga do que cansaço. Tenho uma prática pra ajudar o corpo a entrar no modo noite.",
    cta: "Abrir práticas de sono",
  },
  estoicismo: {
    id: "estoicismo", kind: "programa",
    titulo: "Uma reflexão sobre a autocobrança",
    descricao:
      "Tem uma distância aí entre o que você exige de si e o que de fato cabe a você. Os estoicos escreveram bastante sobre isso.",
    cta: "Ler uma reflexão",
  },
  diario: {
    id: "diario", kind: "programa",
    titulo: "Colocar no papel",
    descricao:
      "Quando a cabeça embola assim, escrever costuma clarear mais do que continuar remoendo. Topa um exercício rápido?",
    cta: "Abrir o diário",
  },
  relatorio: {
    id: "relatorio", kind: "programa",
    titulo: "Ver seus padrões",
    descricao:
      "Esse tema tem aparecido com frequência nas suas conversas. Talvez valha acompanhar como ele evolui ao longo do tempo.",
    cta: "Ver meu relatório",
  },
  aneis: {
    id: "aneis", kind: "programa",
    titulo: "Construir constância",
    descricao:
      "Quando a vontade vai e volta assim, o que costuma faltar não é força — é um sistema que segure você nos dias difíceis.",
    cta: "Conhecer os Cinco Anéis",
  },
  riqueza_mental: {
    id: "riqueza_mental", kind: "programa",
    titulo: "Reprogramar a mente financeira",
    descricao:
      "A relação com dinheiro costuma começar antes do bolso, na cabeça. Tem um programa que trabalha justamente essa raiz.",
    cta: "Abrir Riqueza Mental",
  },
  energy_blessings: {
    id: "energy_blessings", kind: "programa",
    titulo: "Reativar sua energia",
    descricao:
      "Esse esvaziamento que você descreve pede menos esforço e mais recarga. Uma prática curta de energia pode ajudar a religar.",
    cta: "Ativar seus centros de energia",
  },
  liberar_estresse: {
    id: "liberar_estresse", kind: "meditacao",
    titulo: "Soltar a tensão do dia",
    descricao:
      "Parece tensão que foi se acumulando ao longo do dia. Cinco minutos pra descarregar o corpo costumam aliviar mais do que parece.",
    cta: "Liberar o estresse (5 min)",
  },
};

const LEGACY_TIPOS = new Set<AcaoId>(["meditacao", "sono", "diario", "estoicismo", "relatorio"]);

function build(id: AcaoId, prioridade: number, descricaoOverride?: string): AcaoRecomendada {
  const base = CATALOG[id];
  return {
    ...base,
    descricao: descricaoOverride ?? base.descricao,
    prioridade,
    ...(LEGACY_TIPOS.has(id) ? { tipo: id as TipoAcao } : {}),
  };
}

// Matching por PREFIXO a partir de fronteira de palavra (\b no início, sem \b no fim) para
// lidar com flexões (ansios → ansioso/ansiosa, confus → confuso/confusão).
const RE_SONO =
  /\b(?:insonia|inson|nao consigo dormir|nao durmo|durmo mal|sono ruim|sem dormir|mal dormid|acordad|acordo de madrugada|acordo varias vezes|rolando na cama|pregar o olho|madrugada|de noite|a noite|sono|dormir)/;
const RE_ATIVACAO =
  /\b(?:ansios|ansiedade|angusti|panico|acelerad|coracao disparad|peito apertad|nao paro de pensar|nao consigo relaxar|agitad|surtand|nervos|aflit|ofegante)/;
const RE_AUTOCOBRANCA =
  /\b(?:me cobro|me cobrar|cobranca|me culpo|exigente comigo|perfeccionis|deveria ter|nunca e suficiente|nao sou bom o suficiente|nao sou boa o suficiente|tenho que dar conta|nao posso falhar)/;
const RE_CONFUSAO =
  /\b(?:confus|nao sei o que|sem direcao|sem rumo|perdid|indecis|em duvida|nao sei se|cabeca a mil|pensamento embolad)/;
const RE_ESTRESSE =
  /\b(?:estress|tensao|tenso|sobrecarregad|no limite|dia pesado|dia dificil|preciso relaxar|preciso descarregar|exausto do trabalho|fim de expediente|nao aguento mais o dia)/;
const RE_DISCIPLINA =
  /\b(?:procrastin|deixo pra depois|deixo para depois|adio|adiar|enrol|sempre desisto|desisto sempre|nunca termino|nao consigo manter|falta de disciplina|sem disciplina|sem constancia|nao tenho constancia|nao crio habito|preguica de|comeco e paro)/;
const RE_DINHEIRO =
  /\b(?:dinheiro|grana|dividas|divida|financ|sem dinheiro|falta de dinheiro|escassez|contas para pagar|contas pra pagar|boletos|boleto|salario|prosperidade|ganhar mais|mente financeira|mindset financeiro|pobre)/;
const RE_ENERGIA =
  /\b(?:sem energia|sem animo|desanimad|desmotivad|exaust|esgotad|apatic|sem vontade|sem forcas|abatid|prostrad|drenad)/;

// ── Anti-repetição (cooldown por usuário+ação) ───────────────────────────────
// Estado em memória, best-effort (zera em restart). Mapa: usuarioId → (tipo → epochMs).
const ultimaAcaoPorUsuario = new Map<string, Map<AcaoId, number>>();

function emCooldown(usuarioId: string, tipo: AcaoId, agora: number): boolean {
  const ts = ultimaAcaoPorUsuario.get(usuarioId)?.get(tipo);
  return typeof ts === "number" && agora - ts < COOLDOWN_MS;
}

function registrarAcao(usuarioId: string, tipo: AcaoId, agora: number): void {
  let porTipo = ultimaAcaoPorUsuario.get(usuarioId);
  if (!porTipo) {
    porTipo = new Map<AcaoId, number>();
    ultimaAcaoPorUsuario.set(usuarioId, porTipo);
  }
  porTipo.set(tipo, agora);
}

/** Limpa o estado de cooldown (uso em testes). */
export function __resetCooldownStore(): void {
  ultimaAcaoPorUsuario.clear();
}

/**
 * Decide a próxima ação recomendada. Retorna `null` quando não há gatilho claro (conservador),
 * em crise (segurança) ou quando todos os candidatos estão em cooldown. Apenas uma ação por turno.
 */
export function decideAcaoRecomendada(input: DecideAcaoInput): AcaoRecomendada | null {
  const flags = input.flags ?? null;

  // SEGURANÇA: em crise (ou sinais granulares) nunca sugerimos ação de upsell.
  if (FLAGS_BLOQUEIO_CRISE.some((k) => flag(flags, k))) {
    return null;
  }

  const t = normalize(input.texto);

  // Candidatos em ordem de prioridade (maior primeiro). Cada match adiciona um candidato.
  const candidatos: AcaoRecomendada[] = [];

  // 1) SONO — sinal topical de sono/insônia/noite (independe de intensidade).
  if (RE_SONO.test(t)) {
    candidatos.push(build("sono", 100));
  }

  // 2) MEDITAÇÃO — ativação/ansiedade (palavra-chave OU linguagem de emoção alta).
  if (RE_ATIVACAO.test(t) || flag(flags, "emocao_alta_linguagem")) {
    candidatos.push(build("meditacao", 90));
  }

  // 2.5) ESTRESSE — tensão acumulada do dia (distinto de ansiedade aguda).
  if (RE_ESTRESSE.test(t)) {
    candidatos.push(build("liberar_estresse", 85));
  }

  // 3) ESTOICISMO — autocrítica/culpa/vergonha/catastrofização/autocobrança.
  if (
    flag(flags, "autocritica") ||
    flag(flags, "culpa_marcada") ||
    flag(flags, "vergonha") ||
    flag(flags, "catastrofizacao") ||
    RE_AUTOCOBRANCA.test(t)
  ) {
    candidatos.push(build("estoicismo", 80));
  }

  // 4) DIÁRIO — confusão/dúvida emocional ou desabafo solto.
  if (RE_CONFUSAO.test(t) || flag(flags, "desabafo")) {
    candidatos.push(build("diario", 70));
  }

  // 6) ANÉIS — falta de constância/disciplina.
  if (RE_DISCIPLINA.test(t)) {
    candidatos.push(build("aneis", 68));
  }

  // 7) RIQUEZA MENTAL — dinheiro/escassez/mindset financeiro.
  if (RE_DINHEIRO.test(t)) {
    candidatos.push(build("riqueza_mental", 62));
  }

  // 8) ENERGY BLESSINGS — desânimo/energia baixa.
  if (RE_ENERGIA.test(t)) {
    candidatos.push(build("energy_blessings", 58));
  }

  // 5) RELATÓRIO — padrão recorrente ao longo do tempo (tema frequente).
  if (
    input.temaRecorrente &&
    typeof input.temaRecorrente.freq === "number" &&
    input.temaRecorrente.freq >= RECORRENCIA_LIMIAR
  ) {
    const tema = input.temaRecorrente.tema?.trim();
    const descricao = tema
      ? `Tenho notado que "${tema}" aparece com frequência nas suas conversas. Talvez valha acompanhar como isso evolui ao longo do tempo.`
      : undefined;
    candidatos.push(build("relatorio", 60, descricao));
  }

  if (candidatos.length === 0) {
    return null; // Conservador: sem gatilho claro, não mostra nada.
  }

  candidatos.sort((a, b) => b.prioridade - a.prioridade);

  // Anti-repetição só quando há usuário autenticado.
  const usuarioId = input.usuarioId?.trim() || null;
  if (!usuarioId) {
    return candidatos[0];
  }

  const agora = input.agoraMs ?? Date.now();
  const escolhido = candidatos.find((c) => !emCooldown(usuarioId, c.id, agora));
  if (!escolhido) {
    return null; // Tudo recém-sugerido: não insistir neste turno.
  }

  registrarAcao(usuarioId, escolhido.id, agora);
  return escolhido;
}
