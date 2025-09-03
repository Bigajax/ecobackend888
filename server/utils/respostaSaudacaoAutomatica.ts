// utils/respostaSaudacaoAutomatica.ts
// Saudação natural e orientada ao autoconhecimento
// - Detecta saudações curtas (PT/EN + gírias) com regex ampla
// - Usa horário do dia
// - Distingue 1ª interação vs retorno
// - Gera UMA pergunta clara e introspectiva
// - Trata despedidas curtas com fechamento suave

type Msg = { role?: string; content: string };

const MAX_LEN_FOR_GREETING = 48; // garante que só pegue mensagens curtinhas

// Regex estendida (texto já vai normalizado sem acentos)
const GREET_RE =
  /^(?:oi+|oie+|ola+|alo+|opa+|salve|e\s*a[ei]|eai|eae|fala(?:\s*ai)?|falae|hey+|hi+|hello+|yo+|sup|bom\s*dia+|boa\s*tarde+|boa\s*noite+|boa\s*madrugada+|good\s*(?:morning|afternoon|evening|night)|tudo\s*(?:bem|bom|certo)|td\s*bem|beleza|blz|suave|de\s*boa|tranq(?:s)?|tranquilo(?:\s*ai)?|como\s*(?:vai|vc\s*esta|voce\s*esta|ce\s*ta|c[eu]\s*ta))\s*[!?.…]*$/i;

const FAREWELL_RE =
  /^(?:tchau+|ate\s+mais|ate\s+logo|valeu+|vlw+|obrigad[oa]+|brigad[oa]+|falou+|fui+|bom\s*descanso|boa\s*noite|durma\s*bem|ate\s*amanha|ate\s*breve|ate)\s*[!?.…]*$/i;

function normalizar(msg: string): string {
  return msg
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
  // Se houver roles, conta só mensagens 'user'; senão, usa heurística leve.
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
}): string | null {
  if (!messages?.length) return null;

  const lastRaw = messages.at(-1)!.content || "";
  const last = normalizar(lastRaw);
  const isShort = last.length <= MAX_LEN_FOR_GREETING;

  const isGreeting = isShort && GREET_RE.test(last);
  const isFarewell = isShort && FAREWELL_RE.test(last);

  // Despedidas curtas → fechamento suave
  if (isFarewell) {
    const sd = saudacaoDoDia();
    return `Que sua ${sd.toLowerCase()} seja leve. Quando quiser, retomamos por aqui.`;
    // Mantém SEM pergunta para não reabrir o ciclo.
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
    ];

    const variantesRetorno = [
      `Que bom te ver${nome}. O que mudou em você desde a última vez?`,
      `Oi de novo${nome}. O que está mais presente aí agora?`,
      `Olá${nome}. Tem algo pedindo sua atenção hoje?`,
      `Ei${nome}. Prefere começar pelo que pesa ou pelo que está mais claro?`,
    ];

    return firstTurn ? pick(variantesPrimeira) : pick(variantesRetorno);
  }

  return null;
}
