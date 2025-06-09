// ✅ voiceApi.ts - Frontend (src/api/voiceApi.ts)

// Envia texto da IA e recebe áudio (TTS)
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

// Envia gravação de voz do usuário e recebe: texto + resposta da IA + áudio da IA
export async function sendVoiceMessage(
  audioBlob: Blob,
  messages: any[],
  userName: string
): Promise<{ userText: string; ecoText: string; audioBlob: Blob }> {
  const formData = new FormData();
  formData.append('audio', audioBlob);
  formData.append('userName', userName);

  const response = await fetch('/api/voice/transcribe-and-respond', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Erro ao enviar áudio para a IA');
  }

  const data = await response.json();
  const audioBlobResult = new Blob([Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0))], { type: 'audio/mpeg' });

  return {
    userText: data.userText,
    ecoText: data.ecoText,
    audioBlob: audioBlobResult,
  };
}
