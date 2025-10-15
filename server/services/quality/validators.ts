function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HEADING_REGEX = /^(?:#{1,6}\s*|\d+[.)]\s*|[-–—•]\s+|\*\s+)/;
const SECTION_KEYWORDS: Record<string, RegExp> = {
  espelho: /espelho/i,
  insight: /(insight|padr[aã]o|hip[oó]tese|leitura)/i,
  convite: /(convite|experimento|micro|passo|pr[aá]tica|exerc[ií]cio)/i,
  pergunta: /pergunta|explor/i,
};

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function detectSectionMap(text: string): Record<string, boolean> {
  const flags: Record<string, boolean> = {
    espelho: false,
    insight: false,
    convite: false,
    pergunta: false,
  };
  const lines = splitLines(text);
  for (const line of lines) {
    if (!HEADING_REGEX.test(line)) continue;
    for (const [key, regex] of Object.entries(SECTION_KEYWORDS)) {
      if (regex.test(line)) {
        flags[key] = true;
      }
    }
  }
  return flags;
}

export function checkEstrutura(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const sections = detectSectionMap(text);
  const hasRequired = sections.espelho && sections.insight;
  const hasOptional = sections.convite || sections.pergunta;
  const lines = splitLines(text);
  const headingCount = lines.filter((line) => HEADING_REGEX.test(line)).length;
  return hasRequired && hasOptional && headingCount >= 3;
}

function parseAnchor(raw: string): { type: "id" | "tag" | "raw"; value: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith("tag:")) {
    return { type: "tag", value: trimmed.slice(4) };
  }
  if (trimmed.startsWith("id:")) {
    return { type: "id", value: trimmed.slice(3) };
  }
  return { type: "raw", value: trimmed };
}

function matchTag(text: string, tag: string): boolean {
  if (!tag) return false;
  const normalized = tag.replace(/^#/g, "");
  if (!normalized) return false;
  const pattern = new RegExp(`[#@]${escapeRegExp(normalized)}(?![\w-])`, "i");
  return pattern.test(text);
}

function matchId(text: string, id: string): boolean {
  if (!id) return false;
  const core = id.trim();
  if (!core) return false;
  const explicitPattern = new RegExp(
    `mem[_-]?id\s*[:=]?\s*${escapeRegExp(core)}`,
    "i"
  );
  if (explicitPattern.test(text)) return true;
  if (core.length >= 6) {
    const loosePattern = new RegExp(escapeRegExp(core), "i");
    if (loosePattern.test(text)) return true;
  }
  return false;
}

export function checkMemoria(text: string, memIdsUsadas: string[]): boolean {
  if (!text || typeof text !== "string") return false;
  const anchors = Array.isArray(memIdsUsadas)
    ? memIdsUsadas.map(parseAnchor).filter((item) => item.value.length > 0)
    : [];
  if (anchors.length === 0) return false;
  const normalizedText = text;
  return anchors.some((anchor) => {
    if (anchor.type === "tag") {
      return matchTag(normalizedText, anchor.value);
    }
    if (anchor.type === "id") {
      return matchId(normalizedText, anchor.value);
    }
    if (anchor.value.startsWith("#")) {
      return matchTag(normalizedText, anchor.value);
    }
    return matchId(normalizedText, anchor.value);
  });
}

function extractJsonCandidates(rawText: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < rawText.length; i += 1) {
    const char = rawText[i]!;
    if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === "}") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          results.push(rawText.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  return results;
}

function isValidTechBlock(block: unknown, intensidade?: number): boolean {
  if (!block || typeof block !== "object" || Array.isArray(block)) return false;
  const payload = block as Record<string, unknown>;
  if (typeof payload.analise_resumo !== "string" || !payload.analise_resumo.trim()) {
    return false;
  }
  if (typeof payload.emocao_principal !== "string" || !payload.emocao_principal.trim()) {
    return false;
  }
  const intensityInBlock = payload.intensidade;
  const hasIntensityField = typeof intensityInBlock === "number" && Number.isFinite(intensityInBlock);
  if (typeof intensidade === "number" && intensidade >= 7) {
    if (!hasIntensityField) return false;
    if (Math.abs(intensityInBlock - intensidade) > 2) {
      return false;
    }
  }
  if (payload.tags != null && !Array.isArray(payload.tags)) {
    return false;
  }
  return true;
}

export function checkBlocoTecnico(
  rawText: string,
  intensidadeDetectada?: number
): boolean {
  const requiresBlock = typeof intensidadeDetectada === "number" && intensidadeDetectada >= 7;
  if (!rawText || typeof rawText !== "string") {
    return !requiresBlock;
  }
  const candidates = extractJsonCandidates(rawText);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const snippet = candidates[i]!;
    try {
      const parsed = JSON.parse(snippet);
      if (isValidTechBlock(parsed, intensidadeDetectada)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return !requiresBlock;
}

export function computeQ(params: {
  estruturado_ok: boolean;
  memoria_ok: boolean;
  bloco_ok: boolean;
}): number {
  const flags = [params.estruturado_ok, params.memoria_ok, params.bloco_ok];
  const sum = flags.reduce((acc, flag) => acc + (flag ? 1 : 0), 0);
  const average = sum / flags.length;
  return Number.isFinite(average) ? Number(average.toFixed(4)) : 0;
}
