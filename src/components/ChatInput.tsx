// src/components/ChatInput.tsx
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, PlusCircle, StopCircle, Loader } from 'lucide-react'; // Importe StopCircle e Loader

// Definindo os tipos de opção para o 'Mais'
type MoreOption = 'save_memory' | 'go_to_voice_page';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onMoreOptionSelected: (option: MoreOption) => void;
  // Adicione uma nova prop para lidar com o envio de áudio
  onSendAudio?: (audioBlob: Blob) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, onMoreOptionSelected, onSendAudio }) => {
  const [inputMessage, setInputMessage] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [isRecording, setIsRecording] = useState(false); // Novo estado para gravação
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]); // Para armazenar partes do áudio
  const mediaRecorderRef = useRef<MediaRecorder | null>(null); // Referência para o MediaRecorder
  const formRef = useRef<HTMLFormElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      onSendMessage(inputMessage);
      setInputMessage('');
      setShowMoreOptions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (formRef.current) {
        formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  };

  const handleToggleMoreOptions = () => {
    setShowMoreOptions((prev) => !prev);
  };

  const handleOptionClick = (option: MoreOption) => {
    onMoreOptionSelected(option);
    setShowMoreOptions(false);
  };

  // Lógica para iniciar a gravação
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      setAudioChunks([]); // Limpa chunks anteriores

      mediaRecorder.ondataavailable = (event) => {
        setAudioChunks((prev) => [...prev, event.data]);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // Ou outro formato
        // Aqui você chamaria uma função de callback para enviar o áudio
        if (onSendAudio) {
          onSendAudio(audioBlob);
        }
        // Parar a trilha de áudio para liberar o microfone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setInputMessage('Gravando áudio...'); // Opcional: indicar que está gravando
    } catch (error) {
      console.error("Erro ao acessar o microfone:", error);
      alert("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  };

  // Lógica para parar a gravação
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setInputMessage(''); // Limpa a mensagem de gravação
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node) &&
          plusButtonRef.current && !plusButtonRef.current.contains(event.target as Node)) {
        setShowMoreOptions(false);
      }
    };

    if (showMoreOptions) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreOptions]);

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="relative flex items-center bg-white rounded-3xl px-1 py-1 shadow-sm border border-gray-100 w-full max-w-2xl mx-auto"
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 14 }}
      ref={formRef}
    >
      <button
        type="button"
        onClick={handleToggleMoreOptions}
        ref={plusButtonRef}
        className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 mr-1"
        aria-label="Mais opções"
      >
        <PlusCircle size={22} className="text-gray-500" />
      </button>

      <AnimatePresence>
        {showMoreOptions && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-full left-0 ml-1 mt-2 w-48 bg-white rounded-xl shadow-xl p-2 flex flex-col z-50 transform -translate-y-full"
          >
            <button
              type="button"
              onClick={() => handleOptionClick('save_memory')}
              className="flex items-center p-2 text-gray-800 hover:bg-gray-100 rounded-lg text-left"
            >
              <span className="mr-3 text-2xl">📝</span> Salvar Memória
            </button>
            <button
              type="button"
              onClick={() => handleOptionClick('go_to_voice_page')}
              className="flex items-center p-2 text-gray-800 hover:bg-gray-100 rounded-lg mt-1 text-left"
            >
              <span className="mr-3 text-2xl">🎤</span> Modo de Voz
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        type="text"
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        placeholder={isRecording ? 'Gravando...' : 'Fale com a Eco'}
        className="flex-1 py-2 px-1 bg-transparent border-none focus:outline-none text-gray-800 placeholder-gray-400"
        onKeyDown={handleKeyDown}
        disabled={isRecording} // Desativa o input de texto durante a gravação
      />

      <motion.button
        type="button"
        // Lógica do botão: Se estiver gravando, mostra StopCircle. Se tiver texto, mostra Send. Senão, mostra Mic.
        onClick={isRecording ? stopRecording : (inputMessage.trim() ? handleSubmit : startRecording)}
        className={`flex-shrink-0 p-1.5 rounded-full ${inputMessage.trim() || isRecording ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100'} transition-colors ml-1 focus:outline-none focus:ring-2 focus:ring-blue-500`}
        aria-label={isRecording ? "Parar gravação de áudio" : (inputMessage.trim() ? "Enviar mensagem de texto" : "Gravar áudio (microfone)")}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <AnimatePresence mode="wait">
          {isRecording ? (
            <motion.div key="stop-icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center">
              <StopCircle size={22} className="animate-pulse" /> {/* Animação de pulsação para indicar gravação */}
            </motion.div>
          ) : inputMessage.trim() ? (
            <motion.div key="send-icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Send size={22} />
            </motion.div>
          ) : (
            <motion.div key="mic-icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Mic size={22} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.form>
  );
};

export default ChatInput;