import { supabase } from '../lib/supabaseClient';

export async function updateEmotionalProfile(userId: string): Promise<{ success: boolean; message: string }> {
    try {
        // Buscar memórias intensas (intensidade >= 7)
        const { data: memories, error } = await supabase
            .from('memories')
            .select('*')
            .eq('usuario_id', userId)
            .gte('intensidade', 7);

        if (error) {
            console.error('Erro ao buscar memórias:', error);
            return { success: false, message: 'Erro ao buscar memórias' };
        }

        if (!memories || memories.length === 0) {
            return { success: false, message: 'Nenhuma memória intensa encontrada' };
        }

        // Contadores agregados
        const emocoesFreq: Record<string, number> = {};
        const temasRecorrentes: Record<string, number> = {};
        let ultimaDataSignificativa: string | null = null;

        memories.forEach(mem => {
            // Emoções
            if (mem.emocao_principal) {
                emocoesFreq[mem.emocao_principal] = (emocoesFreq[mem.emocao_principal] || 0) + 1;
            }
            // Domínios
            if (mem.dominio_vida) {
                temasRecorrentes[mem.dominio_vida] = (temasRecorrentes[mem.dominio_vida] || 0) + 1;
            }
            // Padrões
            if (mem.padrao_comportamental) {
                temasRecorrentes[mem.padrao_comportamental] = (temasRecorrentes[mem.padrao_comportamental] || 0) + 1;
            }
            // Última data significativa
            if (!ultimaDataSignificativa || new Date(mem.data_registro) > new Date(ultimaDataSignificativa)) {
                ultimaDataSignificativa = mem.data_registro;
            }
        });

        // Gerar resumo simples (opcional: podemos conectar IA depois)
        const resumoGerado = `Usuário apresenta padrões recorrentes: ${Object.keys(temasRecorrentes).join(', ')}. Emoções mais frequentes: ${Object.keys(emocoesFreq).join(', ')}.`;

        // Upsert no perfil emocional
        const { error: upsertError } = await supabase
            .from('perfis_emocionais')
            .upsert(
                {
                    usuario_id: userId,
                    emocoes_frequentes: emocoesFreq,
                    temas_recorrentes: temasRecorrentes,
                    ultima_interacao_significativa: ultimaDataSignificativa,
                    resumo_geral_ia: resumoGerado,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: ['usuario_id'] }
            );

        if (upsertError) {
            console.error('Erro ao atualizar perfil emocional:', upsertError);
            return { success: false, message: 'Erro ao atualizar perfil emocional' };
        }

        return { success: true, message: 'Perfil emocional atualizado com sucesso' };
    } catch (err) {
        console.error('Erro geral no updateEmotionalProfile:', err);
        return { success: false, message: 'Erro inesperado no processamento' };
    }
}
