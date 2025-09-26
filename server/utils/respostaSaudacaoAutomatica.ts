// utils/respostaSaudacaoAutomatica.ts
// Saudação natural e orientada ao autoconhecimento — com FAST-PATH e meta (nível 1 fixo)

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

// "boa noite" removido da despedida para não conflitar com saudação noturna
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
   VARIAÇÕES (nível 1 fixo)
   ========================= */

type Tpl = (sd: string, nome: string) => string;

const BASE_VARIANTES_PRIMEIRA: Tpl[] = [
  (sd, nome) => `${sd}${nome}. O que está mais presente em você agora — pensamento, sensação ou emoção?`,
  (sd, nome) => `${sd}${nome}. Se pudesse dar uma palavra simples para o agora, qual seria?`,
  (sd, nome) => `${sd}${nome}. Onde sua atenção se apoia neste instante?`,
  (sd, nome) => `${sd}${nome}. Há algo que você gostaria de deixar claro antes de seguirmos?`,
  (sd, nome) => `${sd}${nome}. O que faria diferença para esta conversa ser útil para você hoje?`,
  (sd, nome) => `${sd}${nome}. Se tivesse que escolher um foco pequeno agora, qual seria?`,
  (sd, nome) => `${sd}${nome}. Como está o ritmo interno que você percebe em si neste momento?`,
  // 👇 coach amigável (30%)
  (sd, nome) => `${sd}${nome}. Que bom ter você aqui — um passo de cada vez já faz diferença.`,
];

const VARIANTES_POR_HORARIO: Record<"madrugada" | "manha" | "tarde" | "noite", Tpl[]> = {
  madrugada: [
    (sd, nome) => `${sd}${nome}. O que ainda ocupa sua mente antes do descanso?`,
    (sd, nome) => `${sd}${nome}. Há algo que você gostaria de soltar antes de dormir?`,
    (sd, nome) => `${sd}${nome}. O que pode esperar até amanhã sem pesar agora?`,
  ],
  manha: [
    (sd, nome) => `${sd}${nome}. Qual é a sua primeira prioridade para hoje?`,
    (sd, nome) => `${sd}${nome}. Que estado de espírito você quer levar para o dia?`,
    (sd, nome) => `${sd}${nome}. O que te ajudaria a começar de forma mais clara esta manhã?`,
  ],
  tarde: [
    (sd, nome) => `${sd}${nome}. Como você percebe sua energia neste ponto do dia?`,
    (sd, nome) => `${sd}${nome}. O que merece um pouco mais da sua atenção agora?`,
    (sd, nome) => `${sd}${nome}. O que mudou em você desde a manhã até aqui?`,
  ],
  noite: [
    (sd, nome) => `${sd}${nome}. O que você leva como aprendizado deste dia?`,
    (sd, nome) => `${sd}${nome}. Há algo que você gostaria de encerrar antes de descansar?`,
    (sd, nome) => `${sd}${nome}. O que você reconhece em si quando o dia desacelera?`,
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
  const permitirHorario = periodo !== "madrugada";
  if (permitirHorario && r < 0.15) {
    return pick(VARIANTES_POR_HORARIO[periodo])(sd, nome);
  }
  return pick(BASE_VARIANTES_PRIMEIRA)(sd, nome);
}

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

  if (isFarewell) {
    const sd = saudacaoDoDia({ clientHour, clientTz });
    return {
      text: `Que sua ${sd.toLowerCase()} seja leve. Quando quiser, retomamos por aqui.`,
      meta: { isGreeting: false, isFarewell: true, firstTurn: false },
    };
  }

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
      const variantesRetorno = [
        `Que bom te ver${nome}. O que mudou em você desde a última vez?`,
        `Oi de novo${nome}. O que está mais presente aí agora?`,
        `Olá${nome}. Tem algo pedindo sua atenção hoje?`,
        `Ei${nome}. Prefere começar pelo que pesa ou pelo que está mais claro?`,
        `De volta${nome}. Como você se encontra hoje?`,
        // 👇 coach amigável (30%)
        `Bom te ver${nome}. Vamos com calma, sem pressa — por onde quer começar?`,
      ];

      return {
        text: pick(variantesRetorno),
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
