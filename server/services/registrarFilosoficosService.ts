// services/registrarFilosoficosService.ts
import fs from "fs/promises";
import path from "path";
import { embedTextoCompleto } from "../adapters/embeddingService";
import { ensureSupabaseConfigured } from "../lib/supabaseAdmin";
import { clearResponseCache } from "./CacheService";

// Pasta onde estão os .txt/.md dos módulos filosóficos
const filosoficosDir = path.join(__dirname, "../assets/modulos_filosoficos");

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

function isFilosoficoFile(name: string) {
  return /\.(txt|md)$/i.test(name);
}

/**
 * Registra todos os módulos filosóficos no Supabase
 * Ativa busca automática por embedding
 */
export async function registrarFilosoficos(): Promise<void> {
  let invalidated = false;
  let processados = 0;
  let pulados = 0;
  let erros = 0;

  try {
    const supabase = ensureSupabaseConfigured();

    // Verifica se diretório existe
    try {
      await fs.stat(filosoficosDir);
    } catch {
      console.warn(`⚠️ Diretório não encontrado: ${filosoficosDir}`);
      return;
    }

    const arquivos = await fs.readdir(filosoficosDir);

    console.log(`📚 Processando ${arquivos.length} arquivos de modulos_filosoficos...`);

    for (const arquivo of arquivos) {
      const caminho = path.join(filosoficosDir, arquivo);

      // ignora diretórios e arquivos não .txt/.md
      try {
        const stat = await fs.stat(caminho);
        if (!stat.isFile() || !isFilosoficoFile(arquivo)) continue;
      } catch {
        continue;
      }

      const conteudo = await fs.readFile(caminho, "utf-8");

      // 1) Verifica duplicidade pelo nome do arquivo
      const { data: existente, error: buscaErro } = await supabase
        .from("heuristicas_embeddings")
        .select("id")
        .eq("arquivo", arquivo)
        .eq("tipo", "filosofico")
        .maybeSingle();

      if (buscaErro) {
        console.warn(`⚠️ Erro ao verificar duplicidade de ${arquivo}:`, buscaErro.message);
      }
      if (existente?.id) {
        console.log(`📌 ${arquivo} já está registrado — pulando.`);
        pulados++;
        continue;
      }

      // 2) Gera embedding (pode retornar array ou string JSON)
      let embedding: number[] = [];
      try {
        const raw = await embedTextoCompleto(conteudo, "🏛️ filosofico");
        embedding = toNumberArray(raw);
        if (!embedding.length) {
          console.warn(`⚠️ Embedding vazio/inválido para ${arquivo} — pulando inserção.`);
          erros++;
          continue;
        }
      } catch (embedErr) {
        console.error(`❌ Erro ao gerar embedding para ${arquivo}:`, (embedErr as Error)?.message);
        erros++;
        continue;
      }

      // 3) Insere na tabela
      try {
        const { error: insercaoErro } = await supabase
          .from("heuristicas_embeddings")
          .insert([
            {
              arquivo,
              embedding,
              tags: [], // pode inferir tags do filename depois
              tipo: "filosofico",
              origem: "modulos_filosoficos",
            },
          ]);

        if (insercaoErro) {
          console.error(`❌ Falha ao inserir ${arquivo}:`, insercaoErro.message);
          erros++;
        } else {
          console.log(`✅ Módulo filosófico registrado: ${arquivo}`);
          processados++;
          invalidated = true;
        }
      } catch (insertErr) {
        console.error(`❌ Erro ao inserir ${arquivo}:`, (insertErr as Error)?.message);
        erros++;
      }
    }
  } catch (err) {
    console.error("❌ Erro ao registrar filosóficos:", (err as Error)?.message || err);
  }

  // Limpeza de cache
  if (invalidated) {
    clearResponseCache();
    console.log("🧹 RESPONSE_CACHE limpo após atualização de filosóficos.");
  }

  // Resumo final
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 RESUMO: Módulos Filosóficos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Processados: ${processados}
📌 Já existiam: ${pulados}
❌ Erros: ${erros}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

export default registrarFilosoficos;
