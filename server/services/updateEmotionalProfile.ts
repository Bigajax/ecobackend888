import { supabaseAdmin } from '../lib/supabaseAdmin';

interface Memoria {
  emocao_principal?: string;
  dominio_vida?: string;
  intensidade?: number;
  data_registro?: string;
  salvar_memoria?: boolean;
}

function ordenarPorFrequencia(obj: Record<string, number>): string[] {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

export async function updateEmotionalProfile(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const { data: memories, error } = await supabaseAdmin
      .from('memories')
      .select('emocao_principal, dominio_vida, intensidade, data_registro')
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
    const temasFreq: Record<string, number> = {};
    let ultimaDataSignificativa: string | null = null;

    for (const mem of memSignificativas) {
      const emocao = mem.emocao_principal?.trim().toLowerCase();
      const dominio = mem.dominio_vida?.trim().toLowerCase();

      if (emocao) emocoesFreq[emocao] = (emocoesFreq[emocao] || 0) + 1;
      if (dominio) temasFreq[dominio] = (temasFreq[dominio] || 0) + 1;

      if (mem.data_registro && (!ultimaDataSignificativa || new Date(mem.data_registro) > new Date(ultimaDataSignificativa))) {
        ultimaDataSignificativa = mem.data_registro;
      }
    }

    const emocoesOrdenadas = ordenarPorFrequencia(emocoesFreq);
    const temasOrdenados = ordenarPorFrequencia(temasFreq);

    let resumoGerado = '';
    if (emocoesOrdenadas.length && temasOrdenados.length) {
      resumoGerado = `Nos últimos tempos, emoções como ${emocoesOrdenadas.join(', ')} apareceram com frequência. ` +
                     `Você também experienciou temas como ${temasOrdenados.join(', ')}. ` +
                     `Esses elementos compõem um retrato emocional em movimento.`;
    } else if (emocoesOrdenadas.length) {
      resumoGerado = `As emoções mais presentes foram: ${emocoesOrdenadas.join(', ')}.`;
    } else {
      resumoGerado = 'Ainda não há elementos suficientes para compor um retrato sensível do seu momento atual.';
    }

    const { error: upsertError } = await supabaseAdmin
      .from('perfis_emocionais')
      .upsert([
        {
          usuario_id: userId,
          emocoes_frequentes: emocoesFreq,
          temas_recorrentes: temasFreq,
          ultima_interacao_sig: ultimaDataSignificativa,
          resumo_geral_ia: resumoGerado,
          updated_at: new Date().toISOString()
        }
      ], { onConflict: 'usuario_id' });

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
