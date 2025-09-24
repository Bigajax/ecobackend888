// server/services/promptContext/ContextBuilder.ts
import path from "path";
import { get_encoding } from "@dqbd/tiktoken";
import { Budgeter } from "./Budgeter";
import { ModuleStore } from "./ModuleStore";
import {
  buildOverhead,
  construirNarrativaMemorias,
  construirStateSummary,
  loadStaticGuards,
  renderDerivados,
} from "./Signals";
import {
  selecionarModulosBase,
  derivarNivel,
  derivarFlags,
  detectarSaudacaoBreve,
  isV2Matrix,
  resolveModulesForLevelV2,
  selecionarExtras,
} from "./Selector";
import { MAX_PROMPT_TOKENS, NIVEL1_BUDGET, MARGIN_TOKENS } from "../../utils/config";

// 🔽 importa a matriz com fallback p/ qualquer formato de export
import * as Matriz from "../../controllers/matrizPromptBase";

const ENC = get_encoding("cl100k_base");

function uniqPreservingOrder(arr: (string | undefined | null)[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const s = (v ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Prioridade unificada a ser passada ao Budgeter.
 * - Em V2: todos os módulos das camadas (core/emotional/advanced) VÊM PRIMEIRO,
 *   seguidos de limites.prioridade.
 * - Em legado: apenas limites.prioridade (quando houver).
 */
function buildUnifiedPriority(matriz: any): string[] | undefined {
  const limites: string[] = (matriz?.limites?.prioridade ?? []) as string[];

  if (isV2Matrix(matriz)) {
    const baseLayers: string[] = uniqPreservingOrder([
      ...(matriz.baseModules?.core ?? []),
      ...(matriz.baseModules?.emotional ?? []),
      ...(matriz.baseModules?.advanced ?? []),
    ]);

    const merged = uniqPreservingOrder([...baseLayers, ...limites]);
    return merged.length ? merged : undefined;
  }

  const legacy = uniqPreservingOrder(limites);
  return legacy.length ? legacy : undefined;
}

export class ContextBuilder {
  private budgeter = new Budgeter();

  async build(input: any) {
    const assetsDir = path.join(process.cwd(), "assets");
    // Pastas alinhadas
    const coreDir        = path.join(assetsDir, "modulos_core");
    const extrasDir      = path.join(assetsDir, "modulos_extras");
    const modCogDir      = path.join(assetsDir, "modulos_cognitivos");
    const modFilosDir    = path.join(assetsDir, "modulos_filosoficos");
    const modEstoicosDir = path.join(modFilosDir, "estoicos");
    const modEmocDir     = path.join(assetsDir, "modulos_emocionais");

    // ordem: core → extras → opcionais
    ModuleStore.I.configure([coreDir, extrasDir, modEmocDir, modEstoicosDir, modFilosDir, modCogDir]);

    // guards estáticos no core
    const { criterios, memoriaInstrucoes } = await loadStaticGuards(coreDir);

    const entrada = (input.texto ?? "").trim();
    const saudacaoBreve = detectarSaudacaoBreve(entrada);

    let contexto = "";
    if (saudacaoBreve) {
      contexto += `\n🔎 Detecção: saudação breve. Evite perguntas de abertura; acolha sem repetir a saudação.`;
    }

    const nivel = derivarNivel(entrada, saudacaoBreve);
    const desc = nivel === 1 ? "superficial" : nivel === 2 ? "reflexiva" : "profunda";
    contexto += `\n📶 Abertura emocional sugerida (heurística): ${desc}`;

    if (input.perfil) contexto += `\n\n${construirStateSummary(input.perfil, nivel)}`;
    if (input.derivados) contexto += renderDerivados(input.derivados, input.aberturaHibrida);

    // ===== memórias =====
    let memsUsadas: any[] = input.mems ?? [];
    if (input.forcarMetodoViva && input.blocoTecnicoForcado) {
      memsUsadas = [
        {
          resumo_eco: input.blocoTecnicoForcado.analise_resumo ?? entrada ?? "",
          intensidade: Number(input.blocoTecnicoForcado.intensidade ?? 0),
          emocao_principal: input.blocoTecnicoForcado.emocao_principal ?? "",
          tags: input.blocoTecnicoForcado.tags ?? [],
        },
      ];
    } else if (nivel === 1) {
      memsUsadas = [];
    }
    if (entrada && input.perfil && nivel > 1) {
      memsUsadas = [
        ...(memsUsadas || []),
        {
          resumo_eco: entrada,
          tags: input.perfil.temas_recorrentes ? Object.keys(input.perfil.temas_recorrentes) : [],
          intensidade: 0,
          emocao_principal: Object.keys(input.perfil.emocoes_frequentes || {})[0] || "",
        },
      ];
    }

    const intensidadeContexto = Math.max(0, ...(memsUsadas ?? []).map((m: any) => m.intensidade ?? 0));
    if (memsUsadas?.length && nivel > 1) {
      contexto += `\n\n${construirNarrativaMemorias(memsUsadas)}`;
    }

    // ===== matriz =====
    const matriz =
      (Matriz as any).matrizPromptBaseV2 ??
      (Matriz as any).matrizPromptBase ??
      (Matriz as any).MatrizPromptBase ??
      (Matriz as any).default;

    const flags = derivarFlags(entrada);
    const baseSel = selecionarModulosBase({ nivel, intensidade: intensidadeContexto, matriz, flags });

    // extras (rankeados)
    const extras = selecionarExtras({
      userId: input.userId,
      entrada,
      nivel,
      intensidade: intensidadeContexto,
      memsUsadas,
      heuristicaAtiva: undefined,
      heuristicasEmbedding: input.heuristicas,
    });

    // ===== contexto / overhead =====
    const contextoMin = contexto.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    const enc = ENC;
    const tokensContexto = enc.encode(contextoMin).length;

    const antiSaudacaoGuard = `
NÃO inicie a resposta com fórmulas como:
- "como você chega", "como você está chegando", "como chega aqui hoje", "como você chega hoje".
Se a mensagem do usuário for apenas uma saudação breve, não repita a saudação, não faça perguntas fenomenológicas de abertura; apenas acolha de forma simples quando apropriado.`.trim();

    const permitirPerguntaViva =
      nivel >= 2 && !saudacaoBreve && (flags.curiosidade === true || intensidadeContexto >= 5);

    const responsePlan = {
      allow_live_question: permitirPerguntaViva,
      live_question: permitirPerguntaViva
        ? {
            text: flags.curiosidade
              ? "O que fica mais vivo em você quando olha para isso agora — sem precisar explicar?"
              : intensidadeContexto >= 6
              ? "Se couber, o que seu corpo te conta sobre isso neste instante (uma palavra ou imagem)?"
              : "Se fizer sentido, qual seria um próximo passo gentil a partir daqui?",
            max_count: 1,
          }
        : null,
      allow_micro_practice: false,
      micro_practice: null as any,
      guardrails: { no_new_topics_on_closure: true, max_new_prompts: 1 },
    };

    const followPlanGuard = `- Siga o RESPONSE_PLAN: no máximo 1 pergunta viva (se allow_live_question=true) e no máximo 1 micro-prática (se allow_micro_practice=true). Slots são opcionais.`;

    const instrucoesFinais = `
⚠️ INSTRUÇÃO AO MODELO:
- Use memórias/contexto como suporte, não como script.
- Ajuste a profundidade e o tom conforme o nível de abertura (superficial, reflexiva, profunda).
- Respeite o ritmo e a autonomia do usuário.
- Evite soluções prontas e interpretações rígidas.
- Use a “Estrutura Padrão de Resposta” como planejamento interno (6 partes), mas NÃO exiba títulos/numeração.
- ${antiSaudacaoGuard}
- ${followPlanGuard}`.trim();

    const overhead = buildOverhead({
      criterios,
      memoriaInstrucoes,
      responsePlanJson: JSON.stringify(responsePlan),
      instrucoesFinais,
      antiSaudacaoGuard,
    });
    const overheadTokens = enc.encode(overhead).length;

    const budgetRestante = Math.max(
      1000,
      MAX_PROMPT_TOKENS - tokensContexto - overheadTokens - MARGIN_TOKENS
    );

    // ===== NV1 curto =====
    if (nivel === 1) {
      const nomesNv1 = isV2Matrix(matriz)
        ? resolveModulesForLevelV2(1 as any, matriz)
        : [...(matriz.alwaysInclude ?? [])];

      const stitched = await this.budgeter.stitch(nomesNv1, {
        budgetTokens: Math.min(budgetRestante, NIVEL1_BUDGET),
        // prioridade não é crítica para NV1, mas já podemos respeitar a unificada
        priority: buildUnifiedPriority(matriz),
      });

      const instrucoesNv1 = `
⚠️ INSTRUÇÃO:
- Responda breve (≤ 3 linhas), sem perguntas exploratórias.
- Acolha e respeite silêncio. Não usar memórias neste nível.
- Use a Estrutura Padrão de Resposta como planejamento interno, mas NÃO exiba títulos/numeração.
- ${antiSaudacaoGuard}`.trim();

      const prompt = [contextoMin, stitched.text, instrucoesNv1, overhead]
        .filter(Boolean)
        .join("\n\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const total = enc.encode(prompt).length;
      return {
        prompt,
        meta: {
          nivel,
          tokens: { contexto: tokensContexto, overhead: overheadTokens, total, budgetRestante },
          modulos: { incluidos: stitched.used, cortados: stitched.cut },
          flags: { curiosidade: flags.curiosidade, pedido_pratico: flags.pedido_pratico, saudacaoBreve },
        },
      };
    }

    // ===== NV2 / NV3 =====
    const nomesPre = uniqPreservingOrder([...baseSel.selecionados, ...extras]);

    // ✅ prioridade unificada (V2: baseModules primeiro, depois limites.prioridade)
    const prioridade = buildUnifiedPriority(matriz);

    const stitched = await this.budgeter.stitch(nomesPre, {
      budgetTokens: budgetRestante,
      priority: prioridade,
    });

    const prompt = [contextoMin, stitched.text.trim(), overhead]
      .filter(Boolean)
      .join("\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const total = enc.encode(prompt).length;
    return {
      prompt,
      meta: {
        nivel,
        tokens: { contexto: tokensContexto, overhead: overheadTokens, total, budgetRestante },
        modulos: { incluidos: stitched.used, cortados: stitched.cut },
        flags: { curiosidade: flags.curiosidade, pedido_pratico: flags.pedido_pratico, saudacaoBreve },
      },
    };
  }
}
