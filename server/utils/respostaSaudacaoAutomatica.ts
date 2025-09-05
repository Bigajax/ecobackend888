// utils/respostaSaudacaoAutomatica.ts
// Saudação natural e orientada ao autoconhecimento — com FAST-PATH e meta (nível 1 fixo)

export type Msg = { role?: string; content: string };

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
const MAX_LEN_FOR_GREETING = 64;

// Regex estendida (texto já vai normalizado sem acentos)
// Aceita sufixo curto opcional: "eco", "@eco", "bot", "assistente", "ai", "chat"
const GREET_RE =
  /^(?:(?:oi+|oie+|ola+|ol[aá]|alo+|opa+|salve)(?:[, ]*(?:tudo\s*bem|td\s*bem))?|tudo\s*(?:bem|bom|certo)|oi+[, ]*tudo\s*bem|ol[aá]\s*eco|oi\s*eco|oie\s*eco|ola\s*eco|alo\s*eco|bom\s*dia+|boa\s*tarde+|boa\s*noite+|boa\s*madrugada+|e\s*a[ei]|e\s*a[ií]\??|eai|eae|fala(?:\s*ai)?|falae|hey+|hi+|hello+|yo+|sup|beleza|blz|suave|de\s*boa|tranq(?:s)?|tranquilo(?:\s*ai)?|como\s*(?:vai|vc\s*esta|voce\s*esta|ce\s*ta|c[eu]\s*ta))(?:[\s,]*(@?eco|eco|bot|assistente|ai|chat))?\s*[!?.…]*$/i;

// "boa noite" removido da despedida para não conflitar com saudação noturna
const FAREWELL_RE =
  /^(?:tchau+|ate\s+mais|ate\s+logo|valeu+|vlw+|obrigad[oa]+|brigad[oa]+|falou+|fui+|bom\s*descanso|durma\s*bem|ate\s*amanha|ate\s*breve|ate)\s*[!?.…]*$/i;

function normalizar(msg: string): string {
  return (msg || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, " ")
    .trim();
}

// ====== HORA LOCAL DO CLIENTE (fuso-agnóstico; fallback BR) ======
function horaLocalDoCliente(opts?: { clientHour?: number; clientTz?: string }): number {
  // 1) Hora explícita do cliente (0..23)
  if (typeof opts?.clientHour === "number" && opts.clientHour >= 0 && opts.clientHour <= 23) {
    return opts.clientHour;
  }
  // 2) Timezone IANA (ex.: "America/Sao_Paulo")
  if (opts?.clientTz) {
    try {
      const fmt = new Intl.DateTimeFormat("pt-BR", {
        hour: "numeric",
        hour12: false,
        timeZone: opts.clientTz,
      });
      return Number(fmt.format(new Date()));
    } catch {
      // ignora e cai no fallback
    }
  }
  // 3) Fallback: UTC-3 (Brasil). Se internacionalizar, prefira exigir clientTz.
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

// Base ultra-suave e introspectiva
const BASE_VARIANTES_PRIMEIRA: Tpl[] = [
  (sd, nome) => `${sd}${nome}. Vamos começar leve? O que aparece primeiro em você agora?`,
  (sd, nome) => `${sd}${nome}. Se fosse uma palavra só para este momento, qual seria?`,
  (sd, nome) => `${sd}${nome}. Topa uma pausa de 5 segundos e me conta o que ficou mais nítido?`,
  (sd, nome) => `${sd}${nome}. Onde a respiração se nota mais: peito, barriga ou garganta?`,
  (sd, nome) => `${sd}${nome}. O corpo dá algum sinal (tensão, calor, leveza) que vale registrar?`,
  (sd, nome) => `${sd}${nome}. Entre corpo, emoção e pensamento, por onde prefere começar?`,
  (sd, nome) => `${sd}${nome}. Prefere iniciar pelo que está calmo ou pelo que incomoda um pouco?`,
  (sd, nome) => `${sd}${nome}. Em 1–3 palavras, como você está neste instante?`,
  (sd, nome) => `${sd}${nome}. De 0 a 10, que dose de calma você nota? Sem certo ou errado.`,
  (sd, nome) => `${sd}${nome}. Há algo pequeno pedindo cuidado hoje?`,
  (sd, nome) => `${sd}${nome}. Podemos começar com uma gratidão simples de agora?`,
];

// Por horário (toque opcional e leve)
const VARIANTES_POR_HORARIO: Record<"madrugada" | "manha" | "tarde" | "noite", Tpl[]> = {
  madrugada: [
    (sd, nome) => `${sd}${nome}. Que cuidado suave cabe neste horário quieto?`,
    (sd, nome) => `${sd}${nome}. A madrugada às vezes traz reflexões. Alguma apareceu?`,
  ],
  manha: [
    (sd, nome) => `${sd}${nome}. Como você está chegando neste novo dia?`,
    (sd, nome) => `${sd}${nome}. Que intenção gentil quer semear nesta manhã?`,
    (sd, nome) => `${sd}${nome}. Entre o sono e a vigília, o que ficou de eco?`,
  ],
  tarde: [
    (sd, nome) => `${sd}${nome}. No meio do dia, onde você se encontra?`,
    (sd, nome) => `${sd}${nome}. Esta tarde pede mais foco ou mais fluidez?`,
    (sd, nome) => `${sd}${nome}. Que ritmo seu corpo pede agora?`,
  ],
  noite: [
    (sd, nome) => `${sd}${nome}. Como você está chegando nesta noite?`,
    (sd, nome) => `${sd}${nome}. O que do dia merece gratidão ou perdão?`,
    (sd, nome) => `${sd}${nome}. Onde você pode soltar um pouco o peso do dia?`,
  ],
};

function periodoDoDiaFromHour(h: number): "madrugada" | "manha" | "tarde" | "noite" {
  if (h < 6) return "madrugada";
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

// Seleção simples: 85% base, 15% por horário (exceto de madrugada)
function escolherSaudacaoPrimeira(sd: string, nome: string, h: number): string {
  const periodo = periodoDoDiaFromHour(h);
  const r = Math.random();
  const permitirHorario = periodo !== "madrugada"; // mantém o tom mais contido de madrugada
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

  const lastRaw = messages.at(-1)!.content || "";
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

  // Despedidas curtas → fechamento suave (nível não se aplica aqui)
  if (isFarewell) {
    const sd = saudacaoDoDia({ clientHour, clientTz });
    return {
      text: `Que sua ${sd.toLowerCase()} seja leve. Quando quiser, retomamos por aqui.`,
      meta: { isGreeting: false, isFarewell: true, firstTurn: false },
    };
  }

  // Saudações curtas → sempre nível 1 (ultra-suave)
  if (isGreeting) {
    const sd = saudacaoDoDia({ clientHour, clientTz });
    const nome = userName ? `, ${userName.split(" ")[0]}` : "";
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
