// services/registrarTodasHeuristicas.ts
import fs from "fs/promises";
import path from "path";
import { embedTextoCompleto } from "../adapters/embeddingService";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { clearResponseCache } from "./CacheService";

// Pasta onde estão os .txt/.md das heurísticas
const heuristicasDir = path.join(__dirname, "../assets/modulos_cognitivos");

// Normaliza possível retorno do embedding (array ou JSON string)
function toNumberArray(v: unknown): number[] {
  if (Array.isArray(v)) return v.map((x) => Number(x)).filter(Number.isFinite);
  try {
    const parsed = JSON.parse(String(v));
    if (Array.isArray(parsed)) return parsed.map((x) => Number(x)).filter(Number.isFinite);
  } catch {
    /* ignore */
  }
  return [];
}

function isHeuristicaFile(name: string) {
  return /\.(txt|md)$/i.test(name);
}

export async function registrarTodasHeuristicas(): Promise<void> {
  let invalidated = false;
  try {
    const supabase = ensureSupabaseConfigured();
    const arquivos = await fs.readdir(heuristicasDir);

    for (const arquivo of arquivos) {
      const caminho = path.join(heuristicasDir, arquivo);

      // ignora diretórios e arquivos não .txt/.md
      const stat = await fs.stat(caminho);
      if (!stat.isFile() || !isHeuristicaFile(arquivo)) continue;

      const conteudo = await fs.readFile(caminho, "utf-8");

      // 1) Verifica duplicidade pelo nome do arquivo
      const { data: existente, error: buscaErro } = await supabase
        .from("heuristicas_embeddings")
        .select("id")
        .eq("arquivo", arquivo)
        .maybeSingle();

      if (buscaErro) {
        console.warn(`⚠️ Erro ao verificar duplicidade de ${arquivo}:`, buscaErro.message);
        // segue adiante mesmo assim
      }
      if (existente?.id) {
        console.log(`📌 ${arquivo} já está registrado — pulando.`);
        continue;
      }

      // 2) Gera embedding (pode retornar array ou string JSON)
      const raw = await embedTextoCompleto(conteudo, "🔍 heuristica");
      const embedding = toNumberArray(raw);
      if (!embedding.length) {
        console.warn(`⚠️ Embedding vazio/inválido para ${arquivo} — pulando inserção.`);
        continue;
      }

      // 3) Insere (sem o campo embedding na seleção pra não trafegar vetor grande)
      const { error: insercaoErro } = await supabase
        .from("heuristicas_embeddings")
        .insert([
          {
            arquivo,
            embedding,
            tags: [], // ajuste se quiser inferir tags
            tipo: "cognitiva",
            origem: "modulos_cognitivos",
          },
        ]);

      if (insercaoErro) {
        console.error(`❌ Falha ao inserir ${arquivo}:`, insercaoErro.message);
      } else {
        console.log(`✅ Heurística registrada: ${arquivo}`);
        invalidated = true;
      }
    }
  } catch (err) {
    console.error("❌ Erro ao registrar heurísticas:", (err as Error)?.message || err);
  }

  if (invalidated) {
    clearResponseCache();
    console.log("🧹 RESPONSE_CACHE limpo após atualização de heurísticas.");
  }
}

// export default para compatibilidade com import default
export default registrarTodasHeuristicas;
