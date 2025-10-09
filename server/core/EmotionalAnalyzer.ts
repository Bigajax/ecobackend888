// core/EmotionalAnalyzer.ts (ou onde este arquivo vive)
import { BLOCO_CACHE } from "../services/CacheService";
import { callOpenRouterChat } from "../adapters/OpenRouterAdapter";
import { hashText } from "../adapters/EmbeddingAdapter";

// ===== modelos =====
// Preferência por OpenAI 5.0; envs permitem override.
// Mantemos uma lista de fallback para lidar com variações de slug.
const MODEL_TECH     = process.env.ECO_MODEL_TECH     || "openai/gpt-5.0";
const MODEL_TECH_ALT = process.env.ECO_MODEL_TECH_ALT || "openai/gpt-5.0-mini";

// ordem de tentativa (primeiros são os preferidos)
const CANDIDATES_PRIMARY = [
  MODEL_TECH,
  "openai/gpt-5.0",       // alias comum
  "openai/gpt-5.0-mini",  // mini 5.0
];
const CANDIDATES_FALLBACK = [
  MODEL_TECH_ALT,
  "openai/gpt-5-chat",    // compat anteriores
  "openai/gpt-5-mini",
];

// ===== estrutura padrão para cenários em que o modelo não retorna JSON =====
function blocoEmBranco() {
  return {
    emocao_principal: null,
    intensidade: 0,
    tags: [] as string[],
    dominio_vida: null,
    padrao_comportamental: null,
    nivel_abertura: "baixo",
    categoria: null,
    analise_resumo: null,
    tema_recorrente: null,
    evolucao_temporal: null,
    impacto_resposta_estimado: null,
    sugestao_proximo_passo: null,
    modo_hibrido_acionado: false,
    tipo_referencia: null,
  };
}

// ===== prompt builders =====
function mkPrompt(enxuto: boolean, mensagemUsuario: string, respostaIa: string) {
  if (enxuto) {
    return `Retorne SOMENTE este JSON válido, sem comentários e sem markdown:
{"emocao_principal":"","intensidade":0,"tags":[],"dominio_vida":"","padrao_comportamental":"","nivel_abertura":"baixo","categoria":"","analise_resumo":"","tema_recorrente":null,"evolucao_temporal":null,"impacto_resposta_estimado":null,"sugestao_proximo_passo":null,"modo_hibrido_acionado":false,"tipo_referencia":null}
Baseie no texto do usuário: "${mensagemUsuario}"
e na resposta da IA: "${respostaIa}"
Se não souber algum campo, use null, [], "" ou 0.`;
  }
  return `
Extraia e retorne apenas o JSON abaixo, sem markdown/comentários.

Resposta da IA:
"""${respostaIa}"""

Mensagem original:
"${mensagemUsuario}"

JSON alvo:
{
  "emocao_principal": "",
  "intensidade": 0,
  "tags": [],
  "dominio_vida": "",
  "padrao_comportamental": "",
  "nivel_abertura": "baixo" | "médio" | "alto",
  "categoria": "",
  "analise_resumo": "",
  "tema_recorrente": null,
  "evolucao_temporal": null,
  "impacto_resposta_estimado": "abriu" | "fechou" | "neutro" | null,
  "sugestao_proximo_passo": null,
  "modo_hibrido_acionado": false,
  "tipo_referencia": "abertura" | "durante" | "emocao_intensa" | null
}`;
}

// ===== chamada com fallback de modelos =====
async function tryJsonWithModel(model: string, prompt: string, timeoutMs: number) {
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
    "X-Title": "Eco App - Bloco Tecnico",
  };
  const data = await callOpenRouterChat(
    {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 480,
      // quando o provedor suportar, força JSON:
      response_format: { type: "json_object" as const },
    },
    headers,
    timeoutMs
  );
  const raw = data?.choices?.[0]?.message?.content ?? "";
  return (raw || "").trim();
}

export async function gerarBlocoTecnicoSeparado(mensagemUsuario: string, respostaIa: string) {
  const firstPrompt = mkPrompt(false, mensagemUsuario, respostaIa);
  const fallbackPrompt = mkPrompt(true, mensagemUsuario, respostaIa);

  try {
    // 1) tentativas com os modelos “primários”
    for (const model of CANDIDATES_PRIMARY) {
      try {
        const raw = await tryJsonWithModel(model, firstPrompt, 4000);
        if (raw) {
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) return sanitizeJson(m[0], mensagemUsuario, respostaIa);
        }
        const raw2 = await tryJsonWithModel(model, fallbackPrompt, 3500);
        if (raw2) {
          const m2 = raw2.match(/\{[\s\S]*\}/);
          if (m2) return sanitizeJson(m2[0], mensagemUsuario, respostaIa);
        }
      } catch { /* segue fallback */ }
    }

    // 2) tentativas com fallback
    for (const model of CANDIDATES_FALLBACK) {
      try {
        const raw = await tryJsonWithModel(model, fallbackPrompt, 3500);
        if (raw) {
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) return sanitizeJson(m[0], mensagemUsuario, respostaIa);
        }
      } catch { /* último recurso abaixo */ }
    }

    // 3) fallback seguro
    return blocoEmBranco();
  } catch {
    return blocoEmBranco();
  }
}

function sanitizeJson(jsonStr: string, mensagemUsuario: string, respostaIa: string) {
  try {
    const parsed = JSON.parse(jsonStr);
    const permitido = [
      "emocao_principal","intensidade","tags","dominio_vida","padrao_comportamental",
      "nivel_abertura","categoria","analise_resumo","tema_recorrente","evolucao_temporal",
      "impacto_resposta_estimado","sugestao_proximo_passo","modo_hibrido_acionado","tipo_referencia",
    ];
    const clean: any = {};
    for (const k of permitido) clean[k] = parsed[k] ?? null;

    const empty =
      !clean.emocao_principal &&
      (!Array.isArray(clean.tags) || !clean.tags.length) &&
      (!clean.intensidade || clean.intensidade === 0);

    if (typeof clean.intensidade === "number") {
      clean.intensidade = Math.max(0, Math.min(10, clean.intensidade));
    } else {
      clean.intensidade = 0;
    }

    return empty ? blocoEmBranco() : clean;
  } catch {
    return blocoEmBranco();
  }
}

export async function gerarBlocoTecnicoComCache(mensagemUsuario: string, respostaIa: string) {
  const key = hashText(mensagemUsuario + (respostaIa || "").slice(0, 200));
  if (BLOCO_CACHE.has(key)) return BLOCO_CACHE.get(key);
  const bloco = await gerarBlocoTecnicoSeparado(mensagemUsuario, respostaIa);
  BLOCO_CACHE.set(key, bloco);
  return bloco;
}
