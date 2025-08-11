// IMPORTS
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import { updateEmotionalProfile } from "./updateEmotionalProfile";
import { montarContextoEco } from "../controllers/promptController";
import { embedTextoCompleto } from "./embeddingService";
import { respostaSaudacaoAutomatica } from "../utils/respostaSaudacaoAutomatica";
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
const MODEL_MAIN = process.env.ECO_MODEL_MAIN || "openai/gpt-5-chat";   // principal
const MODEL_TECH = process.env.ECO_MODEL_TECH || "openai/gpt-5-mini";   // bloco técnico
const MODEL_TECH_ALT = process.env.ECO_MODEL_TECH_ALT || "openai/gpt-5-chat"; // fallback técnico
const MODEL_FALLBACK_MAIN = "openai/gpt-5-chat";                         // fallback automático

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
    // intensifica por gatilhos
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
// BLOCO TÉCNICO – extração (com response_format, fallback de modelo e fallback regex)
// ============================================================================
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
          max_tokens: 480, // ↑ um pouco para reduzir “vazio”
          // Tenta forçar JSON quando suportado
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
      // fallback regex
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

    // se veio tudo “vazio”, ainda tenta regex pra pelo menos ter intensidade 1
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
    // último recurso: regex
    const fallback = extrairBlocoPorRegex(mensagemUsuario, respostaIa);
    return fallback.intensidade > 0 ? fallback : null;
  }
}

// ============================================================================
// FUNÇÃO PRINCIPAL – com FAST-PATH, histórico enxuto e pós-processo assíncrono
// ============================================================================
export async function getEcoResponse({
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

    // 1) FAST-PATH: saudações/despedidas
    const respostaInicial = respostaSaudacaoAutomatica({ messages, userName });
    if (respostaInicial) {
      console.log("[ECO] Fast-path saudação acionado em", Date.now() - t0, "ms");
      return { message: respostaInicial };
    }

    // 2) Supabase
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const ultimaMsg = messages.at(-1)?.content || "";

    // 3) Embedding da entrada
    const userEmbedding =
      ultimaMsg.trim().length > 0 ? await embedTextoCompleto(ultimaMsg, "entrada_usuario") : [];

    // 4) Heurísticas
    let heuristicasAtivas: any[] = [];
    if (ultimaMsg.trim().length > 5) {
      heuristicasAtivas = await (async () => {
        try {
          return await buscarHeuristicasSemelhantes({
            usuarioId: userId ?? null,
            userEmbedding,
            matchCount: 5,
          });
        } catch {
          // @ts-ignore (fallback p/ assinatura antiga)
          return await buscarHeuristicasSemelhantes(ultimaMsg, userId ?? null);
        }
      })();
    }

    // 5) PRÉ-GATE VIVA
    const gate = heuristicaPreViva(ultimaMsg);
    const vivaAtivo = forcarMetodoViva || gate.aplicar;
    const vivaBloco = blocoTecnicoForcado || (gate.aplicar ? gate.bloco : null);

    // 6) Montagem do prompt e chamada ao modelo
    const systemPrompt = await montarContextoEco({
      userId,
      userName,
      perfil: null,
      mems,
      forcarMetodoViva: vivaAtivo,
      blocoTecnicoForcado: vivaBloco,
      texto: ultimaMsg,
      heuristicas: heuristicasAtivas,
      userEmbedding,
      skipSaudacao: true,
    });

    // Enxugar histórico: mantém só as últimas N mensagens (além do system)
    const MAX_MSG = 8;
    const mensagensEnxutas = messages.slice(-MAX_MSG);

    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...mensagensEnxutas.map((m) => ({ role: mapRoleForOpenAI(m.role), content: m.content })),
    ];

    const apiKey = process.env.OPENROUTER_API_KEY!;
    const inicioEco = now();

    const data = await callOpenRouterChat(
      {
        model: MODEL_MAIN,
        messages: chatMessages,
        temperature: 0.75,
        top_p: 0.9,
        presence_penalty: 0.2,
        frequency_penalty: 0.2,
        max_tokens: 1100,
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

    // 7) Bloco técnico (com response_format/fallbacks/regex)
    const bloco = await gerarBlocoTecnicoSeparado({
      mensagemUsuario: ultimaMsg,
      respostaIa: cleaned,
      apiKey,
    });

    // 8) Retorno
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

    // 9) Pós-processo (não bloqueante)
    fireAndForget(async () => {
      try {
        const cleanedSafe = typeof cleaned === "string" ? cleaned.trim() : "";
        const analiseResumoSafe =
          typeof bloco?.analise_resumo === "string" ? bloco.analise_resumo.trim() : "";

        let textoParaEmbedding = [cleanedSafe, analiseResumoSafe]
          .filter((s) => typeof s === "string" && s.trim().length > 0)
          .join("\n")
          .trim();
        if (!textoParaEmbedding || textoParaEmbedding.length < 3) {
          textoParaEmbedding = "PLACEHOLDER EMBEDDING";
        } else {
          textoParaEmbedding = textoParaEmbedding.slice(0, 8000);
        }

        const embeddingFinal = await embedTextoCompleto(textoParaEmbedding, "memoria ou referencia");

        const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });

        let referenciaAnteriorId: string | null = null;
        if (userId) {
          const { data: ultimaMemoria } = await supabase
            .from("memories")
            .select("id")
            .eq("usuario_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          referenciaAnteriorId = (ultimaMemoria as any)?.id ?? null;
        }

        const intensidadeNum =
          typeof bloco?.intensidade === "number" ? Math.round(bloco.intensidade) : 0;
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
    console.error("❌ getEcoResponse error:", err?.message || err);
    throw err;
  }
}
