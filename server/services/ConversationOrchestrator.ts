import { ensureEnvs, formatarTextoEco, limparResposta, now, sleep, mapRoleForOpenAI } from "../utils/text";
import { supabaseWithBearer } from "../adapters/SupabaseAdapter";
import { PROMPT_CACHE } from "../services/CacheService";
import { getEmbeddingCached } from "../adapters/EmbeddingAdapter";
import { gerarBlocoTecnicoComCache } from "../core/EmotionalAnalyzer";
import { fastGreet, microReflexoLocal, chatCompletion } from "../core/ResponseGenerator";
import { GreetGuard } from "../policies/GreetGuard";
import { getDerivados, insightAbertura } from "../services/derivadosService"; // seu arquivo
import { buscarHeuristicasSemelhantes } from "../services/heuristicaService"; // seu arquivo
import { montarContextoEco } from "../controllers/promptController"; // seu arquivo
import { respostaSaudacaoAutomatica } from "../utils/respostaSaudacaoAutomatica"; // seu arquivo
import { saveMemoryOrReference } from "../services/MemoryService";
import {
  trackMensagemEnviada,
  trackEcoDemorou,
} from "../analytics/events/mixpanelEvents"; // seu arquivo

import type { GetEcoParams, GetEcoResult, ParalelasResult } from "../utils/types";

const FAST_GREET_RE = /^(?:ol[áa]|oi|oie|eai|opa|hey|hi|hello|bom dia|boa tarde|boa noite)[!.\s…]*$/i;

function hasSubstance(msg: string) {
  const t = (msg || "").trim().toLowerCase();
  if (t.length >= 30) return true;
  return /cansad|triste|ansios|irritad|preocupad|estou|sinto|tive|aconteceu|preciso|quero|dor|insônia|medo/.test(t);
}

async function operacoesParalelas(ultimaMsg: string, userId?: string): Promise<ParalelasResult> {
  let userEmbedding: number[] = [];
  if (ultimaMsg.trim().length > 0) userEmbedding = await getEmbeddingCached(ultimaMsg, "entrada_usuario");
  let heuristicas: any[] = [];
  if (userEmbedding.length > 0) {
    try { heuristicas = await buscarHeuristicasSemelhantes({ usuarioId: userId ?? null, userEmbedding, matchCount: 5 }); }
    catch { heuristicas = []; }
  }
  return { heuristicas, userEmbedding };
}
async function operacoesParalelasComOrcamento(ultimaMsg: string, userId?: string): Promise<ParalelasResult> {
  const short = ultimaMsg.trim().length < 80 || ultimaMsg.trim().split(/\s+/).length < 12;
  if (short) return { heuristicas: [], userEmbedding: [] };
  let result: ParalelasResult = { heuristicas: [], userEmbedding: [] };
  await Promise.race([ (async()=>{ result = await operacoesParalelas(ultimaMsg, userId); })(), (async()=>{ await sleep(250); })(), ]);
  return result;
}

async function montarContextoOtimizado(params: any) {
  const cacheKey = `${params.userId}_${params.nivel}_${params.intensidade}`;
  if (PROMPT_CACHE.has(cacheKey)) return PROMPT_CACHE.get(cacheKey)! + `\n\nMensagem atual: ${params.texto}`;
  const contexto = await montarContextoEco(params);
  if ((params.nivel ?? 2) <= 2) PROMPT_CACHE.set(cacheKey, contexto);
  return contexto;
}

function heuristicaPreViva(m: string){ const texto=(m||"").toLowerCase(); const len=texto.length; const gat=[/ang[uú]st/i,/p[aâ]nico/i,/desesper/i,/crise/i,/sofr/i,/n[aã]o aguento/i,/vontade de sumir/i,/explod/i,/impulsiv/i,/medo/i,/ansiedad/i,/culpa/i,/triste/i]; return gat.some(r=>r.test(texto))||len>=180; }

export async function getEcoResponse({ messages, userId, userName, accessToken, mems = [], forcarMetodoViva = false, blocoTecnicoForcado = null, clientHour, }: GetEcoParams): Promise<GetEcoResult> {
  const t0 = now();
  ensureEnvs();
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('Parâmetro "messages" vazio ou inválido.');
  const ultimaMsg = messages.at(-1)?.content || "";

  // 1) fast-greet (puro + sem substância + cooldown)
  const isPureGreeting = FAST_GREET_RE.test(ultimaMsg.trim());
  if (!hasSubstance(ultimaMsg) && isPureGreeting && GreetGuard.can(userId)) {
    GreetGuard.mark(userId);
    const auto = respostaSaudacaoAutomatica({ messages, userName, clientHour } as any);
    if (auto) return { message: auto.text };
    // caso queira usar modelo mini:
    try { return { message: await fastGreet(ultimaMsg.trim()) }; } catch {}
  }

  // 2) supabase
  const supabase = supabaseWithBearer(accessToken);

  // 3) paralelas orçadas
  const { heuristicas, userEmbedding } = await operacoesParalelasComOrcamento(ultimaMsg, userId);

  // 4) viva + derivados
  const vivaAtivo = forcarMetodoViva || heuristicaPreViva(ultimaMsg);
  const derivados = userId ? await Promise.race([
    (async()=>({ ok:true, d: await (async()=>{
      // carrega derivados do usuário
      const { data: stats } = await supabase.from("user_theme_stats").select("tema,freq_30d,int_media_30d").eq("user_id", userId).order("freq_30d",{ascending:false}).limit(5);
      const { data: marcos } = await supabase.from("user_temporal_milestones").select("tema,resumo_evolucao,marco_at").eq("user_id", userId).order("marco_at",{ascending:false}).limit(3);
      const { data: efeitos } = await supabase.from("interaction_effects").select("efeito,score,created_at").eq("user_id", userId).order("created_at",{ascending:false}).limit(30);
      const arr = (efeitos||[]).map((r:any)=>({ x: { efeito: (r.efeito as any) ?? "neutro" } }));
      const scores = (efeitos||[]).map((r:any)=>Number(r?.score)).filter((v:number)=>Number.isFinite(v));
      const media = scores.length? scores.reduce((a:number,b:number)=>a+b,0)/scores.length : 0;
      return getDerivados((stats||[]) as any,(marcos||[]) as any, arr as any, media);
    })() }))(),
    (async()=>{ await sleep(200); return { ok:false, d:null as any }; })(),
  ]).then((r:any)=> r.ok ? r.d : null) : null;

  const aberturaHibrida = derivados ? (()=>{ try { return insightAbertura(derivados); } catch { return null; } })() : null;

  // 5) system prompt
  const systemPrompt = await montarContextoOtimizado({
    userId, userName, perfil: null, mems,
    forcarMetodoViva: vivaAtivo, blocoTecnicoForcado,
    texto: ultimaMsg, heuristicas, userEmbedding, skipSaudacao: true,
    derivados, aberturaHibrida,
  });

  // 6) histórico enxuto + micro-reflexo local
  const micro = microReflexoLocal(ultimaMsg);
  if (micro) return { message: micro };

  const msgs = [{ role: "system", content: systemPrompt }, ...messages.slice(-5).map((m)=>({ role: mapRoleForOpenAI(m.role), content: m.content }))];

  // 7) chamada ao modelo (hedge interno)
  const maxTokens = ultimaMsg.length < 140 ? 420 : ultimaMsg.length < 280 ? 560 : 700;
  const inicioEco = now();
  const data = await chatCompletion(msgs, maxTokens);
  const duracaoEco = now() - inicioEco;
  if (duracaoEco > 3000) trackEcoDemorou({ userId, duracaoMs: duracaoEco, ultimaMsg });

  const raw: string = data?.choices?.[0]?.message?.content ?? "";
  const cleaned = formatarTextoEco(limparResposta(raw || "Desculpa, não consegui responder agora. Pode tentar de novo?"));

  // 8) bloco técnico
  const bloco = await gerarBlocoTecnicoComCache(ultimaMsg, cleaned);

  // 9) retorno + pós-processo não-bloqueante (mem/ref)
  const response: GetEcoResult = { message: cleaned };
  if (bloco && typeof bloco.intensidade === "number") {
    response.intensidade = bloco.intensidade;
    response.resumo = typeof bloco?.analise_resumo === "string" && bloco.analise_resumo.trim().length ? bloco.analise_resumo.trim() : cleaned;
    response.emocao = bloco.emocao_principal || "indefinida";
    response.tags = Array.isArray(bloco.tags) ? bloco.tags : [];
    response.categoria = bloco.categoria ?? null;
  } else if (bloco) {
    response.categoria = bloco.categoria ?? null;
  }

  // métrica simples
  trackMensagemEnviada({ userId, tempoRespostaMs: duracaoEco, tokensUsados: data?.usage?.total_tokens || null, modelo: data?.model });

  // pós-processo
  (async () => {
    try {
      if (userId) {
        await saveMemoryOrReference({
          supabase,
          userId,
          lastMessageId: messages.at(-1)?.id ?? null,
          cleaned,
          bloco,
          ultimaMsg,
        });
      }
    } catch (e) {
      console.warn("⚠️ Pós-processo falhou:", (e as Error).message);
    }
  })();

  return response;
}

// export antigo (compat)
export { getEcoResponse as getEcoResponseOtimizado };
