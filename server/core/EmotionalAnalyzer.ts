import { BLOCO_CACHE } from "../services/CacheService";
import { callOpenRouterChat } from "../adapters/OpenRouterAdapter";
import { hashText } from "../adapters/EmbeddingAdapter";

const MODEL_TECH     = process.env.ECO_MODEL_TECH     || "openai/gpt-5-chat";
const MODEL_TECH_ALT = process.env.ECO_MODEL_TECH_ALT || "openai/gpt-5-mini";

export function extrairBlocoPorRegex(mensagemUsuario: string, respostaIa: string) {
  const texto = `${mensagemUsuario}\n${respostaIa}`.toLowerCase();
  const emocoes: Record<string, RegExp[]> = {
    medo: [/medo/i, /receio/i, /temor/i, /insegur/i],
    ansiedade: [/ansiedad/i, /apreens/i, /nervos/i],
    tristeza: [/triste/i, /desanima/i, /abatid/i],
    raiva: [/raiva/i, /irrit/i, /frustr/i, /ódio/i],
    culpa: [/culpa/i, /remors/i, /arrepend/i],
  };
  let emocao_principal: string | null = null;
  for (const [emo, regs] of Object.entries(emocoes)) {
    if (regs.some((r) => r.test(texto))) { emocao_principal = emo; break; }
  }
  let intensidade = 0;
  if (emocao_principal) {
    const m3 = [/muito/i, /demais/i, /fort/i, /pânico/i, /crise/i];
    const m2 = [/bastante/i, /bem/i, /grande/i];
    intensidade = m3.some((r)=>r.test(texto)) ? 3 : m2.some((r)=>r.test(texto)) ? 2 : 1;
  }
  const dominio_vida = /trabalho|emprego|carreir/i.test(texto) ? "trabalho"
    : /fam[ií]lia|m[ãa]e|pai|irm[ãa]o/i.test(texto) ? "família"
    : /relacionament/i.test(texto) ? "relacionamentos"
    : /projeto|lançar|app|ia/i.test(texto) ? "projetos_pessoais" : null;

  const tags: string[] = [];
  if (emocao_principal) tags.push(emocao_principal);
  if (/projeto|lançar|app|ia/i.test(texto)) tags.push("projeto");
  if (dominio_vida) tags.push(dominio_vida);

  return {
    emocao_principal, intensidade, tags, dominio_vida,
    padrao_comportamental: null, nivel_abertura: "médio",
    categoria: null, analise_resumo: respostaIa?.slice(0, 500) || null,
  };
}

export async function gerarBlocoTecnicoSeparado(mensagemUsuario: string, respostaIa: string) {
  const mkPrompt = (enxuto = false) =>
    enxuto
      ? `Retorne SOMENTE este JSON válido, sem comentários e sem markdown:
{"emocao_principal":"","intensidade":0,"tags":[],"dominio_vida":"","padrao_comportamental":"","nivel_abertura":"baixo","categoria":"","analise_resumo":"","tema_recorrente":null,"evolucao_temporal":null,"impacto_resposta_estimado":null,"sugestao_proximo_passo":null,"modo_hibrido_acionado":false,"tipo_referencia":null}
Baseie no texto do usuário: "${mensagemUsuario}"
e na resposta da IA: "${respostaIa}"
Se não souber algum campo, use null, [], "" ou 0.`
      : `
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

  try {
    const headers = {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
      "X-Title": "Eco App - Bloco Tecnico",
    };

    let model = MODEL_TECH;
    let data = await callOpenRouterChat(
      { model, messages: [{ role: "user", content: mkPrompt(false) }], temperature: 0.2, max_tokens: 480, response_format: { type: "json_object" } },
      headers, 4000
    );
    let raw = data?.choices?.[0]?.message?.content ?? "";

    if (!raw?.trim()) {
      data = await callOpenRouterChat(
        { model, messages: [{ role: "user", content: mkPrompt(true) }], temperature: 0.2, max_tokens: 480, response_format: { type: "json_object" } },
        headers, 3500
      );
      raw = data?.choices?.[0]?.message?.content ?? "";
    }
    if (!raw?.trim() && MODEL_TECH_ALT !== model) {
      model = MODEL_TECH_ALT;
      data = await callOpenRouterChat(
        { model, messages: [{ role: "user", content: mkPrompt(true) }], temperature: 0.2, max_tokens: 480, response_format: { type: "json_object" } },
        headers, 3500
      );
      raw = data?.choices?.[0]?.message?.content ?? "";
    }

    if (!raw?.trim()) return extrairBlocoPorRegex(mensagemUsuario, respostaIa);

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return extrairBlocoPorRegex(mensagemUsuario, respostaIa);

    const parsed = JSON.parse(match[0]);
    const permitido = ["emocao_principal","intensidade","tags","dominio_vida","padrao_comportamental","nivel_abertura","categoria","analise_resumo","tema_recorrente","evolucao_temporal","impacto_resposta_estimado","sugestao_proximo_passo","modo_hibrido_acionado","tipo_referencia"];
    const clean: any = {}; for (const k of permitido) clean[k] = parsed[k] ?? null;

    const empty = !clean.emocao_principal && (!Array.isArray(clean.tags)||!clean.tags.length) && (!clean.intensidade||clean.intensidade===0);
    return empty ? extrairBlocoPorRegex(mensagemUsuario, respostaIa) : clean;
  } catch {
    return extrairBlocoPorRegex(mensagemUsuario, respostaIa);
  }
}

export async function gerarBlocoTecnicoComCache(mensagemUsuario: string, respostaIa: string) {
  const key = hashText(mensagemUsuario + (respostaIa || "").slice(0, 200));
  if (BLOCO_CACHE.has(key)) return BLOCO_CACHE.get(key);
  const bloco = await gerarBlocoTecnicoSeparado(mensagemUsuario, respostaIa);
  BLOCO_CACHE.set(key, bloco);
  return bloco;
}
