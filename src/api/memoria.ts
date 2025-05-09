// src/api/memoria.ts
import { supabase } from '../lib/supabaseClient';

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
    .order('data_registro', { ascending: false }); // Alterado para 'data_registro'
    // Se você não quiser ordenar por data, pode remover a linha .order()
  if (error) throw new Error(error.message);
  return data;
}