// IMPORTS
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import { updateEmotionalProfile } from "./updateEmotionalProfile";
import { montarContextoEco } from "../controllers/promptController";
import { embedTextoCompleto } from "./embeddingService";
import { respostaSaudacaoAutomatica } from "../utils/respostaSaudacaoAutomatica";
import { buscarHeuristicasSemelhantes } from "./heuristicaService";
import { salvarReferenciaTemporaria } from "./referenciasService";
import mixpanel from '../lib/mixpanel';
import {
  trackMensagemEnviada,
  trackMemoriaRegistrada,
  trackReferenciaEmocional,
  trackPerguntaProfunda,
  trackEcoDemorou,
} from '../analytics/events/mixpanelEvents';

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

// fire-and-forget simples
function fireAndForget(fn: () => Promise<void>) {
  setImmediate(() => {
    fn().catch((err) => console.warn("⚠️ Pós-processo falhou:", err?.message || err));
  });
}

// ============================================================================
// LOG HEURÍSTICAS (mantido, mas chamado somente quando fizer sentido)
// ============================================================================
async function logHeuristicasEmbedding(texto: string, usuarioId?: string) {
  try {
    if (!texto || texto.trim().length < 6) {
      console.log("🔍 Heurística: texto curto — pulando");
      return;
    }
    const heuristicas = await buscarHeuristicasSemelhantes(texto, usuarioId || "");
    if (!heuristicas || heuristicas.length === 0) {
      console.log("🔍 Nenhuma heurística ativada por embedding.");
      return;
    }
    console.log("📊 Heurísticas ativadas por embedding:");
    heuristicas.forEach((h: any, i: number) => {
      const nome = h.nome || h.arquivo || `Heurística ${i + 1}`;
      const similaridade = h.similaridade?.toFixed(3) ?? "N/A";
      console.log(`• ${nome} (similaridade: ${similaridade})`);
    });
  } catch (err: any) {
    console.warn("⚠️ Erro ao logar heurísticas:", err?.message || err);
  }
}

// ============================================================================
// BLOCO TÉCNICO – extração (mantido), mas não usado para saudações
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
    // Gate simples: se usuário e resposta são curtos, não vale a pena
    const palavrasUser = mensagemUsuario.trim().split(/\s+/).length;
    const palavrasResp = respostaIa.trim().split(/\s+/).length;
    if (palavrasUser < 4 && palavrasResp < 20) {
      console.log("ℹ️ Bloco técnico: pulado por baixa relevância (texto curto)");
      return null;
    }

    const prompt = `
Extraia e retorne em JSON **somente os campos especificados** com base na resposta a seguir.

Resposta da IA:
"""
${respostaIa}
"""

Mensagem original do usuário:
"${mensagemUsuario}"

Retorne neste formato JSON puro:
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

⚠️ NÃO adicione mais nada além deste JSON. Não explique, não comente.`;

    const { data } = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const rawContent = data?.choices?.[0]?.message?.content ?? "";
    if (!rawContent) {
      console.warn("⚠️ Resposta vazia ao tentar extrair bloco técnico.");
      return null;
    }

    const match = rawContent.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn("⚠️ Nenhum JSON encontrado no bloco técnico.");
      return null;
    }

    const parsed = JSON.parse(match[0]);

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
    for (const key of permitido) {
      cleanJson[key] = parsed[key] ?? null;
    }

    console.log("🧠 Bloco técnico extraído e sanitizado:", cleanJson);
    return cleanJson;
  } catch (err: any) {
    console.warn("⚠️ Erro ao gerar bloco técnico:", err?.message || err);
    return null;
  }
}

// ============================================================================
// FUNÇÃO PRINCIPAL – com FAST-PATH, dedupe e pós-processo assíncrono
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
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Parâmetro "messages" vazio ou inválido.');
    }
    if (!accessToken) throw new Error("Token (accessToken) ausente.");

    // 1) FAST-PATH: saudações/despedidas → responde na hora, sem embed/DB/heurística
    const respostaInicial = respostaSaudacaoAutomatica({ messages, userName });
    if (respostaInicial) {
      console.log("[ECO] Fast-path saudação acionado em", Date.now() - t0, "ms");
      return { message: respostaInicial };
    }

    // 2) Setup do Supabase (usado no pós-processo também)
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );

    const ultimaMsg = messages.at(-1)?.content || "";

    // 3) Heurísticas (opcional): calcular uma vez aqui e **passar** para o prompt
    let heuristicasAtivas: any[] = [];
    if (!forcarMetodoViva && ultimaMsg.trim().length > 5) {
      heuristicasAtivas = await buscarHeuristicasSemelhantes(ultimaMsg, userId || "");
    }

    // 4) Montagem do prompt e chamada ao modelo
    const systemPrompt = await montarContextoEco({
      userId,
      userName,
      perfil: null,
      mems,
      forcarMetodoViva,
      blocoTecnicoForcado,
      texto: ultimaMsg,
      heuristicas: heuristicasAtivas,
      skipSaudacao: true, // saudação já resolvida aqui
    });

    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: mapRoleForOpenAI(m.role), content: m.content })),
    ];

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada.");

    const inicioEco = now();
    const { data } = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o",
        messages: chatMessages,
        temperature: 0.8,
        top_p: 0.95,
        presence_penalty: 0.3,
        frequency_penalty: 0.2,
        max_tokens: 1500,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:5173",
        },
      }
    );
    const duracaoEco = now() - inicioEco;
    if (duracaoEco > 3000) {
      trackEcoDemorou({ userId, duracaoMs: duracaoEco, ultimaMsg });
    }

    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    if (!raw) throw new Error("Resposta vazia da IA.");

    // Telemetria básica
    trackMensagemEnviada({
      userId,
      tempoRespostaMs: duracaoEco,
      tokensUsados: data?.usage?.total_tokens || null,
      modelo: data?.model || "desconhecido",
    });

    const cleaned = formatarTextoEco(limparResposta(raw));

    // 5) Extrair bloco técnico (sincrono, leve) – mas só se fizer sentido
    const bloco = blocoTecnicoForcado || (await gerarBlocoTecnicoSeparado({
      mensagemUsuario: ultimaMsg,
      respostaIa: cleaned,
      apiKey,
    }));

    // 6) Retorno imediato ao chamador
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

    // 7) Pós-processo NÃO bloqueante (embedding + salvar memória/referência + perfil)
    fireAndForget(async () => {
      try {
        // a) Monta texto para embedding da resposta (limitado)
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

        // b) Gera embedding da RESPOSTA (indexação)
        const embeddingFinal = await embedTextoCompleto(textoParaEmbedding, "memoria ou referencia");

        // c) Busca referência anterior (para encadear) – opcional
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
        );

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

        // d) Monta payload comum
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

        // e) Decide o que salvar
        if (userId && Number.isFinite(intensidadeNum)) {
          if (intensidadeNum >= 7) {
            const { error } = await supabase.from("memories").insert([
              {
                ...payload,
                salvar_memoria: true,
                created_at: new Date().toISOString(),
              },
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
            // intensidade 0 → não salva nada
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
