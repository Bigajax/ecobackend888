import { embedTextoCompleto, unitNorm } from "../../adapters/embeddingService";
import { buscarMemoriasSemelhantes } from "../../services/buscarMemorias";
import { gerarTagsAutomaticasViaIA } from "../../services/tagService";
import { heuristicaNivelAbertura } from "../../utils/heuristicaNivelAbertura";
import type { MemoryRepository } from "./repository";
import type { MemoryRow } from "./repository";

export interface RegisterMemoryInput {
  texto: string;
  tags?: string[] | string;
  intensidade: number;
  mensagem_id?: string | null;
  emocao_principal?: string | null;
  contexto?: string | null;
  dominio_vida?: string | null;
  padrao_comportamental?: string | null;
  salvar_memoria?: boolean;
  nivel_abertura?: number;
  analise_resumo?: string | null;
  categoria?: string;
}

export interface ListMemoriesInput {
  tags?: string[];
  limit?: number;
}

export interface FindSimilarInput {
  texto: string;
  limite: number;
  threshold: number;
}

function normalizeTags(tags?: string[] | string): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function gerarResumoEco(
  texto: string,
  tags: string[],
  intensidade: number,
  emocaoPrincipal?: string | null,
  analiseResumo?: string | null
) {
  const linhas: string[] = [`🗣️ "${(texto || "").trim()}"`];
  if (tags.length) linhas.push(`🏷️ Tags: ${tags.join(", ")}`);
  if (emocaoPrincipal) linhas.push(`❤️ Emoção: ${emocaoPrincipal}`);
  linhas.push(`🔥 Intensidade: ${intensidade}`);
  if (analiseResumo && analiseResumo.trim()) {
    linhas.push(`\n🧭 Resumo Analítico:\n${analiseResumo.trim()}`);
  } else {
    linhas.push(`⚠️ Sem análise detalhada disponível.`);
  }
  return linhas.join("\n");
}

export class MemoryService {
  constructor(private readonly repository: MemoryRepository) {}

  async registerMemory(userId: string, input: RegisterMemoryInput) {
    const intensidadeClamped = Math.max(0, Math.min(10, Number(input.intensidade) ?? 0));
    const salvar = typeof input.salvar_memoria === "boolean" ? input.salvar_memoria : true;
    const destinoTabela =
      intensidadeClamped >= 7 && salvar ? "memories" : "referencias_temporarias";

    let finalTags = normalizeTags(input.tags);
    if (!finalTags.length) {
      finalTags = await gerarTagsAutomaticasViaIA(input.texto);
    }

    const embedding = unitNorm(await embedTextoCompleto(input.texto));
    const embeddingEmocional = unitNorm(
      await embedTextoCompleto(input.analise_resumo ?? input.texto)
    );

    const nivelAbertura =
      typeof input.nivel_abertura === "number"
        ? input.nivel_abertura
        : heuristicaNivelAbertura(input.texto);

    const payload = {
      usuario_id: userId,
      mensagem_id: input.mensagem_id ?? null,
      resumo_eco: gerarResumoEco(
        input.texto,
        finalTags,
        intensidadeClamped,
        input.emocao_principal,
        input.analise_resumo
      ),
      tags: finalTags,
      intensidade: intensidadeClamped,
      emocao_principal: input.emocao_principal ?? null,
      contexto: input.contexto ?? null,
      dominio_vida: input.dominio_vida ?? null,
      padrao_comportamental: input.padrao_comportamental ?? null,
      salvar_memoria: Boolean(salvar),
      nivel_abertura: nivelAbertura,
      analise_resumo: input.analise_resumo ?? null,
      categoria: input.categoria ?? "emocional",
      embedding,
      embedding_emocional: embeddingEmocional,
    } as const;

    const data = await this.repository.save(destinoTabela, payload);

    return { table: destinoTabela, data };
  }

  async listMemories(userId: string, input: ListMemoriesInput): Promise<MemoryRow[]> {
    const records = await this.repository.list(userId, {
      tags: input.tags ?? [],
      limit: input.limit,
    });

    return records.filter(
      (memory) => typeof memory.resumo_eco === "string" && Boolean(memory.resumo_eco.trim())
    );
  }

  async findSimilarMemories(userId: string, input: FindSimilarInput) {
    return buscarMemoriasSemelhantes(userId, {
      texto: input.texto,
      k: input.limite,
      threshold: input.threshold,
    });
  }
}
