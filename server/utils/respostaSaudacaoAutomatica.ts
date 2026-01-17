// utils/respostaSaudacaoAutomatica.ts
// Saudações equilibradas — curiosas, leves e exploratórias

export type MsgRole = "user" | "assistant" | "system";
export type Msg = { role?: MsgRole; content: string };

export type SaudacaoAutoMeta = {
  isGreeting: boolean;
  isFarewell: boolean;
  firstTurn: boolean;
  suggestedLevel?: number; // 1 fixo (saudação)
  contextualCue?: string;  // "greeting"
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
  return arr[Math.floor(Math.random() * Math.random() * arr.length)];
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
   VARIAÇÕES EQUILIBRADAS
   ========================= */

type Tpl = (sd: string, nome: string) => string;

/* ---------------------------------------
   SAUDAÇÕES PRIMEIRA VEZ — equilibradas
------------------------------------------ */
const BASE_VARIANTES_PRIMEIRA: Tpl[] = [
  (sd, nome) => `${sd}${nome}. Como você está chegando aqui hoje?`,
  (sd, nome) => `${sd}${nome}. Se tivesse que resumir seu momento em uma frase, qual seria?`,
  (sd, nome) => `${sd}${nome}. O que está mais presente em você agora: curiosidade, cansaço ou algo específico?`,

  (sd, nome) => `${sd}${nome}. O que faria diferença para você organizar ou entender melhor hoje?`,
  (sd, nome) => `${sd}${nome}. Você quer falar mais sobre emoções, decisões ou algo prático da sua rotina?`,
  (sd, nome) => `${sd}${nome}. Tem algo que vem voltando com frequência nesses dias?`,

  (sd, nome) => `${sd}${nome}. Se pudesse escolher um único tema para começar, qual seria?`,
  (sd, nome) => `${sd}${nome}. O que anda ocupando mais espaço aí dentro ultimamente?`,

  (sd, nome) => `${sd}${nome}. Estou aqui. Sobre o que faria sentido começar?`,
  (sd, nome) => `${sd}${nome}. O que você sente vontade de colocar em palavras primeiro?`,

  (sd, nome) => `${sd}${nome}. Você veio buscar clareza sobre algo específico ou quer explorar aos poucos o que aparecer?`,
];

/* ---------------------------------------
   VARIANTES POR HORÁRIO — mais diárias
------------------------------------------ */
const VARIANTES_POR_HORARIO: Record<"madrugada" | "manha" | "tarde" | "noite", Tpl[]> = {
  madrugada: [
    (sd, nome) => `${sd}${nome}. O que ainda está te mantendo acordado(a) agora?`,
    (sd, nome) => `${sd}${nome}. Tem algum pensamento que não está deixando você desligar?`,
    (sd, nome) => `${sd}${nome}. Se pudesse aliviar uma preocupação antes de dormir, qual seria?`,
    (sd, nome) => `${sd}${nome}. Quais pensamentos mais aparecem nessa hora?`,
  ],
  manha: [
    (sd, nome) => `${sd}${nome}. Como você está começando este dia?`,
    (sd, nome) => `${sd}${nome}. Tem algo de hoje que já ocupa sua cabeça?`,
    (sd, nome) => `${sd}${nome}. Se este dia tivesse um foco principal, qual você escolheria?`,
    (sd, nome) => `${sd}${nome}. Antes do dia acelerar, o que faria sentido organizar primeiro?`,
  ],
  tarde: [
    (sd, nome) => `${sd}${nome}. Como você está se sentindo neste meio de dia?`,
    (sd, nome) => `${sd}${nome}. Desde a manhã até agora, teve algo que te marcou?`,
    (sd, nome) => `${sd}${nome}. Teve alguma situação hoje que você gostaria de revisar comigo?`,
    (sd, nome) => `${sd}${nome}. Sua energia agora está mais focada ou mais dispersa?`,
  ],
  noite: [
    (sd, nome) => `${sd}${nome}. Como você chega no fim deste dia?`,
    (sd, nome) => `${sd}${nome}. Tem algo de hoje que ainda ecoa em você?`,
    (sd, nome) => `${sd}${nome}. Se tivesse que destacar um momento do dia, qual viria à mente?`,
    (sd, nome) => `${sd}${nome}. Antes de encerrar, o que faria sentido reconhecer?`,
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

  // 20% usa horária
  const permitirHorario = periodo !== "madrugada";
  if (permitirHorario && r < 0.20) {
    return pick(VARIANTES_POR_HORARIO[periodo])(sd, nome);
  }

  return pick(BASE_VARIANTES_PRIMEIRA)(sd, nome);
}

/* ---------------------------------------
   SAUDAÇÕES DE RETORNO — continuidade
------------------------------------------ */
const VARIANTES_RETORNO: ((nome: string) => string)[] = [
  (nome) => `Que bom te ver de novo${nome}. O que mudou desde a última vez?`,
  (nome) => `Olá novamente${nome}. Nesses dias, teve algo que voltou bastante à sua cabeça?`,

  (nome) => `Oi${nome}. E hoje, o que está pedindo mais atenção em você?`,
  (nome) => `Aqui de novo${nome}. Você está se sentindo mais calmo(a), acelerado(a) ou em dúvida?`,

  (nome) => `Bem-vindo(a) de volta${nome}. Estamos olhando para algo familiar ou para algo novo hoje?`,

  (nome) => `Olá${nome}. Podemos retomar de onde paramos ou começar por algo diferente. O que prefere?`,
  (nome) => `Oi${nome}. O que faz mais sentido abordar hoje?`,

  (nome) => `Ei${nome}. Prefere começar pelo que está mais pesado ou pelo que já está mais claro?`,

  (nome) => `Fico feliz em te receber de novo${nome}. Se fosse dar um nome ao seu estado de hoje, qual seria?`,
  (nome) => `De volta${nome}. Faz mais sentido desabafar, organizar ou decidir algo?`,
];

/* ---------------------------------------
   DESPEDIDAS — suaves, realistas
------------------------------------------ */
const VARIANTES_DESPEDIDA: ((sd: string) => string)[] = [
  (sd) => `Até breve. Que sua ${sd.toLowerCase()} seja um pouco mais leve depois daqui.`,
  (sd) => `Quando quiser continuar, estarei aqui. Boa ${sd.toLowerCase()}.`,
  (sd) => `Fica bem. Se algo voltar a incomodar, retomamos depois.`,
  (sd) => `Até a próxima. Cuide de você com gentileza hoje.`,
  (sd) => `Vá com calma. Se quiser organizar de novo o que sente, é só voltar.`,
  (sd) => `Cuide-se. Boa ${sd.toLowerCase()} — e, se algo apertar, conversamos depois.`,
];

/* ---------------------------------------
   FUNÇÃO PRINCIPAL
------------------------------------------ */
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
