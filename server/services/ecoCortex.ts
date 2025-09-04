// ============================================================================
// getEcoResponseOtimizado — versão corrigida e equivalente ao original
// - Corrige fast-path de saudação (usa { text, meta })
// - Remove IO paralelo não usado
// - Reaproveita embedding com cache
// - Usa extração ROBUSTA do bloco técnico (com response_format, fallback de modelo e regex)
// - Mantém fallback de modelo gpt-5 → gpt-5-chat (403)
// - Mantém métricas/analytics e pós-processo assíncrono iguais ao original
// - Mantém histórico enxuto e max_tokens reduzido
// - ✅ Compat: re-export getEcoResponse e fallback local para NodeCache (sem @types)
// ============================================================================

// IMPORTS
import axios from "axios";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// Dependências da sua base (iguais ao arquivo original)
import { updateEmotionalProfile } from "./updateEmotionalProfile";
import { montarContextoEco } from "../controllers/promptController";
import { embedTextoCompleto } from "./embeddingService";
import { respostaSaudacaoAutomatica, type SaudacaoAutoResp } from "../utils/respostaSaudacaoAutomatica";
import { buscarHeuristicasSemelhantes } from "./heuristicaService";
import { salvarReferenciaTemporaria } from "./referenciasService";
import {
  trackMensagemEnviada,
  trackMemoriaRegistrada,
  trackReferenciaEmocional,
  trackPerguntaProfunda,
  trackEcoDemorou,
} from "../analytics/events/mixpanelEvents";

// ============================================================================
// MODELOS (OpenRouter) — com ENV de fallback
// ============================================================================
const MODEL_MAIN = process.env.ECO_MODEL_MAIN || "openai/gpt-5-chat";        // principal
const MODEL_TECH = process.env.ECO_MODEL_TECH || "openai/gpt-5-chat";        // bloco técnico (prioridade)
const MODEL_TECH_ALT = process.env.ECO_MODEL_TECH_ALT || "openai/gpt-5-mini"; // fallback técnico
const MODEL_FALLBACK_MAIN = "openai/gpt-5-chat";                              // fallback automático para 403 do gpt-5

// ============================================================================
// UTILS BÁSICOS
// ============================================================================
const mapRoleForOpenAI = (role: string): "user" | "assistant" | "system" => {
  if (role === "model") return "assistant";
  if (role === "system") return "system";
  return "user";
};

const limparResposta = (t: string) =>
  t
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/###.*?###/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const formatarTextoEco = (t: string) =>
  t
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/(?<!\n)\n(?!\n)/g, "\n\n")
    .replace(/^\s+-\s+/gm, "— ")
    .replace(/^\s+/gm, "")
    .trim();

const now = () => Date.now();

function fireAndForget(fn: () => Promise<void>) {
  setImmediate(() => {
    fn().catch((err) => console.warn("⚠️ Pós-processo falhou:", err?.message || err));
  });
}

// validação das ENVs críticas (melhor falhar cedo e claro)
function ensureEnvs() {
  const required = ["OPENROUTER_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`ENVs ausentes: ${missing.join(", ")}`);
}

// Axios helper: loga status/corpo quando a OpenRouter responder erro
// e faz fallback automático para gpt-5-chat quando necessário
async function callOpenRouterChat(payload: any, headers: Record<string, string>) {
  try {
    const resp = await axios.post("https://openrouter.ai/api/v1/chat/completions", payload, { headers });
    return resp.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    const msg = body?.error?.message || body?.message || err?.message || "erro desconhecido";
    console.error("[OpenRouter ERROR]", status, body);

    const precisaFallbackGPT5 =
      status === 403 &&
      payload?.model === "openai/gpt-5" &&
      /requiring a key|switch to gpt-5-chat/i.test(msg);

    if (precisaFallbackGPT5) {
      console.warn("↩️ Fallback automático: trocando openai/gpt-5 → openai/gpt-5-chat…");
      const retryPayload = { ...payload, model: MODEL_FALLBACK_MAIN };
      const retryResp = await axios.post("https://openrouter.ai/api/v1/chat/completions", retryPayload, { headers });
      return retryResp.data;
    }

    throw new Error(`Falha OpenRouter (${payload?.model}): ${status} - ${msg}`);
  }
}

// ============================================================================
// PRÉ-GATE VIVA (heurístico, sem 2º round)
// ============================================================================
function heuristicaPreViva(m: string): { aplicar: boolean; bloco: any | null } {
  const texto = (m || "").toLowerCase();
  const len = texto.length;

  const gatilhosFortes = [
    /ang[uú]st/i, /p[aâ]nico/i, /desesper/i, /crise/i, /sofr/i,
    /n[aã]o aguento/i, /vontade de sumir/i, /explod/i, /impulsiv/i,
    /medo/i, /ansiedad/i, /culpa/i, /triste/i
  ];

  const temGatilho = gatilhosFortes.some((r) => r.test(texto));
  const tamanhoOk = len >= 180;
  const aplicar = temGatilho || tamanhoOk;

  if (!aplicar) return { aplicar: false, bloco: null };

  const blocoSeed = {
    emocao_principal: null,
    intensidade: 7,
    tags: [],
    dominio_vida: null,
    padrao_comportamental: null,
    nivel_abertura: "médio",
    categoria: null,
    analise_resumo: m,
  };

  return { aplicar: true, bloco: blocoSeed };
}

// ============================================================================
// Fallback determinístico (regex) para o bloco técnico
// ============================================================================
function extrairBlocoPorRegex(mensagemUsuario: string, respostaIa: string) {
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
    if (regs.some((r) => r.test(texto))) {
      emocao_principal = emo;
      break;
    }
  }

  let intensidade = 0;
  if (emocao_principal) {
    const marcadores3 = [/muito/i, /demais/i, /fort/i, /pânico/i, /crise/i];
    const marcadores2 = [/bastante/i, /bem/i, /grande/i];
    if (marcadores3.some((r) => r.test(texto))) intensidade = 3;
    else if (marcadores2.some((r) => r.test(texto))) intensidade = 2;
    else intensidade = 1;
  }

  const dominio_vida = /trabalho|emprego|carreir/i.test(texto)
    ? "trabalho"
    : /fam[ií]lia|m[ãa]e|pai|irm[ãa]o/i.test(texto)
    ? "família"
    : /relacionament/i.test(texto)
    ? "relacionamentos"
    : /projeto|lançar|app|ia/i.test(texto)
    ? "projetos_pessoais"
    : null;

  const tags: string[] = [];
  if (emocao_principal) tags.push(emocao_principal);
  if (/projeto|lançar|app|ia/i.test(texto)) tags.push("projeto");
  if (dominio_vida) tags.push(dominio_vida);

  return {
    emocao_principal,
    intensidade,
    tags,
    dominio_vida,
    padrao_comportamental: null,
    nivel_abertura: "médio",
    categoria: null,
    analise_resumo: respostaIa?.slice(0, 500) || null,
  };
}

// ============================================================================
// CACHE DE EMBEDDINGS PERSISTENTE (otimização)
// ===== Fallback local para NodeCache, caso o pacote não exista =====
declare const require: any;
let NodeCacheLib: any;
try {
  // tenta usar o pacote real, se estiver instalado
  NodeCacheLib = require("node-cache");
} catch {
  // fallback mínimo com TTL (segundos) e get/set
  class SimpleCache {
    private map = new Map<string, { v: any; exp: number }>();
    private stdTTL = 0;
    private maxKeys = Infinity;
    constructor(opts?: { stdTTL?: number; maxKeys?: number }) {
      this.stdTTL = (opts?.stdTTL ?? 0) * 1000;
      this.maxKeys = opts?.maxKeys ?? Infinity;
    }
    get<T = any>(k: string): T | undefined {
      const e = this.map.get(k);
      if (!e) return undefined;
      if (e.exp && Date.now() > e.exp) {
        this.map.delete(k);
        return undefined;
      }
      return e.v as T;
    }
    set<T = any>(k: string, v: T): boolean {
      if (this.map.size >= this.maxKeys) {
        // política simples: remove a primeira chave
        const first = this.map.keys().next().value;
        if (first) this.map.delete(first);
      }
      const exp = this.stdTTL ? Date.now() + this.stdTTL : 0;
      this.map.set(k, { v, exp });
      return true;
    }
  }
  NodeCacheLib = SimpleCache;
}

const embeddingCache = new NodeCacheLib({ stdTTL: 3600, maxKeys: 1000 });

function hashText(text: string): string {
  return crypto.createHash("md5").update(text.trim().toLowerCase()).digest("hex");
}
async function getEmbeddingCached(text: string, tipo: string): Promise<number[]> {
  if (!text?.trim()) return [];
  const hash = hashText(text);
  const cached = embeddingCache.get(hash);
  if (cached) {
    console.log(`🎯 Cache hit para embedding (${tipo})`);
    return cached as number[];
  }
  const embedding = await embedTextoCompleto(text, tipo);
  if (embedding?.length) embeddingCache.set(hash, embedding);
  return embedding;
}

// ============================================================================
// PARALELIZAÇÃO ENXUTA (apenas o que entra no prompt)
// ============================================================================
async function operacoesParalelas(ultimaMsg: string, userId?: string) {
  // Só gera embedding uma vez
  let userEmbedding: number[] = [];
  if (ultimaMsg.trim().length > 0) {
    userEmbedding = await getEmbeddingCached(ultimaMsg, "entrada_usuario");
  }

  // Heurísticas (única consulta de rede usada no prompt)
  let heuristicas: any[] = [];
  if (userEmbedding.length > 0) {
    try {
      heuristicas = await buscarHeuristicasSemelhantes({
        usuarioId: userId ?? null,
        userEmbedding,
        matchCount: 5,
      });
    } catch {
      heuristicas = [];
    }
  }

  return { heuristicas, userEmbedding };
}

// ============================================================================
// OTIMIZAÇÃO DO PROMPT (reduz tokens) c/ cache
// ============================================================================
const PROMPT_CACHE = new Map<string, string>();
async function montarContextoOtimizado(params: any) {
  const cacheKey = `${params.userId}_${params.nivel}_${params.intensidade}`;
  if (PROMPT_CACHE.has(cacheKey)) {
    const cached = PROMPT_CACHE.get(cacheKey)!;
    return cached + `\n\nMensagem atual: ${params.texto}`;
  }
  const contexto = await montarContextoEco(params);
  // Cacheia apenas contextos mais "estáveis"
  if ((params.nivel ?? 2) <= 2) {
    PROMPT_CACHE.set(cacheKey, contexto);
  }
  return contexto;
}

// ============================================================================
// BLOCO TÉCNICO — versão ROBUSTA com cache e fallbacks (do original)
// ============================================================================
const BLOCO_CACHE = new Map<string, any>();
async function gerarBlocoTecnicoSeparado({
  mensagemUsuario,
  respostaIa,
  apiKey,
}: {
  mensagemUsuario: string;
  respostaIa: string;
  apiKey: string;
}): Promise<any | null> {
  try {
    const palavrasUser = mensagemUsuario.trim().split(/\s+/).length;
    const palavrasResp = respostaIa.trim().split(/\s+/).length;
    if (palavrasUser < 4 && palavrasResp < 20) {
      console.log("ℹ️ Bloco técnico: pulado por baixa relevância (texto curto)");
      return null;
    }

    const mkPrompt = (enxuto = false) =>
      enxuto
        ? `Retorne SOMENTE este JSON válido, sem comentários e sem markdown:
{"emocao_principal":"","intensidade":0,"tags":[],"dominio_vida":"","padrao_comportamental":"","nivel_abertura":"baixo","categoria":"","analise_resumo":""}
Baseie no texto do usuário: "${mensagemUsuario}"
e na resposta da IA: "${respostaIa}"
Se não souber algum campo, use null, [], "" ou 0.`
        : `
Extraia e retorne **apenas** o JSON abaixo, sem markdown e sem comentários. Preencha com base na resposta e na mensagem.

Resposta da IA:
"""
${respostaIa}
"""

Mensagem original do usuário:
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
  "analise_resumo": ""
}

Regras:
- Retorne SOMENTE o JSON válido.
- Se não souber, use null, [], "" ou 0.
`;

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
      "X-Title": "Eco App - Bloco Tecnico",
    };

    const doCall = async (prompt: string, model: string) =>
      await callOpenRouterChat(
        {
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 480,
          response_format: { type: "json_object" },
        },
        headers
      );

    // 1) tentativa com MODEL_TECH + prompt completo
    let usadoModel = MODEL_TECH;
    let data = await doCall(mkPrompt(false), usadoModel);
    let rawContent: string = data?.choices?.[0]?.message?.content ?? "";

    // 2) se vazio, prompt enxuto
    if (!rawContent || rawContent.trim().length < 5) {
      console.warn("⚠️ Bloco técnico vazio — tentando novamente (prompt enxuto)...");
      data = await doCall(mkPrompt(true), usadoModel);
      rawContent = data?.choices?.[0]?.message?.content ?? "";
    }

    // 3) se ainda vazio, tenta modelo alternativo
    if (!rawContent || rawContent.trim().length < 5) {
      if (MODEL_TECH_ALT && MODEL_TECH_ALT !== usadoModel) {
        console.warn(`↩️ Tentando modelo técnico alternativo: ${MODEL_TECH_ALT}`);
        usadoModel = MODEL_TECH_ALT;
        data = await doCall(mkPrompt(true), usadoModel);
        rawContent = data?.choices?.[0]?.message?.content ?? "";
      }
    }

    console.log("[ECO] Modelo técnico usado:", usadoModel);

    // 4) parse
    if (!rawContent) {
      console.warn("⚠️ Bloco técnico: resposta vazia final.");
      const regexBloco = extrairBlocoPorRegex(mensagemUsuario, respostaIa);
      return regexBloco.intensidade > 0 ? regexBloco : null;
    }

    const match = rawContent.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn("⚠️ Bloco técnico: nenhum JSON detectado na resposta — usando fallback regex.");
      const regexBloco = extrairBlocoPorRegex(mensagemUsuario, respostaIa);
      return regexBloco.intensidade > 0 ? regexBloco : null;
    }

    const parsed = JSON.parse(match[0]);

    // sanitização
    const permitido = [
      "emocao_principal",
      "intensidade",
      "tags",
      "dominio_vida",
      "padrao_comportamental",
      "nivel_abertura",
      "categoria",
      "analise_resumo",
    ];
    const cleanJson: any = {};
    for (const k of permitido) cleanJson[k] = parsed[k] ?? null;

    const allEmpty =
      !cleanJson.emocao_principal &&
      (!Array.isArray(cleanJson.tags) || cleanJson.tags.length === 0) &&
      (!cleanJson.intensidade || cleanJson.intensidade === 0);

    if (allEmpty) {
      const regexBloco = extrairBlocoPorRegex(mensagemUsuario, respostaIa);
      if (regexBloco.intensidade > 0) return regexBloco;
    }

    console.log("🧠 Bloco técnico extraído e sanitizado:", cleanJson);
    return cleanJson;
  } catch (err: any) {
    console.warn("⚠️ Erro ao gerar bloco técnico:", err?.message || err);
    const fallback = extrairBlocoPorRegex(mensagemUsuario, respostaIa);
    return fallback.intensidade > 0 ? fallback : null;
  }
}

async function gerarBlocoTecnicoComCache(mensagemUsuario: string, respostaIa: string, apiKey: string) {
  const messageHash = hashText(mensagemUsuario + respostaIa.slice(0, 200));
  if (BLOCO_CACHE.has(messageHash)) {
    console.log("🎯 Cache hit para bloco técnico");
    return BLOCO_CACHE.get(messageHash);
  }
  const bloco = await gerarBlocoTecnicoSeparado({ mensagemUsuario, respostaIa, apiKey });
  BLOCO_CACHE.set(messageHash, bloco);
  return bloco;
}

// ============================================================================
// STREAMING (mantido, mas NÃO usado aqui — só habilite se for streamar ao cliente)
// ============================================================================
async function streamResponse(payload: any, headers: any) {
  const streamPayload = { ...payload, stream: true, stream_options: { include_usage: true } };
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify(streamPayload),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let fullContent = "";
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));
      for (const line of lines) {
        if (line === "data: [DONE]") break;
        try {
          const data = JSON.parse(line.slice(6));
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) fullContent += delta;
        } catch {}
      }
    }
    return { choices: [{ message: { content: fullContent } }] };
  } catch (error) {
    console.warn("Streaming falhou, usando chamada normal:", error);
    return await callOpenRouterChat(payload, headers);
  }
}

// ============================================================================
// FUNÇÃO PRINCIPAL OTIMIZADA (equivalente ao original)
// ============================================================================
export async function getEcoResponseOtimizado({
  messages,
  userId,
  userName,
  accessToken,
  mems = [],
  forcarMetodoViva = false,
  blocoTecnicoForcado = null,
}: {
  messages: { id?: string; role: string; content: string }[];
  userId?: string;
  userName?: string;
  accessToken: string;
  mems?: any[];
  forcarMetodoViva?: boolean;
  blocoTecnicoForcado?: any;
}): Promise<{
  message: string;
  intensidade?: number;
  resumo?: string;
  emocao?: string;
  tags?: string[];
  categoria?: string | null;
}> {
  const t0 = now();
  try {
    ensureEnvs();

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Parâmetro "messages" vazio ou inválido.');
    }
    if (!accessToken) throw new Error("Token (accessToken) ausente.");

    // 1) FAST-PATH: usa { text, meta } e salva referência leve sem embedding
    const auto: SaudacaoAutoResp | null = respostaSaudacaoAutomatica({ messages, userName });
    if (auto) {
      console.log("⚡ Fast-path:", now() - t0, "ms");
      const ultimaMsg = messages.at(-1)?.content ?? "";
      if (userId) {
        fireAndForget(async () => {
          try {
            await salvarReferenciaTemporaria({
              usuario_id: userId,
              mensagem_id: messages.at(-1)?.id ?? null,
              resumo_eco: auto.text,                 // resposta curta
              emocao_principal: "indefinida",
              intensidade: 3,                        // leve
              contexto: ultimaMsg,                   // entrada do usuário
              dominio_vida: "social",
              padrao_comportamental: "abertura para interação",
              nivel_abertura: 1,
              categoria: "interação social",
              analise_resumo: auto.text,
              tags: ["saudação"],
              embedding: [],                         // sem custo aqui
            });
          } catch { /* silencioso */ }
        });
      }
      return { message: auto.text };
    }

    // 2) Supabase (para pós-processo)
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const ultimaMsg = messages.at(-1)?.content || "";

    // 3) Operações paralelas enxutas (embedding + heurísticas)
    const { heuristicas = [], userEmbedding } = await operacoesParalelas(ultimaMsg, userId);

    // 4) Gate VIVA (heurístico)
    const gate = heuristicaPreViva(ultimaMsg);
    const vivaAtivo = forcarMetodoViva || gate.aplicar;
    const vivaBloco = blocoTecnicoForcado || (gate.aplicar ? gate.bloco : null);

    // 5) Montagem do prompt (com cache)
    const systemPrompt = await montarContextoOtimizado({
      userId,
      userName,
      perfil: null,
      mems,
      forcarMetodoViva: vivaAtivo,
      blocoTecnicoForcado: vivaBloco,
      texto: ultimaMsg,
      heuristicas,
      userEmbedding,
      skipSaudacao: true,
    });

    // 6) Histórico enxuto
    const mensagensEnxutas = messages.slice(-5);
    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...mensagensEnxutas.map((m) => ({ role: mapRoleForOpenAI(m.role), content: m.content })),
    ];

    const apiKey = process.env.OPENROUTER_API_KEY!;

    // 7) Chamada ao modelo (sem streaming aqui, para obter usage/tokens e reduzir overhead)
    const inicioEco = now();
    const data = await callOpenRouterChat(
      {
        model: MODEL_MAIN,
        messages: chatMessages,
        temperature: 0.75,
        top_p: 0.9,
        presence_penalty: 0.2,
        frequency_penalty: 0.2,
        max_tokens: 700,
      },
      {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_APP_URL || "http://localhost:5173",
        "X-Title": "Eco App - Chat",
      }
    );

    const duracaoEco = now() - inicioEco;
    if (duracaoEco > 3000) {
      trackEcoDemorou({ userId, duracaoMs: duracaoEco, ultimaMsg });
    }

    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    if (!raw) throw new Error("Resposta vazia da IA.");

    console.log("[ECO] Modelo principal usado:", data?.model || MODEL_MAIN);

    trackMensagemEnviada({
      userId,
      tempoRespostaMs: duracaoEco,
      tokensUsados: data?.usage?.total_tokens || null,
      modelo: data?.model || MODEL_MAIN,
    });

    const cleaned = formatarTextoEco(limparResposta(raw));

    // 8) Bloco técnico (robusto + cache)
    const bloco = await gerarBlocoTecnicoComCache(ultimaMsg, cleaned, apiKey);

    // 9) Retorno imediato
    const responsePayload: {
      message: string;
      intensidade?: number;
      resumo?: string;
      emocao?: string;
      tags?: string[];
      categoria?: string | null;
    } = { message: cleaned };

    if (bloco && typeof bloco.intensidade === "number") {
      responsePayload.intensidade = bloco.intensidade;
      responsePayload.resumo =
        typeof bloco?.analise_resumo === "string" && bloco.analise_resumo.trim().length > 0
          ? bloco.analise_resumo.trim()
          : cleaned;
      responsePayload.emocao = bloco.emocao_principal || "indefinida";
      responsePayload.tags = Array.isArray(bloco.tags) ? bloco.tags : [];
      responsePayload.categoria = bloco.categoria ?? null;
    } else if (bloco) {
      responsePayload.categoria = bloco.categoria ?? null;
    }

    // 10) Pós-processo NÃO bloqueante — idêntico ao original, mas reusando cache de embedding
    fireAndForget(async () => {
      try {
        const cleanedSafe = typeof cleaned === "string" ? cleaned.trim() : "";
        const analiseResumoSafe = typeof bloco?.analise_resumo === "string" ? bloco.analise_resumo.trim() : "";

        let textoParaEmbedding = [cleanedSafe, analiseResumoSafe]
          .filter((s) => typeof s === "string" && s.trim().length > 0)
          .join("\n")
          .trim();
        if (!textoParaEmbedding || textoParaEmbedding.length < 3) {
          textoParaEmbedding = "PLACEHOLDER EMBEDDING";
        } else {
          textoParaEmbedding = textoParaEmbedding.slice(0, 8000);
        }

        // Reaproveita cache
        const embeddingFinal = await getEmbeddingCached(textoParaEmbedding, "memoria ou referencia");

        let referenciaAnteriorId: string | null = null;
        if (userId) {
          const { data: ultimaMemoria } = await supabase
            .from("memories")
            .select("id")
            .eq("usuario_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          // @ts-ignore
          referenciaAnteriorId = (ultimaMemoria as any)?.id ?? null;
        }

        const intensidadeNum = typeof bloco?.intensidade === "number" ? Math.round(bloco.intensidade) : 0;
        const nivelNumerico =
          typeof bloco?.nivel_abertura === "number"
            ? Math.round(bloco.nivel_abertura)
            : bloco?.nivel_abertura === "baixo"
            ? 1
            : bloco?.nivel_abertura === "médio"
            ? 2
            : bloco?.nivel_abertura === "alto"
            ? 3
            : null;

        const payload = {
          usuario_id: userId!,
          mensagem_id: messages.at(-1)?.id ?? null,
          resumo_eco: bloco?.analise_resumo ?? cleaned,
          emocao_principal: bloco?.emocao_principal || "indefinida",
          intensidade: intensidadeNum,
          contexto: ultimaMsg,
          dominio_vida: bloco?.dominio_vida ?? null,
          padrao_comportamental: bloco?.padrao_comportamental ?? null,
          nivel_abertura: nivelNumerico,
          categoria: bloco?.categoria ?? null,
          analise_resumo: bloco?.analise_resumo ?? null,
          tags: Array.isArray(bloco?.tags) ? bloco!.tags : [],
          embedding: embeddingFinal,
          referencia_anterior_id: referenciaAnteriorId,
        };

        if (userId && Number.isFinite(intensidadeNum)) {
          if (intensidadeNum >= 7) {
            const { error } = await supabase.from("memories").insert([
              { ...payload, salvar_memoria: true, created_at: new Date().toISOString() },
            ]);
            if (error) {
              console.warn("⚠️ Erro ao salvar memória:", error.message);
            } else {
              console.log(`✅ Memória salva com sucesso para o usuário ${userId}.`);
              try {
                console.log(`🔄 Atualizando perfil emocional de ${userId}...`);
                await updateEmotionalProfile(userId!);
                console.log(`🧠 Perfil emocional atualizado com sucesso.`);
              } catch (err: any) {
                console.error("❌ Erro ao atualizar perfil emocional:", err?.message || err);
              }
            }
            trackMemoriaRegistrada({
              userId,
              intensidade: intensidadeNum,
              emocao: payload.emocao_principal,
              dominioVida: payload.dominio_vida,
              categoria: payload.categoria,
            });
          } else if (intensidadeNum > 0) {
            await salvarReferenciaTemporaria(payload);
            console.log(`📎 Referência emocional leve registrada para ${userId}`);
            trackReferenciaEmocional({
              userId,
              intensidade: intensidadeNum,
              emocao: payload.emocao_principal,
              tags: payload.tags,
              categoria: payload.categoria,
            });
          } else {
            console.log("ℹ️ Intensidade 0 – nada salvo.");
          }

          if (nivelNumerico === 3) {
            trackPerguntaProfunda({
              userId,
              emocao: payload.emocao_principal,
              intensidade: intensidadeNum,
              categoria: payload.categoria,
              dominioVida: payload.dominio_vida,
            });
          }
        } else {
          console.warn("⚠️ Usuário indefinido ou intensidade inválida – nada salvo.");
        }
      } catch (err: any) {
        console.warn("⚠️ Pós-processo erro:", err?.message || err);
      }
    });

    return responsePayload;
  } catch (err: any) {
    console.error("❌ getEcoResponseOtimizado error:", err?.message || err);
    throw err;
  }
}

// ============================================================================
// MÉTRICAS DE PERFORMANCE (mantidas)
// ============================================================================
interface PerformanceMetrics {
  tempoTotal: number;
  tempoEmbedding: number;
  tempoContexto: number;
  tempoEco: number;
  tempoBlocoTecnico: number;
  cacheHits: number;
  tokensUsados: number;
}

const metricas: PerformanceMetrics[] = [];

function logMetricas(metrica: PerformanceMetrics) {
  metricas.push(metrica);
  if (metricas.length % 10 === 0) {
    const avg = metricas.slice(-10).reduce(
      (acc, m) => ({
        tempoTotal: acc.tempoTotal + m.tempoTotal,
        tempoEco: acc.tempoEco + m.tempoEco,
        cacheHits: acc.cacheHits + m.cacheHits,
        tokensUsados: acc.tokensUsados + m.tokensUsados,
      }),
      { tempoTotal: 0, tempoEco: 0, cacheHits: 0, tokensUsados: 0 }
    );
    console.log("📊 Métricas (últimas 10):", {
      tempoMedio: Math.round(avg.tempoTotal / 10),
      ecoMedio: Math.round(avg.tempoEco / 10),
      cacheHitRate: Math.round((avg.cacheHits / 10) * 100) + "%",
      tokensMedio: Math.round(avg.tokensUsados / 10),
    });
  }
}

// ============================================================================
// LIMPEZA DE CACHE PERIÓDICA
// ============================================================================
setInterval(() => {
  const beforeSize = PROMPT_CACHE.size + BLOCO_CACHE.size;
  if (PROMPT_CACHE.size > 100) PROMPT_CACHE.clear();
  if (BLOCO_CACHE.size > 200) BLOCO_CACHE.clear();
  const afterSize = PROMPT_CACHE.size + BLOCO_CACHE.size;
  if (beforeSize !== afterSize) {
    console.log(`🧹 Cache limpo: ${beforeSize} → ${afterSize} entradas`);
  }
}, 30 * 60 * 1000);

// ============================================================================
// ✅ Compatibilidade com rotas antigas
// ============================================================================
export { getEcoResponseOtimizado as getEcoResponse };
