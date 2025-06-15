import { supabase } from '../lib/supabaseClient';

interface Memoria {
  emocao_principal?: string;
  dominio_vida?: string;
  padrao_comportamental?: string;
  intensidade?: number;
  data_registro?: string;
  salvar_memoria?: boolean;
}

export async function updateEmotionalProfile(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    // 🔍 Busca memórias salvas e vinculadas ao usuário
    const { data: memories, error } = await supabase
      .from('memories')
      .select('*')
      .eq('usuario_id', userId)
      .eq('salvar_memoria', true);

    if (error) {
      console.error('❌ Erro ao buscar memórias:', error.message);
      return { success: false, message: 'Erro ao buscar memórias' };
    }

    if (!memories || memories.length === 0) {
      console.warn('⚠️ Nenhuma memória salva encontrada.');
      return { success: false, message: 'Nenhuma memória salva encontrada' };
    }

    // 🎯 Filtra memórias significativas com intensidade ≥ 7
    const memSignificativas = memories.filter(mem => typeof mem.intensidade === 'number' && mem.intensidade >= 7);

    if (memSignificativas.length === 0) {
      return { success: false, message: 'Nenhuma memória significativa (intensidade ≥ 7)' };
    }

    const emocoesFreq: Record<string, number> = {};
    const temasRecorrentes: Record<string, number> = {};
    let ultimaDataSignificativa: string | null = null;

    for (const mem of memSignificativas) {
      const emocao = String(mem.emocao_principal || '').trim().toLowerCase();
      const dominio = String(mem.dominio_vida || '').trim().toLowerCase();
      const padrao = String(mem.padrao_comportamental || '').trim().toLowerCase();

      if (emocao) emocoesFreq[emocao] = (emocoesFreq[emocao] || 0) + 1;
      if (dominio) temasRecorrentes[dominio] = (temasRecorrentes[dominio] || 0) + 1;
      if (padrao) temasRecorrentes[padrao] = (temasRecorrentes[padrao] || 0) + 1;

      if (mem.data_registro && (!ultimaDataSignificativa || new Date(mem.data_registro) > new Date(ultimaDataSignificativa))) {
        ultimaDataSignificativa = mem.data_registro;
      }
    }

    const emocoesList = Object.keys(emocoesFreq);
    const temasList = Object.keys(temasRecorrentes);

    const resumoGerado = (emocoesList.length === 0 && temasList.length === 0)
      ? 'Ainda não há elementos suficientes para compor um retrato sensível do seu momento atual.'
      : `Nos últimos tempos, emoções como ${emocoesList.join(', ')} apareceram com frequência. ` +
        `Você também vivenciou padrões ou temas como: ${temasList.join(', ')}. ` +
        `Isso compõe um retrato sensível e vivo do seu momento atual.`;

    // 🔁 Faz o UPSERT no perfil emocional
    const { error: upsertError } = await supabase
      .from('perfis_emocionais')
      .upsert([{
        usuario_id: userId,
        emocoes_frequentes: emocoesFreq,
        temas_recorrentes: temasRecorrentes,
        ultima_interacao_sig: ultimaDataSignificativa,
        resumo_geral_ia: resumoGerado,
        updated_at: new Date().toISOString()
      }], {
        onConflict: 'usuario_id'
      });

    if (upsertError) {
      console.error('❌ Erro ao salvar perfil emocional:', upsertError.message);
      return { success: false, message: 'Erro ao salvar perfil emocional' };
    }

    console.log('✅ Perfil emocional atualizado com sucesso');
    return { success: true, message: 'Perfil emocional atualizado com sucesso' };

  } catch (err: any) {
    console.error('❌ Erro inesperado no updateEmotionalProfile:', err.message || err);
    return { success: false, message: 'Erro inesperado ao atualizar perfil emocional' };
  }
}
