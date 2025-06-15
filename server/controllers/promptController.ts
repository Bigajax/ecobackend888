import path from 'path';
import fs from 'fs/promises';
import { Request, Response } from 'express';

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

export async function montarContextoEco({
  perfil,
  mems,
  ultimaMsg,
  modo_compacto = false
}: {
  perfil?: PerfilEmocional | null;
  mems?: Memoria[];
  ultimaMsg?: string;
  modo_compacto?: boolean;
}): Promise<string> {
  const assetsDir = path.join(process.cwd(), 'assets');
  const modulosDir = path.join(assetsDir, 'modulos');

  const promptBase = await fs.readFile(path.join(assetsDir, 'eco_prompt_programavel.txt'), 'utf-8');
  let contexto = '';

  if (perfil) {
    const emocoes = Object.keys(perfil.emocoes_frequentes || {}).join(', ') || 'nenhuma';
    const temas = Object.keys(perfil.temas_recorrentes || {}).join(', ') || 'nenhum';
    const data = perfil.ultima_interacao_significativa || 'não registrada';
    const resumo = perfil.resumo_geral_ia || 'nenhum';

    contexto += `\n🧠 Perfil emocional recente:\n• Emoções frequentes: ${emocoes}\n• Temas recorrentes: ${temas}\n• Última interação significativa: ${data}\n• Resumo: ${resumo}`;
  }

  if (mems?.length) {
    const blocos = mems.map(m => {
      const data = m.data_registro?.slice(0, 10);
      const tags = m.tags?.join(', ') || '';
      return `(${data}) ${m.resumo_eco} ${tags ? `[tags: ${tags}]` : ''}`;
    }).join('\n');

    contexto += `\n\n📘 Últimas memórias marcantes:\n${blocos}`;
  }

  const entrada = ultimaMsg?.toLowerCase() || '';
  const entradaCurta = entrada.length <= 6;
  const mensagemBaixaEnergia = /^([\.\s]*|hmm+|não sei|tô aqui|só passei|oi+|olá)$/i.test(entrada);
  const pareceDespedida = /(obrigado|valeu|por hoje|preciso ir|até logo|encerrou)/i.test(entrada);
  const temPergunta = entrada.includes('?');
  const temEmocao = /(triste|alegre|feliz|raiva|culpa|ansioso|vazio|confuso|amor|dor|ódio|inseguro|medo)/i.test(entrada);
  const temDuvida = /(não sei|duvid|incerteza|confus|será que)/i.test(entrada);
  const entradaInformativa = /(acordei|comi|fui|terminei|tô|estou|trabalhando|comecei|voltei)/i.test(entrada);

  const modoCotidiano = entradaInformativa && !temEmocao && !temDuvida && !temPergunta && !pareceDespedida;
  const hasIntensa = mems?.some(m => m.intensidade && m.intensidade >= 7);

  const modulos: string[] = [];

  if (!modo_compacto) {
    if (!modoCotidiano) {
      if (hasIntensa || temEmocao) modulos.push('eco_emotions.txt');
      if (entradaCurta || mensagemBaixaEnergia) modulos.push('eco_generic_inputs.txt');
      if (pareceDespedida) modulos.push('eco_farewell.txt');
      if (temDuvida || temPergunta || temEmocao) modulos.push('eco_principios_poeticos.txt');
    }
    modulos.push('eco_behavioral_instructions.txt');
  }

  const modulosCarregados: string[] = [];

  for (const nome of modulos) {
    try {
      const filePath = path.join(modulosDir, nome);
      const conteudo = await fs.readFile(filePath, 'utf-8');
      modulosCarregados.push(`\n\n[Módulo: ${nome.replace('.txt', '')}]\n${conteudo.trim()}`);
    } catch (err) {
      console.warn(`[⚠️] Falha ao carregar módulo ${nome}:`, err);
    }
  }

  return `${promptBase.trim()}\n\n${contexto.trim()}\n${modulosCarregados.join('\n')}`.trim();
}

export const getPromptEcoPreview = async (_req: Request, res: Response) => {
  try {
    const promptFinal = await montarContextoEco({ modo_compacto: true });
    res.json({ prompt: promptFinal });
  } catch (err) {
    console.error('[❌] Erro ao montar prompt:', err);
    res.status(500).json({ error: 'Erro ao montar o prompt' });
  }
};
