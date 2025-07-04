import { supabaseAdmin } from '../lib/supabaseAdmin';

interface EntradaMemoria {
  usuario_id: string;
  resumo_eco: string;
  intensidade: number;
  emocao_principal?: string;
  tags?: string[];
}

export async function buscarUltimaReferenciaOuMemoria(usuario_id: string) {
  const { data, error } = await supabaseAdmin
    .rpc('buscar_ultima_memoria_ou_referencia', { usuario_id })
    .single();

  if (error) {
    console.warn('⚠️ Erro ao buscar última memória/referência:', error.message);
    return null;
  }

  return data;
}

export async function salvarMemoriaComEncadeamento(mem: EntradaMemoria) {
  const anterior = await buscarUltimaReferenciaOuMemoria(mem.usuario_id);

  const { error } = await supabaseAdmin.from('memories').insert({
    usuario_id: mem.usuario_id,
    resumo_eco: mem.resumo_eco,
    intensidade: mem.intensidade,
    emocao_principal: mem.emocao_principal,
    tags: mem.tags,
    referencia_anterior_id: anterior?.id ?? null,
    created_at: new Date().toISOString() // ✅ Alterado aqui
  });

  if (error) console.error('Erro ao salvar memória encadeada:', error.message);
}

export async function salvarReferenciaComEncadeamento(mem: EntradaMemoria) {
  const anterior = await buscarUltimaReferenciaOuMemoria(mem.usuario_id);

  const { error } = await supabaseAdmin.from('referencias_temporarias').insert({
    usuario_id: mem.usuario_id,
    resumo_eco: mem.resumo_eco,
    intensidade: mem.intensidade,
    emocao_principal: mem.emocao_principal,
    tags: mem.tags,
    referencia_anterior_id: anterior?.id ?? null,
    created_at: new Date().toISOString() // ✅ Alterado aqui também
  });

  if (error) console.error('Erro ao salvar referência encadeada:', error.message);
}
