// utils/respostaSaudacaoAutomatica.ts
// Saudação contemplativa — presença filosófica desde o primeiro contato

export type MsgRole = "user" | "assistant" | "system";
export type Msg = { role?: MsgRole; content: string };

export type SaudacaoAutoMeta = {
  isGreeting: boolean;
  isFarewell: boolean;
  firstTurn: boolean;
  suggestedLevel?: number;   // 1 fixo (saudação)
  contextualCue?: string;    // "greeting"
};

export type SaudacaoAutoResp = {
  text: string;
  meta: SaudacaoAutoMeta;
};

const ECO_DEBUG = process.env.ECO_DEBUG === "true";

// Aceita mensagens bem curtas (ex.: "olá eco", "oi", "oi eco", "oi, tudo bem?")
export const MAX_LEN_FOR_GREETING = 64;

// Regex estendida (texto já vai normalizado sem acentos)
export const GREET_RE =
  /^(?:(?:oi+|oie+|ola+|ol[aá]|alo+|opa+|salve)(?:[, ]*(?:tudo\s*bem|td\s*bem))?|tudo\s*(?:bem|bom|certo)|oi+[, ]*tudo\s*bem|ol[aá]\s*eco|oi\s*eco|oie\s*eco|ola\s*eco|alo\s*eco|bom\s*dia+|boa\s*tarde+|boa\s*noite+|boa\s*madrugada+|e\s*a[ei]|e\s*a[ií]\??|eai|eae|fala(?:\s*ai)?|falae|hey+|hi+|hello+|yo+|sup|beleza|blz|suave|de\s*boa|tranq(?:s)?|tranquilo(?:\s*ai)?|como\s*(?:vai|vc\s*esta|voce\s*esta|ce\s*ta|c[eu]\s*ta))(?:[\s,]*(@?eco|eco|bot|assistente|ai|chat))?\s*[!?.…]*$/i;

export const FAREWELL_RE =
  /^(?:tchau+|ate\s+mais|ate\s+logo|valeu+|vlw+|obrigad[oa]+|brigad[oa]+|falou+|fui+|bom\s*descanso|durma\s*bem|ate\s*amanha|ate\s*breve|ate)\s*[!?.…]*$/i;

function normalizar(msg: string): string {
  return (msg || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ====== HORA LOCAL DO CLIENTE ======
function horaLocalDoCliente(opts?: { clientHour?: number; clientTz?: string }): number {
  if (typeof opts?.clientHour === "number" && opts.clientHour >= 0 && opts.clientHour <= 23) {
    return opts.clientHour;
  }
  if (opts?.clientTz) {
    try {
      const fmt = new Intl.DateTimeFormat("pt-BR", {
        hour: "numeric",
        hour12: false,
        timeZone: opts.clientTz,
      });
      return Number(fmt.format(new Date()));
    } catch {}
  }
  const utcHour = new Date().getUTCHours();
  return (utcHour - 3 + 24) % 24;
}

function saudacaoDoDia(opts?: { clientHour?: number; clientTz?: string }): string {
  const h = horaLocalDoCliente(opts);
  if (h < 6) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isFirstUserTurn(messages: Msg[]): boolean {
  const hasRoles = messages.some((m) => typeof m.role !== "undefined");
  if (hasRoles) {
    const userMsgs = messages.filter((m) => m.role === "user").length;
    return userMsgs <= 1;
  }
  return messages.length <= 2;
}

/* =========================
   VARIAÇÕES CONTEMPLATIVAS
   (nível 1 fixo, profundidade filosófica)
   ========================= */

type Tpl = (sd: string, nome: string) => string;

// Saudações primeira vez — perguntas arqueológicas, fenomenológicas, estruturais leves
const BASE_VARIANTES_PRIMEIRA: Tpl[] = [
  // Fenomenológicas (experiência direta)
  (sd, nome) => `${sd}${nome}. O que está mais vivo em você neste exato momento?`,
  (sd, nome) => `${sd}${nome}. Se tivesse que nomear o que pulsa agora, o que seria?`,
  (sd, nome) => `${sd}${nome}. Onde sua atenção pousa quando você para por alguns segundos?`,
  
  // Arqueológicas leves (camada logo abaixo)
  (sd, nome) => `${sd}${nome}. O que te trouxe até aqui — uma pergunta, uma inquietação, ou só curiosidade?`,
  (sd, nome) => `${sd}${nome}. O que há sob o que você mostrou até agora que merecia ser explorado?`,
  
  // Estruturais simples (prioridade, foco)
  (sd, nome) => `${sd}${nome}. Se pudesse focar em uma única coisa agora, qual seria?`,
  (sd, nome) => `${sd}${nome}. O que pediria mais atenção sua neste momento?`,
  
  // Abertura pura (espaço sem direção)
  (sd, nome) => `${sd}${nome}. Estou aqui. Por onde você quer começar?`,
  (sd, nome) => `${sd}${nome}. O que faria diferença você dizer em voz alta agora?`,
  
  // Paradoxo leve (ocasional)
  (sd, nome) => `${sd}${nome}. Você veio buscar clareza ou descobrir o que ainda não sabe que busca?`,
];

// Saudações por horário — conexão fenomenológica com o tempo vivido
const VARIANTES_POR_HORARIO: Record<"madrugada" | "manha" | "tarde" | "noite", Tpl[]> = {
  madrugada: [
    (sd, nome) => `${sd}${nome}. O que ainda pede espaço antes do descanso?`,
    (sd, nome) => `${sd}${nome}. Há algo que você gostaria de soltar antes de deixar o dia ir?`,
    (sd, nome) => `${sd}${nome}. O que impede o silêncio de chegar?`,
    (sd, nome) => `${sd}${nome}. Entre tudo que aconteceu hoje, o que ainda pulsa?`,
  ],
  manha: [
    (sd, nome) => `${sd}${nome}. O que você carrega do sono para este dia que começa?`,
    (sd, nome) => `${sd}${nome}. Se este dia tivesse um único fio condutor, qual seria?`,
    (sd, nome) => `${sd}${nome}. O que você gostaria de deixar claro antes que o dia te leve?`,
    (sd, nome) => `${sd}${nome}. Qual estado você quer habitar enquanto o dia se desenrola?`,
  ],
  tarde: [
    (sd, nome) => `${sd}${nome}. Como você se percebe agora, neste meio de caminho?`,
    (sd, nome) => `${sd}${nome}. O que mudou em você desde a manhã até aqui?`,
    (sd, nome) => `${sd}${nome}. Há algo pedindo reavaliação neste ponto do dia?`,
    (sd, nome) => `${sd}${nome}. Onde você sente que sua energia está agora — presente, dispersa ou recolhida?`,
  ],
  noite: [
    (sd, nome) => `${sd}${nome}. O que você reconhece em si quando o ritmo do dia desacelera?`,
    (sd, nome) => `${sd}${nome}. Há algo que você ainda precisa dizer sobre hoje, mesmo que só para você?`,
    (sd, nome) => `${sd}${nome}. O que deste dia você leva consigo para depois?`,
    (sd, nome) => `${sd}${nome}. Entre tudo que aconteceu, o que pede ser observado antes de virar a página?`,
  ],
};

function periodoDoDiaFromHour(h: number): "madrugada" | "manha" | "tarde" | "noite" {
  if (h < 6) return "madrugada";
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

function escolherSaudacaoPrimeira(sd: string, nome: string, h: number): string {
  const periodo = periodoDoDiaFromHour(h);
  const r = Math.random();
  
  // 20% de chance de usar variante específica de horário (exceto madrugada, que é rara)
  const permitirHorario = periodo !== "madrugada";
  if (permitirHorario && r < 0.20) {
    return pick(VARIANTES_POR_HORARIO[periodo])(sd, nome);
  }
  
  // 80% usa variantes base (contemplativas, variadas)
  return pick(BASE_VARIANTES_PRIMEIRA)(sd, nome);
}

// Saudações de retorno — reconhecimento de continuidade + abertura
const VARIANTES_RETORNO: ((nome: string) => string)[] = [
  // Arqueológica (o que mudou)
  (nome) => `De volta${nome}. O que se moveu em você desde a última vez?`,
  (nome) => `Olá novamente${nome}. O que é diferente agora do que era antes?`,
  
  // Fenomenológica (o que está presente)
  (nome) => `Oi${nome}. O que está pedindo atenção em você agora?`,
  (nome) => `Aqui de novo${nome}. O que pulsa com mais força hoje?`,
  
  // Estrutural leve (padrão, recorrência)
  (nome) => `Bem-vindo de volta${nome}. Algo familiar reapareceu ou algo novo surgiu?`,
  
  // Abertura pura
  (nome) => `Olá${nome}. Estou aqui. Por onde você quer começar hoje?`,
  (nome) => `Oi${nome}. O que você gostaria de explorar desta vez?`,
  
  // Escolha (peso/clareza)
  (nome) => `Ei${nome}. Prefere começar pelo que pesa ou pelo que já está mais claro?`,
  
  // Ritmo/estado (reconhecimento de autonomia)
  (nome) => `Que bom ter você aqui${nome}. Como você se encontra hoje?`,
  (nome) => `De volta${nome}. Você veio para mergulhar fundo ou para organizar o que já está na superfície?`,
];

// Despedidas contemplativas — fechamento com dignidade
const VARIANTES_DESPEDIDA: ((sd: string) => string)[] = [
  (sd) => `Até breve. Que sua ${sd.toLowerCase()} seja leve.`,
  (sd) => `Quando quiser retomar, estarei aqui. Boa ${sd.toLowerCase()}.`,
  (sd) => `Fica bem. O que conversamos aqui permanece contigo.`,
  (sd) => `Até a próxima. Que o silêncio que vem agora seja fértil.`,
  (sd) => `Vá com leveza. Quando precisar, retomamos daqui.`,
  (sd) => `Cuide-se. ${sd} — e que você encontre o que procura, mesmo que seja só descanso.`,
];

export function respostaSaudacaoAutomatica({
  messages,
  userName,
  clientHour,
  clientTz,
}: {
  messages: Msg[];
  userName?: string;
  clientHour?: number;
  clientTz?: string;
}): SaudacaoAutoResp | null {
  if (!messages?.length) return null;

  const lastRaw = messages[messages.length - 1]?.content ?? "";
  const last = normalizar(lastRaw);
  const isShort = last.length <= MAX_LEN_FOR_GREETING;

  const isGreeting = isShort && GREET_RE.test(last);
  const isFarewell = isShort && FAREWELL_RE.test(last);

  if (ECO_DEBUG) {
    console.log("[SAUDACAO]", {
      last,
      isShort,
      isGreeting,
      isFarewell,
      len: last.length,
      clientHour,
      clientTz,
    });
  }

  // ===== DESPEDIDA =====
  if (isFarewell) {
    const sd = saudacaoDoDia({ clientHour, clientTz });
    return {
      text: pick(VARIANTES_DESPEDIDA)(sd),
      meta: { isGreeting: false, isFarewell: true, firstTurn: false },
    };
  }

  // ===== SAUDAÇÃO =====
  if (isGreeting) {
    const sd = saudacaoDoDia({ clientHour, clientTz });
    const nome = userName?.trim() ? `, ${userName.trim().split(/\s+/)[0]}` : "";
    const firstTurn = isFirstUserTurn(messages);
    const h = horaLocalDoCliente({ clientHour, clientTz });

    if (firstTurn) {
      return {
        text: escolherSaudacaoPrimeira(sd, nome, h),
        meta: {
          isGreeting: true,
          isFarewell: false,
          firstTurn,
          suggestedLevel: 1,
          contextualCue: "greeting",
        },
      };
    } else {
      return {
        text: pick(VARIANTES_RETORNO)(nome),
        meta: {
          isGreeting: true,
          isFarewell: false,
          firstTurn: false,
          suggestedLevel: 1,
          contextualCue: "greeting",
        },
      };
    }
  }

  return null;
}