import { supabase } from '../lib/supabaseClient';

interface Memoria {
  id: string;
  usuario_id: string;
  mensagem_id: string;
  resumo_eco: string;
  emocao_principal?: string | null;
  intensidade?: number | null;
  contexto?: string | null;
  salvar_memoria: boolean;
  created_at: string;
}

export async function salvarMemoria({
  usuarioId,
  mensagemId,
  resumoEco,
  emocaoPrincipal,
  intensidade,
  contexto,
  salvarMemoria = true,
}: {
  usuarioId: string;
  mensagemId: string;
  resumoEco: string;
  emocaoPrincipal?: string;
  intensidade?: number;
  contexto?: string;
  salvarMemoria?: boolean;
}) {
  const { data, error } = await supabase
    .from('memories') // Alterado para 'memories' (plural)
    .insert([
      {
        usuario_id: usuarioId,
        mensagem_id: mensagemId,
        resumo_eco: resumoEco,
        emocao_principal: emocaoPrincipal,
        intensidade,
        contexto,
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
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export const buscarMemorias = async (): Promise<Memoria[]> => {
  try {
    const { data, error } = await supabase
      .from('memories') // Substitua 'memorias' pelo nome da sua tabela
      .select('*') // Seleciona todas as colunas
      .order('created_at', { ascending: false }); // Ordena por data de criação, do mais recente para o mais antigo

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
  }
};
