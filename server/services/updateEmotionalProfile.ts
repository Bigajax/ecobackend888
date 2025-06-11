import { supabase } from '../lib/supabaseClient';

export async function updateEmotionalProfile(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const { data: memories, error } = await supabase
      .from('memories')
      .select('*')
      .eq('usuario_id', userId)
      .eq('salvar_memoria', true) // ⚠️ Só memórias marcadas como válidas
      .gte('intensidade', 7);

    if (error) {
      console.error('❌ Erro ao buscar memórias:', error);
      return { success: false, message: 'Erro ao buscar memórias' };
    }

    if (!memories || memories.length === 0) {
      console.warn('⚠️ Nenhuma memória significativa encontrada para o perfil emocional.');
      return { success: false, message: 'Nenhuma memória intensa encontrada' };
    }

    const emocoesFreq: Record<string, number> = {};
    const temasRecorrentes: Record<string, number> = {};
    let ultimaDataSignificativa: string | null = null;

    memories.forEach(mem => {
      if (mem.emocao_principal) {
        emocoesFreq[mem.emocao_principal] = (emocoesFreq[mem.emocao_principal] || 0) + 1;
      }

      if (mem.dominio_vida) {
        temasRecorrentes[mem.dominio_vida] = (temasRecorrentes[mem.dominio_vida] || 0) + 1;
      }

      if (mem.padrao_comportamental) {
        temasRecorrentes[mem.padrao_comportamental] = (temasRecorrentes[mem.padrao_comportamental] || 0) + 1;
      }

      if (mem.data_registro && (!ultimaDataSignificativa || new Date(mem.data_registro) > new Date(ultimaDataSignificativa))) {
        ultimaDataSignificativa = mem.data_registro;
      }
    });

    const emocoesList = Object.keys(emocoesFreq);
    const temasList = Object.keys(temasRecorrentes);

    const resumoGerado =
      emocoesList.length === 0 && temasList.length === 0
        ? 'Ainda não há dados emocionais suficientes para compor um retrato do seu momento atual.'
        : `Nos últimos tempos, suas emoções mais presentes foram: ${emocoesList.join(', ') || 'nenhuma'}. 
Você também tem vivenciado padrões e temas como: ${temasList.join(', ') || 'nenhum'}. 
Esses elementos ajudam a pintar um retrato mais sensível do seu momento atual.`;

    const { error: upsertError } = await supabase
      .from('perfis_emocionais')
      .upsert([
        {
          usuario_id: userId,
          emocoes_frequentes: emocoesFreq,
          temas_recorrentes: temasRecorrentes,
          ultima_interacao_significativa: ultimaDataSignificativa,
          resumo_geral_ia: resumoGerado,
          updated_at: new Date().toISOString()
        }
      ], {
        onConflict: 'usuario_id'
      });

    if (upsertError) {
      console.error('❌ Erro ao atualizar perfil emocional:', upsertError);
      return { success: false, message: 'Erro ao atualizar perfil emocional' };
    }

    console.log('✅ Perfil emocional atualizado com sucesso');
    return { success: true, message: 'Perfil emocional atualizado com sucesso' };
  } catch (err) {
    console.error('❌ Erro geral no updateEmotionalProfile:', err);
    return { success: false, message: 'Erro inesperado no processamento' };
  }
}
