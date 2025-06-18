// ✅ voiceApi.ts - Frontend (src/api/voiceApi.ts)

export async function gerarAudioDaMensagem(text: string): Promise<Blob> {
  const response = await fetch('/api/voice/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error('Erro ao gerar áudio');
  }

  return await response.blob();
}

export async function sendVoiceMessage(
  audioBlob: Blob,
  messages: any[],
  userName: string,
  userId: string,
  accessToken: string
): Promise<{ userText: string; ecoText: string; audioBlob: Blob }> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'gravacao.webm');             // ✅ nome do arquivo
  formData.append('nome_usuario', userName);                        // ✅ como esperado no back-end
  formData.append('usuario_id', userId);                            // ✅ como esperado no back-end
  formData.append('access_token', accessToken);                     // ✅ agora incluído corretamente
  formData.append('mensagens', JSON.stringify(messages));           // ✅ contexto opcional

  const response = await fetch('/api/voice/transcribe-and-respond', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Erro resposta back-end]', errorText);
    throw new Error('Erro ao enviar áudio para a IA');
  }

  const data = await response.json();

  if (!data.audioBase64) {
    throw new Error('Resposta da IA não contém áudio.');
  }

  // Converte base64 para Blob
  const byteCharacters = atob(data.audioBase64);
  const byteArrays = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArrays[i] = byteCharacters.charCodeAt(i);
  }

  const audioBlobResult = new Blob([byteArrays], { type: 'audio/mpeg' });

  return {
    userText: data.userText,
    ecoText: data.ecoText,
    audioBlob: audioBlobResult,
  };
}
