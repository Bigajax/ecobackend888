// src/api/voiceApi.ts
import axios from 'axios';

// A URL base para a rota de voz no seu back-end
const API_VOICE_URL = '/api/ask-voice';

interface VoiceInteractionResponse {
    userText: string;
    ecoText: string;
    audioBlob: Blob;
}

export const sendVoiceMessage = async (
    audioBlob: Blob,
    messagesHistory: any[], // Histórico de mensagens para o Gemini
    userName?: string
): Promise<VoiceInteractionResponse> => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm'); // 'audio' é o nome do campo esperado pelo Multer no backend
    formData.append('messages', JSON.stringify(messagesHistory)); // Envia o histórico como string JSON
    if (userName) {
        formData.append('userName', userName);
    }

    try {
        const response = await axios.post(API_VOICE_URL, formData, {
            responseType: 'arraybuffer', // Para receber o áudio como um arraybuffer
            headers: {
                'Content-Type': 'multipart/form-data', // Essencial para FormData
            },
        });

        // Os textos do usuário e da ECO virão nos headers (codificados)
        const userText = decodeURIComponent(response.headers['x-user-text'] || '');
        const ecoText = decodeURIComponent(response.headers['x-eco-text'] || '');
        const audioBlobResponse = new Blob([response.data], { type: response.headers['content-type'] });

        if (!userText || !ecoText || !audioBlobResponse.size) {
            console.error('Resposta da API de voz mal formatada:', { userText, ecoText, audioBlobResponse });
            throw new Error('Resposta inesperada do servidor de voz: Texto ou áudio não encontrados.');
        }

        return { userText, ecoText, audioBlob: audioBlobResponse };

    } catch (error: any) {
        console.error('Erro ao comunicar com o back-end para voz:', error);
        let errorMessage = 'Ocorreu um erro ao processar sua mensagem de voz.';

        if (axios.isAxiosError(error)) {
            if (error.response) {
                // Se o backend retornou uma resposta com erro JSON
                try {
                    const errorData = JSON.parse(new TextDecoder().decode(error.response.data));
                    errorMessage = `Erro do servidor de voz: ${errorData.error || 'Erro desconhecido'}`;
                } catch (parseError) {
                    // Se não for um JSON, apenas use o status e a mensagem padrão
                    errorMessage = `Erro do servidor de voz (status ${error.response.status}): ${error.response.statusText || 'Resposta inesperada'}`;
                }
            } else if (error.request) {
                errorMessage = `Erro de rede: Nenhuma resposta recebida do servidor de voz. Verifique se o backend está rodando e a rota ${API_VOICE_URL} está disponível.`;
            } else {
                errorMessage = `Erro na requisição de voz: ${error.message}`;
            }
        } else {
            errorMessage = `Erro inesperado na voz: ${error.message || error.toString()}`;
        }
        throw new Error(errorMessage);
    }
};