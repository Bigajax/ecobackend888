import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mic, StopCircle, Loader, BookOpen, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { sendVoiceMessage } from '../api/voiceApi';
import { useAuth } from '../contexts/AuthContext';

const VoicePage: React.FC = () => {
  const { userName, userId } = useAuth();
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ecoAudioURL, setEcoAudioURL] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const goToMemoryPage = () => navigate('/memory');
  const goToChatPage = () => navigate('/chat');

  const handleError = (msg: string) => {
    setError(msg);
    setIsListening(false);
    setIsProcessing(false);
    setEcoAudioURL(null);
    mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
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
          setIsProcessing(false);
          return;
        }

        setIsProcessing(true);
        setEcoAudioURL(null);

        try {
          const response = await sendVoiceMessage(audioBlob, [], userName, userId);
          const audioURL = URL.createObjectURL(response.audioBlob);
          setEcoAudioURL(audioURL);

          // ✅ Reproduz o áudio da Eco automaticamente
          const ecoAudio = new Audio(audioURL);
          await ecoAudio.play();

        } catch (err: any) {
          handleError(`Falha na interação de voz: ${err.message}`);
        } finally {
          setIsProcessing(false);
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
    if (isListening) stopRecording();
    else startRecording();
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  const isIdle = !isListening && !isProcessing;

  return (
    <motion.div
      className="flex flex-col items-center justify-between min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 px-4 pt-16 pb-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      <motion.div
        className={`mt-20 mb-8 w-64 h-64 rounded-full bg-white/30 backdrop-blur-md border border-white/20 shadow-xl transition-all duration-300 ${
          isListening
            ? 'animate-pulseListen'
            : isProcessing
            ? 'animate-pulseTalk'
            : 'animate-gentle-pulse'
        }`}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm mb-4 text-center max-w-sm shadow">
          {error}
        </div>
      )}

      <div className="mt-2 flex items-center justify-center space-x-6">
        <motion.button
          onClick={goToMemoryPage}
          className="w-14 h-14 rounded-full bg-white shadow-md hover:shadow-lg flex items-center justify-center transition backdrop-blur-sm"
          aria-label="Memórias"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4, ease: 'easeOut' }}
        >
          <BookOpen size={24} className="text-gray-700" />
        </motion.button>

        <motion.button
          onClick={toggleRecording}
          className="w-14 h-14 rounded-full bg-white shadow-md hover:shadow-lg flex items-center justify-center transition backdrop-blur-sm"
          aria-label={isListening ? 'Parar gravação' : 'Iniciar gravação'}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4, ease: 'easeOut' }}
        >
          {isProcessing ? (
            <Loader className="animate-spin text-gray-700" size={24} />
          ) : isListening ? (
            <StopCircle className="text-red-500" size={24} />
          ) : (
            <Mic className="text-gray-700" size={24} />
          )}
        </motion.button>

        <motion.button
          onClick={goToChatPage}
          className="w-14 h-14 rounded-full bg-white shadow-md hover:shadow-lg flex items-center justify-center transition backdrop-blur-sm"
          aria-label="Voltar ao chat"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4, ease: 'easeOut' }}
        >
          <X size={24} className="text-gray-700" />
        </motion.button>
      </div>
    </motion.div>
  );
};

export default VoicePage;
