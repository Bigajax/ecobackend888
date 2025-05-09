// src/api/mensagem.ts
import { supabase } from '../lib/supabaseClient'

export async function salvarMensagem({
  usuarioId,
  conteudo,
  sentimento,
  salvarMemoria = false,
}: {
  usuarioId: string
  conteudo: string
  sentimento?: string
  salvarMemoria?: boolean
}) {
  const { data, error } = await supabase
    .from('mensagem')
    .insert([
      {
        usuario_id: usuarioId,
        conteudo,
        sentimento,
        salvar_memoria: salvarMemoria,
      },
    ])

  if (error) throw new Error(error.message)
  return data
}
