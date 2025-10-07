export type ModuleFragment = { name: string; text: string };

export function applyReductions(
  mods: ModuleFragment[],
  nivel: 1 | 2 | 3
): ModuleFragment[] {
  if (nivel === 1) return mods;
  return mods.map((mod) =>
    mod.name === "IDENTIDADE.txt"
      ? { ...mod, text: reduceIdentidade(mod.text) }
      : mod
  );
}

export function stitchModules(mods: ModuleFragment[], nivel: 1 | 2 | 3): string {
  return nivel === 1 ? stitchNV1(mods) : stitchNV(mods);
}

function stitchNV1(mods: ModuleFragment[]): string {
  const prio = ["NV1_CORE.txt", "IDENTIDADE_MINI.txt", "ANTISALDO_MIN.txt"];
  const sorted = [
    ...mods
      .filter((m) => prio.includes(m.name))
      .sort((a, b) => prio.indexOf(a.name) - prio.indexOf(b.name)),
    ...mods.filter((m) => !prio.includes(m.name)),
  ];
  const joined = sorted
    .map((m) => {
      const title = titleFromName(m.name);
      return `\n${title}\n\n${m.text}`.trim();
    })
    .join("\n\n");
  return dedupeBySection(joined);
}

function stitchNV(mods: ModuleFragment[]): string {
  const prio = [
    "IDENTIDADE.txt",
    "MODULACAO_TOM_REGISTRO.txt",
    "ENCERRAMENTO_SENSIVEL.txt",
  ];
  const sorted = [
    ...mods
      .filter((m) => prio.includes(m.name))
      .sort((a, b) => prio.indexOf(a.name) - prio.indexOf(b.name)),
    ...mods.filter((m) => !prio.includes(m.name)),
  ];
  const joined = sorted
    .map((m) => {
      const title = titleFromName(m.name);
      return `\n${title}\n\n${m.text}`.trim();
    })
    .join("\n\n");
  return dedupeBySection(joined);
}

function reduceIdentidade(text: string): string {
  const resumida = extrairIdentidadeResumida(text);
  return resumida || resumirIdentidadeFallback(text);
}

function dedupeBySection(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  const seenTitles = new Set<string>();
  const seenBlocks = new Set<string>();
  let currentBlock: string[] = [];

  const flush = () => {
    if (currentBlock.length === 0) return;
    const blockText = currentBlock.join("\n").trim();
    if (!seenBlocks.has(blockText)) {
      seenBlocks.add(blockText);
      out.push(blockText);
    }
    currentBlock = [];
  };

  for (const line of lines) {
    const isTitle =
      /^#{1,6}\s+/.test(line) ||
      /^[A-ZÁÂÃÉÊÍÓÔÕÚÜÇ0-9][^\n]{0,80}$/.test(line);
    if (isTitle) {
      flush();
      const normalizedTitle = line.trim().toUpperCase().replace(/\s+/g, " ");
      if (seenTitles.has(normalizedTitle)) {
        currentBlock = [];
        continue;
      }
      seenTitles.add(normalizedTitle);
    }
    currentBlock.push(line);
  }
  flush();
  return out.join("\n");
}

function titleFromName(name: string) {
  if (/NV1_CORE/i.test(name)) return "NV1 — CORE";
  if (/IDENTIDADE_MINI/i.test(name)) return "IDENTIDADE — ECO (mini)";
  if (/ANTISALDO_MIN/i.test(name)) return "ANTISSALDO — Diretriz mínima";
  if (/IDENTIDADE\.txt$/i.test(name)) return "IDENTIDADE — ECO (resumo)";
  if (/MODULACAO_TOM_REGISTRO/i.test(name)) return "MODULAÇÃO DE TOM & REGISTRO";
  if (/ENCERRAMENTO_SENSIVEL/i.test(name)) return "ENCERRAMENTO SENSÍVEL";
  if (/ESCALA_ABERTURA/i.test(name)) return "ESCALA DE ABERTURA (1–3)";
  if (/ESCALA_INTENSIDADE/i.test(name)) return "ESCALA DE INTENSIDADE (0–10)";
  if (/METODO_VIVA_ENXUTO/i.test(name)) return "MÉTODO VIVA — ENXUTO";
  if (/BLOCO_TECNICO_MEMORIA/i.test(name)) return "BLOCO TÉCNICO — MEMÓRIA";
  return name.replace(/\.txt$/i, "").replace(/_/g, " ");
}

function extrairIdentidadeResumida(text: string): string | "" {
  const m = text.match(/(IDENTIDADE\s+RESUMIDA[\s\S]*?)(?:\n#{1,6}\s+|$)/i);
  if (m) return limparEspacos(m[1]);
  const n = text.match(
    /IDENTIDADE[\s\S]*?\n+([\s\S]{80,400}?)(?:\n{2,}|#{1,6}\s+)/
  );
  if (n) return "IDENTIDADE — RESUMO\n" + limparEspacos(n[1]);
  return "";
}

function resumirIdentidadeFallback(_text: string): string {
  return [
    "IDENTIDADE — ECO (resumo)",
    "Você é a Eco: coach de autoconhecimento empático, reflexivo e bem-humorado.",
    "Fale simples, em 1–3 linhas por parágrafo. Traga perguntas vivas inéditas e só quando acrescentarem.",
    "Convide escolhas; evite jargões e diagnósticos.",
  ].join("\n");
}

function limparEspacos(value: string) {
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
