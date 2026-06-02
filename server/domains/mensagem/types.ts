export interface MensagemPayload {
  conteudo: string;
  usuario_id: string;
  data_hora?: string;
  salvar_memoria?: boolean;
  mensagem_id?: string;
}
