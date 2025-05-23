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
    created_at: string; // Mantido, mas a ordenação será por data_registro
}

export async function salvarMemoria({
    usuarioId,
    mensagemId,
    resumoEco,
    dataRegistro, // Adicionado dataRegistro
    emocaoPrincipal,
    intensidade,
    contexto,
    tags, // Adicionado tags
    salvarMemoria = true,
}: {
    usuarioId: string;
    mensagemId: string;
    resumoEco: string;
    dataRegistro?: string; // Opcional, pois pode ser gerado no backend
    emocaoPrincipal?: string;
    intensidade?: number;
    contexto?: string;
    tags?: string[]; // Opcional
    salvarMemoria?: boolean;
}) {
    const { data, error } = await supabase
        .from('memories') // Alterado para 'memories' (plural)
        .insert([
            {
                usuario_id: usuarioId,
                mensagem_id: mensagemId,
                resumo_eco: resumoEco,
                data_registro: dataRegistro, // Incluindo dataRegistro
                emocao_principal: emocaoPrincipal,
                intensidade,
                contexto,
                categoria: tags, // Incluindo tags (como categoria)
                salvar_memoria: salvarMemoria,
            },
        ]);

    if (error) throw new Error(error.message);
    return data;
}

export async function buscarMemoriasPorUsuario(usuarioId: string) {
    const { data, error } = await supabase
        .from('memories') // Alterado para 'memories' (plural)
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('data_registro', { ascending: false }); // <-- CORRIGIDO AQUI: Usando 'data_registro'
    if (error) throw new Error(error.message);
    return data;
}

export const buscarMemorias = async (): Promise<Memoria[]> => {
    try {
        const { data, error } = await supabase
            .from('memories') // Substitua 'memorias' pelo nome da sua tabela
            .select('*') // Seleciona todas as colunas
            .order('data_registro', { ascending: false }); // Ordena por data de registro

        if (error) {
            console.error('Erro ao buscar memórias do Supabase:', error);
            throw new Error('Falha ao buscar memórias.');
        }

        if (!data) {
            return []; // Retorna um array vazio se não houver dados
        }

        return data as Memoria[]; // Garante que o tipo de retorno está correto
    } catch (error: any) {
        console.error('Erro ao buscar memórias:', error);
        throw error; // Rejoga o erro para ser tratado no componente
    } finally {
        console.log('Busca de memórias concluída.');
    }
};