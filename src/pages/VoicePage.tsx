import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import EcoBubbleIcon from "../components/EcoBubbleIcon";
import { Mic, StopCircle, Loader, BookOpen } from 'lucide-react'; // Ícones para os botões
import { useNavigate } from 'react-router-dom';
import { sendVoiceMessage } from '../api/voiceApi';
import { useAuth } from '../contexts/AuthContext'; // Caminho corrigido

const VoicePage: React.FC = () => {
    const { userName } = useAuth();
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isEcoThinking, setIsEcoThinking] = useState(false);
    const [ecoAudioURL, setEcoAudioURL] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);
    const [error, setError] = useState<string | null>(null);

    const navigate = useNavigate();

    const goToMemoryPage = () => {
        navigate('/memory');
    };

    const handleError = (msg: string) => {
        setError(msg);
        console.error(msg);
        setIsListening(false);
        setIsProcessing(false);
        setIsEcoThinking(false);
        setEcoAudioURL(null);
        if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            setIsListening(false);
        }
    };

    const startRecording = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            audioChunks.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                recorder.stream.getTracks().forEach(track => track.stop());
                const audioBlob = new Blob(audioChunks.current, { type: recorder.mimeType });

                if (audioBlob.size === 0) {
                    console.warn("Gravação muito curta ou sem dados de áudio.");
                    setIsProcessing(false);
                    setIsEcoThinking(false);
                    return;
                }

                setIsProcessing(true);
                setIsEcoThinking(true);
                setEcoAudioURL(null); // Limpa o áudio anterior enquanto processa

                try {
                    const response = await sendVoiceMessage(audioBlob, [], userName);

                    setEcoAudioURL(URL.createObjectURL(response.audioBlob)); // Define o novo áudio para a Eco
                    console.log("Resposta da Eco (texto):", response.ecoText); // Para depuração
                } catch (err: any) {
                    handleError(`Falha na interação de voz: ${err.message}`);
                } finally {
                    setIsProcessing(false);
                    setIsEcoThinking(false);
                }
            };

            recorder.onerror = (event) => {
                handleError(`Erro no MediaRecorder: ${(event as MediaRecorderErrorEvent).error.name}`);
            };

            recorder.start();
            setIsListening(true);
            mediaRecorderRef.current = recorder;

        } catch (err: any) {
            handleError(`Erro ao acessar o microfone: ${err.message || "Permissão de microfone negada ou não disponível."}`);
        }
    };

    const toggleRecording = () => {
        if (isListening) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
                mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const renderMicButton = () => {
        if (isProcessing) {
            return (
                <div className="flex items-center justify-center p-3 rounded-full bg-blue-500 text-white animate-pulse">
                    <Loader size={24} className="animate-spin" />
                </div>
            );
        } else if (isListening) {
            return (
                <button
                    onClick={toggleRecording}
                    className="p-3 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75"
                    aria-label="Parar gravação"
                >
                    <StopCircle size={24} />
                </button>
            );
        } else {
            return (
                <button
                    onClick={toggleRecording}
                    className="p-3 rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
                    aria-label="Iniciar gravação"
                >
                    <Mic size={24} />
                </button>
            );
        }
    };

    return (
        <motion.div
            className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-50 to-blue-100 p-4 relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
        >
            {/* Botão de Memória - Posicionado no canto superior direito */}
            <motion.button
                onClick={goToMemoryPage}
                className="absolute top-4 right-4 z-10 p-3 rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
                aria-label="Ir para a página de memória"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
            >
                <BookOpen size={24} />
            </motion.button>

            <h1 className="text-4xl font-extrabold text-gray-900 mb-8 tracking-tight text-center playfair-display">
                Converse com a Eco
            </h1>

            {/* A GRANDE BOLHA 3D no centro - REATIVADA */}
            <div className="relative w-full max-w-lg aspect-square mb-8">
                <EcoBubble
                    // As props isListening, isProcessing, isEcoThinking e ecoAudioURL são passadas para o EcoBubble
                    // para que ele possa controlar suas próprias animações com base nesses estados.
                    isListening={isListening}
                    isProcessing={isProcessing}
                    isEcoThinking={isEcoThinking}
                    ecoAudioURL={ecoAudioURL}
                    setEcoAudioURL={setEcoAudioURL}
                    size="w-full h-full" // Definindo o tamanho para preencher o contêiner
                    isAnimating={!!ecoAudioURL} // A bolha vibra quando há um audioURL (Eco está falando)
                />
            </div>

            {/* Controles de Gravação Abaixo da Bolha */}
            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                    <strong className="font-bold">Erro:</strong>
                    <span className="block sm:inline ml-2">{error}</span>
                </div>
            )}
            <div className="flex justify-center items-center py-4 px-6 bg-white rounded-full shadow-md">
                {renderMicButton()}
                <span className="ml-4 text-gray-600 text-sm">
                    {isListening ? 'Gravando...' : isProcessing ? 'Processando...' : 'Pressione para falar'}
                </span>
            </div>
        </motion.div>
    );
};

export default VoicePage;
