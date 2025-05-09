// src/api/memoria.ts
import { supabase } from '../lib/supabaseClient'

export async function salvarMemoria({
  usuarioId,
  mensagemId,
  resumoEco,
  emocaoPrincipal,
  intensidade,
  contexto,
  salvarMemoria = true,
}: {
  usuarioId: string
  mensagemId: string
  resumoEco: string
  emocaoPrincipal?: string
  intensidade?: number
  contexto?: string
  salvarMemoria?: boolean
}) {
  const { data, error } = await supabase
    .from('memoria')
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
    ])

  if (error) throw new Error(error.message)
  return data
}
