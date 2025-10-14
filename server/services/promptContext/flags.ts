import type { HeuristicaFlagRecord } from "./heuristicaFlags";

export type Flags = {
  curiosidade: boolean;
  pedido_pratico: boolean;
  duvida_classificacao: boolean;

  // VIVA / roteamento
  saudacao: boolean;
  factual: boolean;
  cansaco: boolean;
  desabafo: boolean;
  urgencia: boolean;
  emocao_alta_linguagem: boolean;
  crise: boolean;

  // Vulnerabilidade & autorregulação
  vergonha: boolean;
  vulnerabilidade: boolean;
  defesas_ativas: boolean;
  combate: boolean;
  evitamento: boolean;
  autocritica: boolean;
  culpa_marcada: boolean;
  catastrofizacao: boolean;

  // aliases EN (debug/API)
  shame: boolean;
  vulnerability: boolean;
  active_defenses: boolean;
  avoidance: boolean;
  self_criticism: boolean;
  guilt: boolean;
  catastrophizing: boolean;

  // Heurísticas cognitivas
  ancoragem: boolean;
  causas_superam_estatisticas: boolean;
  certeza_emocional: boolean;
  excesso_intuicao_especialista: boolean;
  ignora_regressao_media: boolean;

  // Crise granular (usadas nas regras)
  ideacao: boolean;
  desespero: boolean;
  vazio: boolean;
  autodesvalorizacao: boolean;

  // Decisão dinâmica (preenchida em tempo real)
  useMemories?: boolean;
  patternSynthesis?: boolean;
};

function normalize(t: string): string {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectarSaudacaoBreve(texto?: string): boolean {
  const t = (texto || "").trim();
  if (!t) return true;
  const words = t.split(/\s+/).filter(Boolean);
  const curto = t.length <= 18 || words.length <= 3;
  const temSaud = /\b(oi|olá|ola|hey|e?a[iy]|bom dia|boa tarde|boa noite)\b/i.test(t);
  const leve = /^[\w\sáéíóúâêôãõç!?.,…-]{0,40}$/i.test(t);
  return (temSaud && curto) || (curto && leve);
}

function isIntense(text: string): boolean {
  const t = text.toLowerCase();
  const gatilhos = [
    /p[aâ]nico/,
    /crise/,
    /desesper/,
    /insuport/,
    /vontade de sumir/,
    /explod/,
    /taquicard|batimentos/i,
    /ansiedad|ang[uú]st/i,
  ];
  const longo = t.length >= 180;
  return longo || gatilhos.some((r) => r.test(t));
}

export function estimarIntensidade0a10(text: string): number {
  if (!text.trim()) return 0;
  const base = isIntense(text) ? 7 : 3;
  const extra = Math.min(3, Math.floor(text.length / 200));
  return Math.max(0, Math.min(10, base + extra));
}

export function derivarNivel(texto: string, saudacaoBreve: boolean): 1 | 2 | 3 {
  if (saudacaoBreve) return 1;
  const len = (texto || "").trim().length;
  if (len < 120) return 1;
  if (len < 300) return 2;
  return 3;
}

export function derivarFlags(
  texto: string,
  heuristicaFlags: HeuristicaFlagRecord = {}
): Flags {
  const raw = texto || "";
  const t = normalize(raw);

  const curiosidade =
    /\b(como|por que|porque|pra que|para que|e se|poderia|podes|pode)\b/.test(t) ||
    /\?$/.test(raw);
  const pedido_pratico =
    /\b(passos?|tutorial|guia|checklist|lista|exemplo|modelo|template|o que faco|o que fazer|me ajuda)\b/.test(t);
  const duvida_classificacao =
    /\b(nivel|abertura|intensidade|classificacao|classificar)\b/.test(t);

  const saudacao =
    /\b(oi+|oie+|ola+|ola|ol[aá]|alo+|opa+|salve|bom dia|boa tarde|boa noite|boa madrugada)\b/.test(t);
  const factual =
    /\b(que dia|que data|horario|endereco|onde fica|preco|valor|numero|cpf|rg|link|url|site|telefone|contato|confirmar|confirmacao|agenda|quando|que horas)\b/.test(t);
  const cansaco =
    /\b(cansad[ao]|sem energia|esgotad[ao]|exaust[ao]|exausta|acabado|acabada|saturad[ao](?: mas (?:de boa|tranq|ok))?)\b/.test(t);
  const desabafo =
    /\b(so desabafando|queria desabafar|so queria falar|nao precisa responder|nao quero conselho|nao preciso de intervencao)\b/.test(t);
  const urgencia = /\b(preciso resolver ja|nao sei mais o que fazer|socorro|urgente|agora|pra ontem)\b/.test(t);
  const emocao_alta_linguagem =
    /\b(nao aguento|no limite|explodindo|desesperad[oa]|muito ansios[oa]|panico|crise|tremend[oa])\b/.test(t);

  const ideacao = /suicid|me matar|tirar minha vida|acabar com tudo/i.test(raw);
  const desespero = /desesper|sem sa[ií]da|no limite/i.test(t);
  const vazio = /\bvazio\b|\bsem sentido\b|\bnada faz sentido\b/i.test(t);
  const autodesvalorizacao = /\b(n[aã]o presto|n[aã]o valho|sou um lixo|sou horr[ií]vel)\b/i.test(t);
  const crise = ideacao || desespero || vazio || autodesvalorizacao;

  const vergonha = /\b(vergonha|humilha[cç][aã]o|me escondo|me esconder)\b/.test(t);
  const vulnerabilidade = /\b(vulner[aá]vel|abrir meu cora[cç][aã]o|medo de me abrir)\b/.test(t);
  const defesas_ativas =
    /\b(racionalizo|racionalizando|minimizo|minimizando|faco piada|faço piada|mudo de assunto|fugir do tema)\b/.test(t);
  const combate = /\b(brigar|bater de frente|comprar briga|contra-ataco|contra ataco|contra-atacar)\b/.test(t);
  const evitamento = /\b(evito|evitando|fujo|fugindo|adi[oó]o|procrastino|adiar|adiando|adiamento)\b/.test(t);
  const autocritica = /\b(sou um lixo|sou horr[ií]vel|me detesto|sou fraco|sou fraca|falhei|fracassei)\b/.test(t);
  const culpa_marcada = /\b(culpa|culpada|culpado|me sinto culp[oa])\b/.test(t);
  const catastrofizacao =
    /\b(catastrof|vai dar tudo errado|nunca vai melhorar|tudo acaba|sempre ruim|nada funciona)\b/.test(t);

  return {
    curiosidade,
    pedido_pratico,
    duvida_classificacao,
    saudacao,
    factual,
    cansaco,
    desabafo,
    urgencia,
    emocao_alta_linguagem,
    crise,

    vergonha,
    vulnerabilidade,
    defesas_ativas,
    combate,
    evitamento,
    autocritica,
    culpa_marcada,
    catastrofizacao,

    shame: vergonha,
    vulnerability: vulnerabilidade,
    active_defenses: defesas_ativas,
    avoidance: evitamento,
    self_criticism: autocritica,
    guilt: culpa_marcada,
    catastrophizing: catastrofizacao,

    ancoragem: Boolean(heuristicaFlags.ancoragem),
    causas_superam_estatisticas: Boolean(heuristicaFlags.causas_superam_estatisticas),
    certeza_emocional: Boolean(heuristicaFlags.certeza_emocional),
    excesso_intuicao_especialista: Boolean(heuristicaFlags.excesso_intuicao_especialista),
    ignora_regressao_media: Boolean(heuristicaFlags.ignora_regressao_media),

    ideacao,
    desespero,
    vazio,
    autodesvalorizacao,

    useMemories: false,
    patternSynthesis: false,
  };
}

export default Flags;
