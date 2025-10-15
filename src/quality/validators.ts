export function checkEstrutura(text: string): boolean {
  if (!text) {
    return false;
  }

  const normalized = text
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase();

  const hasContexto = /(^|\n|\r)\s*(contexto|fundamentacao|analise|diagnostico)\b/.test(normalized);
  const hasPlano = /(^|\n|\r)\s*(plano|estrategia|proposta)\b/.test(normalized);
  const hasAcao = /(^|\n|\r)\s*(acao|passos|next steps|plano de acao)/.test(normalized);

  return hasPlano && hasAcao && (hasContexto || normalized.length > 80);
}

export function checkMemoria(text: string, memIdsUsadas: string[]): boolean {
  if (!memIdsUsadas || memIdsUsadas.length === 0) {
    return true;
  }

  const normalizedText = text.normalize("NFD").toLowerCase();

  return memIdsUsadas.some((memId) => {
    if (!memId) {
      return false;
    }

    const normalizedId = memId.normalize("NFD").toLowerCase();
    if (normalizedId.length === 0) {
      return false;
    }

    if (normalizedText.includes(normalizedId)) {
      return true;
    }

    const trimmed = normalizedId.replace(/[^a-z0-9]/gi, "");
    if (trimmed && normalizedText.replace(/[^a-z0-9]/gi, "").includes(trimmed)) {
      return true;
    }

    const tail = normalizedId.slice(-6);
    if (tail.length >= 3 && normalizedText.includes(tail)) {
      return true;
    }

    return false;
  });
}

export function checkBlocoTecnico(rawText: string, intensidadeDetectada: number): boolean {
  if (!rawText) {
    return intensidadeDetectada < 7;
  }

  if (intensidadeDetectada < 7) {
    return true;
  }

  const text = rawText.normalize("NFD").toUpperCase();
  const hasHeader = /BLOCO\s+TECNICO|BLOCO\s+TÉCNICO/.test(text);
  const hasCodeFence = /```/.test(rawText);
  const hasBullets = /(\n|\r)\s*([-*]|\d+\.)/.test(rawText);

  return hasHeader || hasCodeFence || hasBullets;
}

export function computeQ(flags: {
  estruturado_ok: boolean;
  memoria_ok: boolean;
  bloco_ok: boolean;
}): number {
  const values = [flags.estruturado_ok, flags.memoria_ok, flags.bloco_ok];
  const score = values.reduce((sum, value) => sum + (value ? 1 : 0), 0) / values.length;
  return Number(score.toFixed(4));
}
