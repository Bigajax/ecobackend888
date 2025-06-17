import { supabaseAdmin } from '../lib/supabaseAdmin';

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
    const { data: memories, error } = await supabaseAdmin
      .from('memories')
      .select('emocao_principal, dominio_vida, padrao_comportamental, intensidade, data_registro')
      .eq('usuario_id', userId)
      .eq('salvar_memoria', true);

    if (error) {
      console.error('❌ Erro ao buscar memórias:', error.message);
      return { success: false, message: 'Erro ao buscar memórias' };
    }

    if (!memories || memories.length === 0) {
      return { success: false, message: 'Nenhuma memória salva encontrada' };
    }

    const memSignificativas = memories.filter(m => typeof m.intensidade === 'number' && m.intensidade >= 7);
    if (memSignificativas.length === 0) {
      return { success: false, message: 'Nenhuma memória significativa (intensidade ≥ 7)' };
    }

    const emocoesFreq: Record<string, number> = {};
    const temasRecorrentes: Record<string, number> = {};
    let ultimaDataSignificativa: string | null = null;

    for (const mem of memSignificativas) {
      const emocao = mem.emocao_principal?.trim().toLowerCase() || '';
      const dominio = mem.dominio_vida?.trim().toLowerCase() || '';
      const padrao = mem.padrao_comportamental?.trim().toLowerCase() || '';

      if (emocao) emocoesFreq[emocao] = (emocoesFreq[emocao] || 0) + 1;
      if (dominio) temasRecorrentes[dominio] = (temasRecorrentes[dominio] || 0) + 1;
      if (padrao) temasRecorrentes[padrao] = (temasRecorrentes[padrao] || 0) + 1;

      if (mem.data_registro && (!ultimaDataSignificativa || new Date(mem.data_registro) > new Date(ultimaDataSignificativa))) {
        ultimaDataSignificativa = mem.data_registro;
      }
    }

    const resumoGerado =
      Object.keys(emocoesFreq).length === 0 && Object.keys(temasRecorrentes).length === 0
        ? 'Ainda não há elementos suficientes para compor um retrato sensível do seu momento atual.'
        : [
            `Nos últimos tempos, emoções como: ${Object.keys(emocoesFreq).join(', ')} foram frequentes.`,
            `Você também experienciou padrões e temas como: ${Object.keys(temasRecorrentes).join(', ')}.`,
            `Tudo isso compõe um retrato emocional vivo e atual.`
          ].join(' ');

    const { error: upsertError } = await supabaseAdmin
      .from('perfis_emocionais')
      .upsert(
        [{
          usuario_id: userId,
          emocoes_frequentes: emocoesFreq,
          temas_recorrentes: temasRecorrentes,
          ultima_interacao_sig: ultimaDataSignificativa,
          resumo_geral_ia: resumoGerado,
          updated_at: new Date().toISOString()
        }],
        { onConflict: 'usuario_id' }
      );

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
