// server/services/elevenlabsService.ts
import { ElevenLabsClient } from 'elevenlabs';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';

// Carrega variáveis de ambiente se ainda não estiverem carregadas
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // Ajuste o caminho conforme a estrutura do seu projeto

const apiKey = process.env.ELEVENLABS_API_KEY;

if (!apiKey) {
    console.error('Erro: A chave de API do Eleven Labs não foi encontrada nas variáveis de ambiente.');
    // Idealmente, você pode querer lançar um erro aqui ou ter um fallback
}

const elevenlabs = new ElevenLabsClient({
    apiKey: apiKey, // Defaults to process.env.ELEVENLABS_API_KEY
});

// ID da voz da ECO (você pode escolher uma voz no painel do Eleven Labs)
// Exemplo: "Adam" (default) ou personalize com um voice_id que você criou
const ECO_VOICE_ID = '21m00Tzpb8CflqYdJpP1'; // Exemplo: Voice ID do "Adam". Verifique no painel do Eleven Labs.

/**
 * Converte texto para áudio usando a API Eleven Labs.
 * @param text O texto a ser sintetizado.
 * @returns Um ReadableStream contendo o áudio MP3.
 */
export const textToSpeech = async (text: string): Promise<NodeJS.ReadableStream> => {
    if (!apiKey) {
        throw new Error('Eleven Labs API Key não configurada.');
    }
    console.log('Convertendo texto para fala com Eleven Labs...');
    try {
        const audio = await elevenlabs.generate({
            voice_id: ECO_VOICE_ID,
            text: text,
            model_id: "eleven_multilingual_v2", // Ou "eleven_monolingual_v1" se o idioma for sempre inglês
            // Pode adicionar mais opções de geração se necessário
            // generationConfig: {
            //     stability: 0.75,
            //     similarityBoost: 0.75,
            // },
        });
        return audio; // Retorna o ReadableStream diretamente
    } catch (error) {
        console.error('Erro ao converter texto para fala com Eleven Labs:', error);
        throw error;
    }
};

/**
 * Converte áudio para texto usando a API Eleven Labs (Speech to Text).
 * @param audioFile O caminho ou buffer do arquivo de áudio.
 * @returns O texto transcrito.
 */
export const speechToText = async (audioBuffer: Buffer, mimeType: string): Promise<string> => {
    if (!apiKey) {
        throw new Error('Eleven Labs API Key não configurada.');
    }
    console.log('Convertendo fala para texto com Eleven Labs...');
    try {
        const transcription = await elevenlabs.speechToText.convert({
            audio: audioBuffer,
            mimeType: mimeType, // Ex: "audio/webm", "audio/mpeg"
        });
        return transcription.text;
    } catch (error) {
        console.error('Erro ao converter fala para texto com Eleven Labs:', error);
        throw error;
    }
};

// Exemplo de como usar (apenas para teste, pode remover depois)
/*
(async () => {
    try {
        // Teste Text-to-Speech
        const audioStream = await textToSpeech("Olá, este é um teste de voz do Eleven Labs.");
        const outputPath = path.resolve(__dirname, '../temp/test_output.mp3');
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        const writer = fs.createWriteStream(outputPath);
        audioStream.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        console.log(`Áudio salvo em: ${outputPath}`);

        // Teste Speech-to-Text (você precisaria de um arquivo de áudio para isso)
        // const audioFileToTranscribe = path.resolve(__dirname, '../temp/your_audio_file.webm');
        // const audioBuffer = await fs.readFile(audioFileToTranscribe);
        // const transcribedText = await speechToText(audioBuffer, "audio/webm");
        // console.log("Texto transcrito:", transcribedText);

    } catch (err) {
        console.error('Erro no exemplo de uso do Eleven Labs:', err);
    }
})();
*/