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

export class ContextBuilder {
  private budgeter = new Budgeter();

  async build(input: any) {
    const assetsDir       = path.join(process.cwd(), "assets");
    // NOVO: pastas alinhadas à tua refatoração
    const coreDir         = path.join(assetsDir, "modulos_core");
    const extrasDir       = path.join(assetsDir, "modulos_extras");
    const modCogDir       = path.join(assetsDir, "modulos_cognitivos");
    const modFilosDir     = path.join(assetsDir, "modulos_filosoficos");
    const modEstoicosDir  = path.join(modFilosDir, "estoicos");
    const modEmocDir      = path.join(assetsDir, "modulos_emocionais");

    // ordem: core → extras → opcionais
    ModuleStore.I.configure([coreDir, extrasDir, modEmocDir, modEstoicosDir, modFilosDir, modCogDir]);

    // guards estáticos agora vivem no core
    const { criterios, memoriaInstrucoes } = await loadStaticGuards(coreDir);

    const entrada = (input.texto ?? "").trim();
    const saudacaoBreve = detectarSaudacaoBreve(entrada);

    let contexto = "";
    if (saudacaoBreve) {
      contexto += `\n🔎 Detecção: saudação breve. Evite perguntas de abertura; acolha sem repetir a saudação.`;
    }

    const nivel = derivarNivel(entrada, saudacaoBreve);
    const desc  = nivel === 1 ? "superficial" : nivel === 2 ? "reflexiva" : "profunda";
    contexto += `\n📶 Abertura emocional sugerida (heurística): ${desc}`;

    if (input.perfil) contexto += `\n\n${construirStateSummary(input.perfil, nivel)}`;
    if (input.derivados) contexto += renderDerivados(input.derivados, input.aberturaHibrida);

    // ===== memórias =====
    let memsUsadas: any[] = input.mems ?? [];
    if (input.forcarMetodoViva && input.blocoTecnicoForcado) {
      memsUsadas = [{
        resumo_eco: input.blocoTecnicoForcado.analise_resumo ?? entrada ?? "",
        intensidade: Number(input.blocoTecnicoForcado.intensidade ?? 0),
        emocao_principal: input.blocoTecnicoForcado.emocao_principal ?? "",
        tags: input.blocoTecnicoForcado.tags ?? [],
      }];
    } else if (nivel === 1) {
      memsUsadas = [];
    }
    if (entrada && input.perfil && nivel > 1) {
      memsUsadas = [...(memsUsadas||[]), {
        resumo_eco: entrada,
        tags: input.perfil.temas_recorrentes ? Object.keys(input.perfil.temas_recorrentes) : [],
        intensidade: 0,
        emocao_principal: Object.keys(input.perfil.emocoes_frequentes || {})[0] || "",
      }];
    }

    const intensidadeContexto = Math.max(0, ...(memsUsadas ?? []).map((m:any) => m.intensidade ?? 0));
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

    // extras (rankeados pelo teu seletor; inclui opcionais se você plugou)
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
              : (intensidadeContexto >= 6
                  ? "Se couber, o que seu corpo te conta sobre isso neste instante (uma palavra ou imagem)?"
                  : "Se fizer sentido, qual seria um próximo passo gentil a partir daqui?"),
            max_count: 1,
          }
        : null,
      allow_micro_practice: false,
      micro_practice: null as any,
      guardrails: { no_new_topics_on_closure: true, max_new_prompts: 1 },
    };

    const followPlanGuard =
      `- Siga o RESPONSE_PLAN: no máximo 1 pergunta viva (se allow_live_question=true) e no máximo 1 micro-prática (se allow_micro_practice=true). Slots são opcionais.`;

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
        // legado: só alwaysInclude (sem ECO_ORQUESTRA_NIVEL1.txt, que foi removido)
        : [ ...(matriz.alwaysInclude ?? []) ];

      const stitched = await this.budgeter.stitch(nomesNv1, {
        budgetTokens: Math.min(budgetRestante, NIVEL1_BUDGET),
      });

      const instrucoesNv1 = `
⚠️ INSTRUÇÃO:
- Responda breve (≤ 3 linhas), sem perguntas exploratórias.
- Acolha e respeite silêncio. Não usar memórias neste nível.
- Use a Estrutura Padrão de Resposta como planejamento interno, mas NÃO exiba títulos/numeração.
- ${antiSaudacaoGuard}`.trim();

      const prompt = [
        contextoMin,
        stitched.text,
        instrucoesNv1,
        overhead,
      ].filter(Boolean).join("\n\n").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();

      const total = enc.encode(prompt).length;
      return {
        prompt,
        meta: {
          nivel,
          tokens: { contexto: tokensContexto, overhead: overheadTokens, total, budgetRestante },
          modulos: { incluidos: stitched.used, cortados: stitched.cut },
          flags: { curiosidade: flags.curiosidade, pedido_pratico: flags.pedido_pratico, saudacaoBreve }
        }
      };
    }

    // ===== NV2 / NV3 =====
    const nomesPre = [...new Set([...baseSel.selecionados, ...extras])];

    // prioridade adaptada à Matriz V3 (sem ECO_ORQUESTRA_*)
    let prioridade: string[] | undefined = (matriz as any)?.limites?.prioridade;
    if (isV2Matrix(matriz)) {
      const pv2 = [
        ...(matriz.baseModules?.core ?? []),
        ...(matriz.baseModules?.emotional ?? []), // hoje vazio, mas mantido p/ compat
        ...(matriz.baseModules?.advanced ?? []),
      ];
      prioridade = [...new Set([ ...pv2, ...(prioridade ?? []) ])];
    }

    const stitched = await this.budgeter.stitch(nomesPre, {
      budgetTokens: budgetRestante,
      priority: prioridade,
    });

    const prompt = [ contextoMin, stitched.text.trim(), overhead ]
      .filter(Boolean).join("\n\n").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();

    const total = enc.encode(prompt).length;
    return {
      prompt,
      meta: {
        nivel,
        tokens: { contexto: tokensContexto, overhead: overheadTokens, total, budgetRestante },
        modulos: { incluidos: stitched.used, cortados: stitched.cut },
        flags: { curiosidade: flags.curiosidade, pedido_pratico: flags.pedido_pratico, saudacaoBreve }
      }
    };
  }
}
