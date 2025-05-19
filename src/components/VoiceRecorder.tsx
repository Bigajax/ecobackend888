import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mic, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const VoiceRecorder: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const navigate = useNavigate();
  const speechRecognition = useRef<SpeechRecognition | null>(null); // Referência para a API de reconhecimento de fala

  const elevenLabsApiKey = process.env.REACT_APP_ELEVENLABS_API_KEY;
  const elevenLabsVoiceId = process.env.REACT_APP_ELEVENLABS_VOICE_ID;

  useEffect(() => {
    // Inicializa o reconhecimento de fala na montagem do componente
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      speechRecognition.current = new (window.webkitSpeechRecognition || window.SpeechRecognition)();
      speechRecognition.current.continuous = false; // Para de gravar após um período de silêncio
      speechRecognition.current.interimResults = false; // Não mostra resultados parciais
      speechRecognition.current.lang = 'pt-BR'; // Defina o idioma para português brasileiro

      speechRecognition.current.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('Texto transcrito (Web Speech API):', transcript);
        // Agora, envie este texto para o ElevenLabs TTS
        if (transcript) {
          await sendTextToElevenLabs(transcript);
        }
      };

      speechRecognition.current.onerror = (event) => {
        console.error('Erro no reconhecimento de fala:', event.error);
        setIsListening(false); // Parar de ouvir em caso de erro
      };

      speechRecognition.current.onend = () => {
        setIsListening(false); // Parar de ouvir quando o reconhecimento termina
        console.log('Reconhecimento de fala finalizado.');
      };
    } else {
      console.error('A API de Reconhecimento de Fala não é suportada neste navegador.');
      // Lide com a falta de suporte, talvez exibindo uma mensagem ao usuário
    }

    const initializeMediaRecorder = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder.current = new MediaRecorder(stream);

        mediaRecorder.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.current.push(event.data);
          }
        };

        mediaRecorder.current.onstop = async () => {
          const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
          audioChunks.current = [];
          // Não vamos enviar o blob diretamente para o ElevenLabs agora
          // A transcrição será feita pela Web Speech API
        };
      } catch (error) {
        console.error('Erro ao acessar o microfone:', error);
        setIsListening(false); // Parar de ouvir em caso de erro
        // Lide com o erro de acordo com a sua necessidade
      }
    };

    if (isListening && !mediaRecorder.current && speechRecognition.current) {
      initializeMediaRecorder();
      speechRecognition.current.start(); // Inicia o reconhecimento de fala
      console.log('Reconhecimento de fala iniciado.');
    } else if (!isListening && speechRecognition.current && speechRecognition.current.state === 'recording') {
      speechRecognition.current.stop(); // Para o reconhecimento de fala
      console.log('Reconhecimento de fala parado.');
      if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
        mediaRecorder.current.stop();
      }
    }

    return () => {
      if (speechRecognition.current && speechRecognition.current.state === 'recording') {
        speechRecognition.current.stop();
      }
      if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
        mediaRecorder.current.stop();
      }
      if (mediaRecorder.current && mediaRecorder.current.getTracks) {
        mediaRecorder.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isListening]);

  const toggleListening = () => {
    setIsListening(!isListening);
    setAudioURL(null);
  };

  const goToMemoryPage = () => {
    navigate('/memory');
  };

  const sendTextToElevenLabs = async (text: string) => {
    if (!elevenLabsApiKey || !elevenLabsVoiceId) {
      console.error('Chave de API do ElevenLabs ou ID da voz não fornecidos.');
      return;
    }

    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
        {
          text: text,
          model_id: 'eleven_monolingual_v1', // Ou outro modelo de sua preferência
        },
        {
          headers: {
            'xi-api-key': elevenLabsApiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'blob', // Importante para receber áudio como blob
        }
      );

      const audioObjectURL = URL.createObjectURL(response.data);
      setAudioURL(audioObjectURL);

    } catch (error) {
      console.error('Erro ao interagir com o ElevenLabs (TTS):', error);
      // Lide com o erro de acordo com a sua necessidade
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full relative">
      {/* Glass sphere effect */}
      <motion.div
        className="relative flex items-center justify-center w-48 h-48 rounded-full mt-[-32px]"
        style={{
          background:
            'radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.65) 20%, rgba(255, 255, 255, 0.35) 50%, rgba(255, 255, 255, 0) 100%)',
          backdropFilter: 'blur(25px)',
          WebkitBackdropFilter: 'blur(25px)',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
        }}
        animate={{
          scale: isListening ? [1, 1.12, 1] : 1,
        }}
        transition={{
          repeat: isListening ? Infinity : 0,
          duration: 2,
          ease: 'easeInOut',
        }}
      >
        {/* Inner glow */}
        <motion.div
          className="absolute inset-0 rounded-full opacity-30"
          style={{
            background:
              'radial-gradient(circle at top left, rgba(255, 255, 255, 0.85) 0%, transparent 40%)',
            pointerEvents: 'none',
          }}
          animate={{
            scale: isListening ? [0.85, 1.15, 0.85] : 1,
          }}
          transition={{
            repeat: isListening ? Infinity : 0,
            duration: 2.5,
            ease: 'easeInOut',
          }}
        />
        <button
          onClick={toggleListening}
          className="z-10 w-full h-full rounded-full bg-transparent"
        />
      </motion.div>

      {/* Mode toggle button */}
      <div className="absolute bottom-16 left-0 right-0 flex justify-center space-x-4">
        <motion.button
          onClick={goToMemoryPage}
          className="p-4 rounded-full bg-white/90 backdrop-blur-md shadow-md border border-gray-300 mr-4"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <BookOpen size={30} className="text-black" />
        </motion.button>
        <motion.button
          onClick={toggleListening}
          className="p-4 rounded-full bg-white/90 backdrop-blur-md shadow-md border border-gray-300"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Mic size={30} className="text-black" />
        </motion.button>
      </div>

      <p className="mt-8 text-gray-800 text-center">
        {isListening ? 'Ouvindo... (Web Speech API)' : 'Toque para fazer uma pergunta'}
      </p>

      {audioURL && (
        <audio src={audioURL} controls autoPlay />
      )}
    </div>
  );
};

export default VoiceRecorder;