// IMPORTS
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import { updateEmotionalProfile } from "./updateEmotionalProfile";
import { montarContextoEco } from "../controllers/promptController";
import { embedTextoCompleto } from "./embeddingService";
import { respostaSaudacaoAutomatica } from "../utils/respostaSaudacaoAutomatica";
import { buscarHeuristicasSemelhantes } from "./heuristicaService";
import { salvarReferenciaTemporaria } from "./referenciasService";

// UTILS
const mapRoleForOpenAI = (role: string): "user" | "assistant" | "system" => {
  if (role === "model") return "assistant";
  if (role === "system") return "system";
  return "user";
};

const limparResposta = (t: string) =>
  t.replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/###.*?###/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const formatarTextoEco = (t: string) =>
  t.replace(/\n{3,}/g, "\n\n")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/(?<!\n)\n(?!\n)/g, "\n\n")
    .replace(/^-\s+/gm, "— ")
    .replace(/^\s+/gm, "")
    .trim();

// LOG HEURÍSTICAS
async function logHeuristicasEmbedding(texto: string) {
  try {
    const heuristicas = await buscarHeuristicasSemelhantes(texto);
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
    console.warn("⚠️ Erro ao logar heurísticas:", err.message || err);
  }
}

// BLOCO TÉCNICO
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
    const prompt = `
Extraia e retorne em JSON os dados abaixo com base na resposta a seguir.

Resposta da IA:
"""
${respostaIa}
"""

Mensagem original do usuário:
"${mensagemUsuario}"

Retorne neste formato:
{
  "emocao_principal": "",
  "intensidade": 0,
  "tags": [],
  "dominio_vida": "",
  "padrao_comportamental": "",
  "nivel_abertura": "baixo" | "médio" | "alto",
  "analise_resumo": "",
  "categoria": "emocional"
}`;

    const { data } = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const jsonText = data?.choices?.[0]?.message?.content ?? "";
    const match = jsonText.match(/\{[\s\S]*\}/);
    const json = match ? JSON.parse(match[0]) : null;

    console.log("🧠 Bloco técnico extraído:", json);
    return json;
  } catch (err: any) {
    console.warn("⚠️ Erro ao gerar bloco técnico:", err.message || err);
    return null;
  }
}

// FUNÇÃO PRINCIPAL
export async function getEcoResponse({
  messages,
  userId,
  userName,
  accessToken,
  mems = [],
}: {
  messages: { id?: string; role: string; content: string }[];
  userId?: string;
  userName?: string;
  accessToken: string;
  mems?: any[];
}): Promise<{
  message: string;
  intensidade?: number;
  resumo?: string;
  emocao?: string;
  tags?: string[];
}> {
  try {
    if (!Array.isArray(messages) || messages.length === 0)
      throw new Error('Parâmetro "messages" vazio ou inválido.');
    if (!accessToken) throw new Error("Token (accessToken) ausente.");

    const respostaInicial = respostaSaudacaoAutomatica({ messages, userName });
    if (respostaInicial) return { message: respostaInicial };

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada.");

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );

    const ultimaMsg = messages.at(-1)?.content || "";

    await logHeuristicasEmbedding(ultimaMsg);

    const systemPrompt = await montarContextoEco({
      userId,
      ultimaMsg,
      perfil: null,
      mems,
    });

    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: mapRoleForOpenAI(m.role),
        content: m.content,
      })),
    ];

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

    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    if (!raw) throw new Error("Resposta vazia da IA.");

    const cleaned = formatarTextoEco(limparResposta(raw));
    const bloco = await gerarBlocoTecnicoSeparado({
      mensagemUsuario: ultimaMsg,
      respostaIa: cleaned,
      apiKey,
    });

    let intensidade: number | undefined;
    let emocao: string = "indefinida";
    let tags: string[] = [];
    let resumo: string | undefined = cleaned;

    if (bloco) {
      intensidade = Number(bloco.intensidade);
      emocao = bloco.emocao_principal || "indefinida";
      tags = Array.isArray(bloco.tags) ? bloco.tags : [];

      const nivelNumerico =
        typeof bloco.nivel_abertura === "number"
          ? bloco.nivel_abertura
          : bloco.nivel_abertura === "baixo"
          ? 1
          : bloco.nivel_abertura === "médio"
          ? 2
          : bloco.nivel_abertura === "alto"
          ? 3
          : null;

      const textoParaEmbedding = [cleaned, bloco.analise_resumo ?? ""].join("\n");
      const embeddingFinal = await embedTextoCompleto(textoParaEmbedding, "memoria ou referencia");

      const payload = {
        usuario_id: userId!,
        mensagem_id: messages.at(-1)?.id ?? null,
        resumo_eco: bloco.analise_resumo ?? cleaned,
        emocao_principal: emocao,
        intensidade,
        contexto: ultimaMsg,
        dominio_vida: bloco.dominio_vida ?? null,
        padrao_comportamental: bloco.padrao_comportamental ?? null,
        nivel_abertura: nivelNumerico,
        analise_resumo: bloco.analise_resumo ?? null,
        categoria: bloco.categoria ?? "emocional",
        tags,
        embedding: embeddingFinal,
      };

      if (userId && intensidade >= 7) {
        const { error } = await supabase.from("memories").insert([
          {
            ...payload,
            salvar_memoria: true,
            data_registro: new Date().toISOString(),
          },
        ]);

        if (error) {
          console.warn("⚠️ Erro ao salvar memória:", error.message);
        } else {
          console.log(`✅ Memória salva com sucesso para o usuário ${userId}.`);
          try {
            console.log(`🔄 Atualizando perfil emocional de ${userId}...`);
            await updateEmotionalProfile(userId);
            console.log(`🧠 Perfil emocional atualizado com sucesso.`);
          } catch (err: any) {
            console.error("❌ Erro ao atualizar perfil emocional:", err.message || err);
          }
        }
      } else if (userId && intensidade < 7) {
        await salvarReferenciaTemporaria(payload);
        console.log(`📎 Referência emocional leve registrada para ${userId}`);
      }
    }

    return { message: cleaned, intensidade, resumo, emocao, tags };
  } catch (err: any) {
    console.error("❌ getEcoResponse error:", err.message || err);
    throw err;
  }
}
