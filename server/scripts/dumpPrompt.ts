/**
 * dumpPrompt.ts — Inspeciona o system prompt REALMENTE montado para uma mensagem.
 *
 * Por que existe: a montagem do prompt da Eco passa por várias camadas (promptIdentity.ts,
 * stitcher, manifest/knapsack/bandit, contextSectionsBuilder). Vários módulos .txt parecem
 * relevantes mas NÃO entram no prompt final. Esta ferramenta mostra o que de fato é enviado
 * ao modelo e quais blocos-fonte estão presentes — para não editar módulos mortos.
 *
 * Uso:
 *   npm run prompt:dump -- "estou triste de novo essa semana"
 *   npm run prompt:dump -- "preciso organizar minhas tarefas" --nivel 1
 *   npm run prompt:dump -- "não aguento mais esse vazio" --nivel 3 --intensidade 8 --vuln
 *   npm run prompt:dump -- "oi" --guest --summary        (só a tabela de presença)
 *   npm run prompt:dump -- "triste" --no-mem             (sem injetar memória de exemplo)
 */
import process from "node:process";

import montarContextoEco from "../services/promptContext/ContextBuilder";
import { computeEcoDecision } from "../services/conversation/ecoDecisionHub";
import { SOURCE_MARKERS } from "../services/promptContext/promptMarkers";

interface CliOptions {
  texto: string;
  nivel?: 1 | 2 | 3;
  intensidade?: number;
  vuln: boolean;
  mem: boolean;
  guest: boolean;
  summaryOnly: boolean;
  userId: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    texto: "",
    vuln: false,
    mem: true,
    guest: false,
    summaryOnly: false,
    userId: "11111111-1111-4111-8111-111111111111",
  };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--nivel") opts.nivel = Number(argv[++i]) as 1 | 2 | 3;
    else if (a === "--intensidade") opts.intensidade = Number(argv[++i]);
    else if (a === "--vuln") opts.vuln = true;
    else if (a === "--no-mem") opts.mem = false;
    else if (a === "--mem") opts.mem = true;
    else if (a === "--guest") opts.guest = true;
    else if (a === "--summary") opts.summaryOnly = true;
    else if (a === "--user") opts.userId = String(argv[++i]);
    else positionals.push(a);
  }
  opts.texto = positionals.join(" ").trim();
  return opts;
}

// Marcadores movidos para ../services/promptContext/promptMarkers.ts (compartilhados com os
// golden tests de contrato).

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.texto) {
    console.error('Uso: npm run prompt:dump -- "sua mensagem" [--nivel 1|2|3] [--intensidade N] [--vuln] [--guest] [--no-mem] [--summary]');
    process.exitCode = 1;
    return;
  }

  // Por padrão NÃO forçamos a decisão: deixamos o pipeline classificar a partir do texto,
  // refletindo fielmente o fluxo de produção. Só construímos/forçamos um `decision` quando
  // o usuário passa --nivel/--intensidade/--vuln (útil para inspecionar um nível específico,
  // mas ciente de que forçar pode divergir da seleção natural de módulos).
  const forcando =
    opts.nivel !== undefined || opts.intensidade !== undefined || opts.vuln;
  let decision = forcando ? computeEcoDecision(opts.texto) : undefined;
  if (decision) {
    if (typeof opts.intensidade === "number" && Number.isFinite(opts.intensidade)) {
      decision.intensity = opts.intensidade;
    }
    if (opts.vuln) decision.isVulnerable = true;
    if (opts.nivel === 1 || opts.nivel === 2 || opts.nivel === 3) {
      decision.openness = opts.nivel;
    }
  }

  const memoriasSemelhantes = opts.mem
    ? [
        {
          resumo_eco: "Perdi meu emprego e me senti perdido sobre o que fazer.",
          similarity: 0.83,
          tags: ["trabalho", "perda"],
          created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
          dominio_vida: "trabalho",
        },
      ]
    : [];

  const res = await montarContextoEco({
    userId: opts.guest ? undefined : opts.userId,
    guestId: opts.guest ? "guest_11111111-1111-4111-8111-111111111111" : null,
    userName: "Rafael",
    texto: opts.texto,
    mems: [],
    memoriasSemelhantes,
    decision,
  } as any);

  const prompt = res.montarMensagemAtual(opts.texto);
  // Para exibição apenas (o pipeline usa a mesma função internamente quando não forçamos).
  const display = decision ?? computeEcoDecision(opts.texto);

  console.log("============================================================");
  console.log("DUMP DO SYSTEM PROMPT DA ECO");
  console.log("============================================================");
  console.log(`mensagem      : ${opts.texto}`);
  console.log(`decisão       : ${forcando ? "FORÇADA (pode divergir da seleção natural)" : "natural (derivada do texto)"}`);
  console.log(`nivel/abertura: ${display.openness}`);
  console.log(`intensidade   : ${display.intensity}`);
  console.log(`vulnerável    : ${display.isVulnerable}`);
  console.log(`guest         : ${opts.guest}`);
  console.log(`memória inj.  : ${opts.mem ? "sim (1 exemplo)" : "não"}`);
  console.log(`tamanho prompt: ${prompt.length} chars (~${Math.round(prompt.length / 4)} tokens)`);

  console.log("\n--- BLOCOS-FONTE PRESENTES NO PROMPT ---");
  for (const { source, needle } of SOURCE_MARKERS) {
    const idx = prompt.indexOf(needle);
    console.log(`  ${idx !== -1 ? "PRESENTE" : "ausente "}  ${source}${idx !== -1 ? `  @${idx}` : ""}`);
  }

  if (!opts.summaryOnly) {
    console.log("\n============================================================");
    console.log("PROMPT MONTADO (completo)");
    console.log("============================================================\n");
    console.log(prompt);
  } else {
    console.log("\n(use sem --summary para imprimir o prompt completo)");
  }
}

main().catch((err) => {
  console.error("[dumpPrompt] erro:", err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
