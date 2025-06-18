import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

interface PerfilEmocional {
  emocoes_frequentes?: Record<string, number>;
  temas_recorrentes?: Record<string, number>;
  ultima_interacao_significativa?: string;
  resumo_geral_ia?: string;
}

interface Memoria {
  data_registro?: string;
  resumo_eco: string;
  tags?: string[];
  intensidade?: number;
}

function extrairTagsRelevantes(mensagem: string): string[] {
  const mapa: Record<string, string[]> = {
    tristeza: ['triste', 'chorar', 'desânimo', 'abatido'],
    medo: ['medo', 'receio', 'inseguro'],
    culpa: ['culpa', 'remorso'],
    rejeicao: ['rejeição', 'recusado'],
    fracasso: ['fracasso', 'erro', 'falhei'],
    pressao: ['pressão', 'cobrança'],
    ansioso: ['ansioso', 'afobado'],
    raiva: ['raiva', 'ódio'],
    vazio: ['vazio', 'sem sentido'],
    confusao: ['confuso', 'incerto'],
    felicidade: ['feliz', 'leve', 'paz', 'alívio', 'gratidão', 'alegria', 'sorrindo', 'encantado', 'riso', 'presença']
  };

  const mensagemLower = mensagem.toLowerCase();
  const tags = new Set<string>();

  for (const [tag, palavras] of Object.entries(mapa)) {
    if (palavras.some(p => mensagemLower.includes(p))) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

async function buscarMemoriasRelacionadas(userId: string, tags: string[]): Promise<Memoria[]> {
  if (!tags.length) return [];

  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('usuario_id', userId)
    .eq('salvar_memoria', true)
    .overlaps('tags', tags)
    .gte('intensidade', 7)
    .order('data_registro', { ascending: false })
    .limit(3);

  if (error) {
    console.warn('[⚠️] Erro ao buscar memórias por tags:', error.message);
    return [];
  }

  return data || [];
}

export async function montarContextoEco({
  perfil,
  ultimaMsg,
  userId,
  mems,
}: {
  perfil?: PerfilEmocional | null;
  ultimaMsg?: string;
  userId?: string;
  mems?: Memoria[];
}): Promise<string> {
  const assetsDir = path.join(process.cwd(), 'assets');
  const modulosDir = path.join(assetsDir, 'modulos');

  const promptBase = await fs.readFile(path.join(assetsDir, 'eco_prompt_programavel.txt'), 'utf-8');
  const forbidden = await fs.readFile(path.join(modulosDir, 'eco_forbidden_patterns.txt'), 'utf-8');

  let contexto = '';

  if (perfil) {
    const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(', ') || 'nenhuma';
    const temas = Object.keys(perfil.temas_recorrentes || {}).join(', ') || 'nenhum';
    const data = perfil.ultima_interacao_significativa || 'não registrada';
    const resumo = perfil.resumo_geral_ia || 'nenhum';

    contexto += `\n🧠 Perfil emocional recente:\n• Emoções frequentes: ${emocoes}\n• Temas recorrentes: ${temas}\n• Última interação significativa: ${data}\n• Resumo: ${resumo}`;
  }

  let memsUsadas = mems;

  // 🔍 Só busca memórias se a mensagem tiver carga emocional
  const tagsDetectadas = extrairTagsRelevantes(ultimaMsg || '');
  const temCargaEmocional = tagsDetectadas.length > 0;

  if ((!memsUsadas || memsUsadas.length === 0) && temCargaEmocional) {
    memsUsadas = userId ? await buscarMemoriasRelacionadas(userId, tagsDetectadas) : [];
  }

  if (memsUsadas?.length) {
    const blocos = memsUsadas.map(m => {
      const data = m.data_registro?.slice(0, 10);
      const tags = m.tags?.join(', ') || '';
      return `(${data}) ${m.resumo_eco} ${tags ? `[tags: ${tags}]` : ''}`;
    }).join('\n');

    contexto += `\n\n📘 Memórias relacionadas ao momento atual:\n${blocos}`;
  }

  const entrada = ultimaMsg?.toLowerCase().trim() || '';
  const modulosAdicionais: string[] = [];

  const entradasAmorfas = ['oi', '...', 'não sei', 'tô aqui', 'vim', 'só passei', 'só queria conversar'];
  const palavrasDespedida = ['obrigado', 'valeu', 'por hoje', 'preciso ir', 'até logo', 'encerrou'];

  if (entradasAmorfas.some(f => entrada.includes(f))) {
    try {
      const conteudo = await fs.readFile(path.join(modulosDir, 'eco_generic_inputs.txt'), 'utf-8');
      modulosAdicionais.push(`\n\n[Módulo: eco_generic_inputs]\n${conteudo.trim()}`);
    } catch {
      console.warn('[⚠️] Falha ao carregar eco_generic_inputs.txt');
    }
  }

  if (palavrasDespedida.some(f => entrada.includes(f))) {
    try {
      const conteudo = await fs.readFile(path.join(modulosDir, 'eco_farewell.txt'), 'utf-8');
      modulosAdicionais.push(`\n\n[Módulo: eco_farewell]\n${conteudo.trim()}`);
    } catch {
      console.warn('[⚠️] Falha ao carregar eco_farewell.txt');
    }
  }

  // ⚙️ Módulo de critérios para bloco JSON
  try {
    const criterios = await fs.readFile(path.join(modulosDir, 'eco_json_trigger_criteria.txt'), 'utf-8');
    modulosAdicionais.push(`\n\n[Módulo: eco_json_trigger_criteria]\n${criterios.trim()}`);
  } catch {
    console.warn('[⚠️] Falha ao carregar eco_json_trigger_criteria.txt');
  }

  modulosAdicionais.push(`\n\n[Módulo: eco_forbidden_patterns]\n${forbidden.trim()}`);

  return `${promptBase.trim()}\n\n${contexto.trim()}\n${modulosAdicionais.join('\n')}`.trim();
}

export const getPromptEcoPreview = async (_req: Request, res: Response) => {
  try {
    const promptFinal = await montarContextoEco({});
    res.json({ prompt: promptFinal });
  } catch (err) {
    console.error('[❌] Erro ao montar prompt:', err);
    res.status(500).json({ error: 'Erro ao montar o prompt' });
  }
};
