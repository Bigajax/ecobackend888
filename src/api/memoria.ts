import { supabase } from '../lib/supabaseClient';

interface Memoria {
    id: string;
    usuario_id: string;
    mensagem_id: string;
    resumo_eco: string;
    data_registro?: string | null; // Adicionado data_registro
    emocao_principal?: string | null;
    intensidade?: number | null;
    contexto?: string | null;
    categoria?: string[] | null; // Adicionado categoria (para tags)
    salvar_memoria: boolean;
    // REMOVIDO: created_at: string; // <--- ESTA LINHA FOI REMOVIDA
}

export async function salvarMemoria({
    usuarioId,
    mensagemId,
    resumoEco,
    dataRegistro,
    emocaoPrincipal,
    intensidade,
    contexto,
    tags,
    salvarMemoria = true,
}: {
    usuarioId: string;
    mensagemId: string;
    resumoEco: string;
    dataRegistro?: string;
    emocaoPrincipal?: string;
    intensidade?: number;
    contexto?: string;
    tags?: string[];
    salvarMemoria?: boolean;
}) {
    const { data, error } = await supabase
        .from('memories')
        .insert([
            {
                usuario_id: usuarioId,
                mensagem_id: mensagemId,
                resumo_eco: resumoEco,
                data_registro: dataRegistro,
                emocao_principal: emocaoPrincipal,
                intensidade,
                contexto,
                categoria: tags,
                salvar_memoria: salvarMemoria,
            },
        ]);

    if (error) throw new Error(error.message);
    return data;
}

export async function buscarMemoriasPorUsuario(usuarioId: string) {
    const { data, error } = await supabase
        .from('memories')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('data_registro', { ascending: false }); // Usando 'data_registro'
    if (error) throw new Error(error.message);
    return data;
}

export const buscarMemorias = async (): Promise<Memoria[]> => {
    try {
        const { data, error } = await supabase
            .from('memories')
            .select('*')
            .order('data_registro', { ascending: false }); // Usando 'data_registro'

        if (error) {
            console.error('Erro ao buscar memórias do Supabase:', error);
            throw new Error('Falha ao buscar memórias.');
        }

        if (!data) {
            return [];
        }

        return data as Memoria[];
    } catch (error: any) {
        console.error('Erro ao buscar memórias:', error);
        throw error;
    } finally {
        console.log('Busca de memórias concluída.');
    }
};