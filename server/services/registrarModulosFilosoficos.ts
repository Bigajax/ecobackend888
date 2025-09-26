// server/src/services/registrarModulosFilosoficos.ts
import fs from "fs/promises";
import path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { embedTextoCompleto } from "../adapters/embeddingService";

// Caminho correto da pasta
const pastaModulos = path.join(process.cwd(), "assets/modulos_filosoficos");

// Normaliza retorno do embedding (pode vir array ou JSON string)
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

// Inicializa Supabase só quando precisar
function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("❌ Variáveis SUPABASE_URL ou SUPABASE_ANON_KEY ausentes.");
  }
  return createClient(url, key);
}

export async function registrarModulosFilosoficos() {
  const supabase = getSupabase();
  let inseridos = 0;
  let pulados = 0;

  try {
    const arquivos = await fs.readdir(pastaModulos);

    for (const arquivo of arquivos) {
      try {
        const conteudo = await fs.readFile(path.join(pastaModulos, arquivo), "utf-8");

        // Verifica duplicidade
        const { data: jaExiste, error: dupErr } = await supabase
          .from("heuristicas_embeddings")
          .select("id")
          .eq("arquivo", arquivo)
          .eq("tipo", "filosofico")
          .maybeSingle();

        if (dupErr) {
          console.warn(`⚠️ Erro ao verificar duplicidade de ${arquivo}:`, dupErr.message);
        }
        if (jaExiste) {
          console.log(`🟡 Já registrado: ${arquivo}`);
          pulados++;
          continue;
        }

        // Gera embedding
        const raw = await embedTextoCompleto(conteudo, `💠 ${arquivo}`);
        const embedding = toNumberArray(raw);
        if (!embedding.length) {
          console.warn(`⚠️ Embedding vazio/inválido para ${arquivo} — pulando inserção.`);
          continue;
        }

        // Insere
        const { error } = await supabase.from("heuristicas_embeddings").insert([
          {
            arquivo,
            embedding,
            tags: ["filosofia"],
            tipo: "filosofico",
            origem: "modulos_filosoficos",
          },
        ]);

        if (error) {
          console.error(`❌ Erro ao inserir ${arquivo}:`, error.message);
        } else {
          console.log(`✅ Inserido: ${arquivo}`);
          inseridos++;
        }
      } catch (err: any) {
        console.error(`⚠️ Erro no arquivo ${arquivo}:`, err.message);
      }
    }

    console.log(`🎓 Registro concluído. Inseridos: ${inseridos}, já existentes: ${pulados}`);
  } catch (err) {
    console.error("❌ Erro ao registrar módulos filosóficos:", (err as Error).message);
  }
}

// ✅ Exporta como default para importar no server.ts
export default registrarModulosFilosoficos;

// ✅ Executa apenas se chamado diretamente via CLI
if (require.main === module) {
  registrarModulosFilosoficos();
}
