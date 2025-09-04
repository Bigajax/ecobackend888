// utils/respostaSaudacaoAutomatica.ts
// Saudação natural e orientada ao autoconhecimento — com FAST-PATH e meta

export type Msg = { role?: string; content: string };

export type SaudacaoAutoMeta = {
  isGreeting: boolean;
  isFarewell: boolean;
  firstTurn: boolean;
};

export type SaudacaoAutoResp = {
  text: string;
  meta: SaudacaoAutoMeta;
};

const ECO_DEBUG = process.env.ECO_DEBUG === "true";

// Aceita mensagens bem curtas (ex.: "olá eco", "oi", "oi eco", "oi, tudo bem?")
const MAX_LEN_FOR_GREETING = 40;

// Regex estendida (texto já vai normalizado sem acentos)
// Aceita sufixo curto opcional: "eco", "@eco", "bot", "assistente", "ai", "chat"
// Inclui variações "oi tudo bem", "olá eco", "oi eco", "tudo bem"
const GREET_RE =
  /^(?:(?:oi+|oie+|ola+|ol[aá]|alo+|opa+|salve)(?:[, ]*(?:tudo\s*bem|td\s*bem))?|tudo\s*(?:bem|bom|certo)|oi+[, ]*tudo\s*bem|ol[aá]\s*eco|oi\s*eco|oie\s*eco|ola\s*eco|alo\s*eco|bom\s*dia+|boa\s*tarde+|boa\s*noite+|boa\s*madrugada+|e\s*a[ei]|e\s*a[ií]\??|eai|eae|fala(?:\s*ai)?|falae|hey+|hi+|hello+|yo+|sup|beleza|blz|suave|de\s*boa|tranq(?:s)?|tranquilo(?:\s*ai)?|como\s*(?:vai|vc\s*esta|voce\s*esta|ce\s*ta|c[eu]\s*ta))(?:[\s,]*(@?eco|eco|bot|assistente|ai|chat))?\s*[!?.…]*$/i;

// "boa noite" removido daqui para não conflitar como despedida
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

function saudacaoDoDia(date = new Date()) {
  const h = date.getHours();
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

export function respostaSaudacaoAutomatica({
  messages,
  userName,
}: {
  messages: Msg[];
  userName?: string;
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
    });
  }

  // Despedidas curtas → fechamento suave
  if (isFarewell) {
    const sd = saudacaoDoDia();
    return {
      text: `Que sua ${sd.toLowerCase()} seja leve. Quando quiser, retomamos por aqui.`,
      meta: { isGreeting: false, isFarewell: true, firstTurn: false },
    };
  }

  // Saudações curtas → acolhe e convida à auto-observação
  if (isGreeting) {
    const sd = saudacaoDoDia();
    const nome = userName ? `, ${userName.split(" ")[0]}` : "";
    const firstTurn = isFirstUserTurn(messages);

    const variantesPrimeira = [
      `${sd}${nome}. Vamos começar simples: o que você nota em você agora?`,
      `${sd}${nome}. Se desse um nome ao seu estado de hoje, qual seria?`,
      `${sd}${nome}. Respire um instante e observe: qual emoção aparece primeiro?`,
      `${sd}${nome}. Em 1–3 palavras, como você está?`,
    ];

    const variantesRetorno = [
      `Que bom te ver${nome}. O que mudou em você desde a última vez?`,
      `Oi de novo${nome}. O que está mais presente aí agora?`,
      `Olá${nome}. Tem algo pedindo sua atenção hoje?`,
      `Ei${nome}. Prefere começar pelo que pesa ou pelo que está mais claro?`,
    ];

    return {
      text: firstTurn ? pick(variantesPrimeira) : pick(variantesRetorno),
      meta: { isGreeting: true, isFarewell: false, firstTurn },
    };
  }

  return null;
}
