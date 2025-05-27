// src/components/ChatInput.tsx
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, StopCircle, Plus, X, BookOpen, Headphones } from 'lucide-react'; 
// REMOVIDO: import { useNavigate } from 'react-router-dom'; // <--- REMOVIDO AQUI

// Definindo os tipos de opção para o 'Mais'
type MoreOption = 'save_memory' | 'go_to_voice_page';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onMoreOptionSelected: (option: MoreOption) => void; // Esta prop é para o componente pai lidar com a navegação
  onSendAudio: (audioBlob: Blob) => void; // Adicionei esta prop que você já usa no ChatPage
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, onMoreOptionSelected, onSendAudio }) => {
  const [inputMessage, setInputMessage] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [isListening, setIsListening] = useState(false); // Indica se o SpeechRecognition está ativo
  const [hasSent, setHasSent] = useState(false); // Novo estado para o feedback de envio
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // REMOVIDO: const navigate = useNavigate(); // <--- REMOVIDO AQUI

  // Inicializa o SpeechRecognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = false; 
      recognition.interimResults = false;
      recognition.lang = 'pt-BR';

      recognition.onstart = () => {
        setIsListening(true);
        setInputMessage('Ouvindo...');
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputMessage(transcript);
        setIsListening(false); 
        // Se a transcrição for bem-sucedida, envie-a como uma mensagem de texto.
        // Ou você pode ter uma prop onSendAudioText para isso.
        // Por enquanto, vou manter o fluxo original que usa onSendMessage no handleSubmit.
      };

      recognition.onerror = (event) => {
        console.error("Erro no reconhecimento de fala:", event.error);
        setIsListening(false);
        setInputMessage('');
        if (event.error === 'not-allowed') {
          alert('Permissão para o microfone negada. Por favor, permita o acesso ao microfone nas configurações do navegador.');
        } else if (event.error === 'no-speech') {
          alert('Nenhuma fala detectada. Tente novamente.');
        } else {
          alert(`Erro no reconhecimento de fala: ${event.error}.`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // Se houver texto no input após onend, pode-se enviar automaticamente.
        // Se for para enviar áudio, você precisaria de um MediaRecorder aqui.
        // Como o SpeechRecognition apenas transcreve, vou manter o fluxo atual onde
        // o usuário pode clicar em enviar após a transcrição.
      };

      speechRecognitionRef.current = recognition;
    } else {
      console.warn("Web Speech API não é suportada neste navegador.");
      // Poderia desabilitar o botão de microfone ou mostrar uma mensagem.
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim() && !isListening) {
      onSendMessage(inputMessage);
      setInputMessage('');
      setShowMoreOptions(false);
      
      setHasSent(true);
      const timer = setTimeout(() => {
        setHasSent(false);
      }, 300);
      return () => clearTimeout(timer);
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
    console.log("ChatInput: Opção selecionada:", option); // Log para depuração
    onMoreOptionSelected(option); // <--- APENAS DELEGA PARA O PAI
    setShowMoreOptions(false);

    // REMOVIDO: A lógica de navegação direta foi removida daqui
    // if (option === 'go_to_voice_page') {
    //   navigate('/voice');
    // } else if (option === 'save_memory') {
    //   navigate('/memory');
    // }
  };

  const startListening = () => {
    if (speechRecognitionRef.current && !isListening) {
      try {
        speechRecognitionRef.current.start();
        // Você poderia adicionar aqui uma lógica para iniciar a gravação de áudio real
        // se você quiser enviar o blob de áudio, e não apenas a transcrição.
        // Por exemplo, usando MediaRecorder.
      } catch (e) {
        console.error("Erro ao iniciar reconhecimento de fala:", e);
      }
    }
  };

  const stopListening = () => {
    if (speechRecognitionRef.current && isListening) {
      speechRecognitionRef.current.stop();
      // Se você estiver gravando áudio, você precisaria parar o MediaRecorder aqui
      // e chamar onSendAudio(audioBlob).
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

  // Se você realmente deseja que o botão do microfone envie um BLOB de áudio
  // em vez de apenas transcrever, você precisará de uma implementação MediaRecorder aqui.
  // Por ora, a lógica do microfone está apenas transcrevendo.

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
        <AnimatePresence mode="wait">
          {showMoreOptions ? (
            <motion.div
              key="close-icon"
              initial={{ opacity: 0, rotate: -45 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 45 }}
              transition={{ duration: 0.2 }}
            >
              <X size={22} className="text-gray-500" />
            </motion.div>
          ) : (
            <motion.div
              key="plus-icon"
              initial={{ opacity: 0, rotate: 45 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: -45 }}
              transition={{ duration: 0.2 }}
            >
              <Plus size={22} className="text-gray-500" />
            </motion.div>
          )}
        </AnimatePresence>
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
              <BookOpen size={20} className="mr-3" strokeWidth={1.5} />
              <span className="font-medium">Registro de memória</span>
            </button>
            <button
              type="button"
              onClick={() => handleOptionClick('go_to_voice_page')}
              className="flex items-center p-2 text-gray-800 hover:bg-gray-100 rounded-lg mt-1 text-left"
            >
              <Headphones size={20} className="mr-3" strokeWidth={1.5} />
              <span className="font-medium">Modo de voz</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        type="text"
        value={inputMessage}
        onChange={(e) => setInputMessage(e.target.value)}
        placeholder={isListening ? 'Ouvindo...' : 'Fale com a Eco'}
        className="flex-1 py-2 px-1 bg-transparent border-none focus:outline-none text-gray-800 placeholder-gray-400"
        onKeyDown={handleKeyDown}
        disabled={isListening} 
      />

      {/* Botão de Microfone / Parar Gravação - SEMPRE visível */}
      <motion.button
        type="button"
        onClick={isListening ? stopListening : startListening}
        className={`flex-shrink-0 p-1.5 rounded-full text-gray-500 hover:bg-gray-100 transition-colors ml-1 focus:outline-none focus:ring-2 focus:ring-blue-500`}
        aria-label={isListening ? "Parar reconhecimento de fala" : "Iniciar reconhecimento de fala (microfone)"}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <AnimatePresence mode="wait">
          {isListening ? (
            <motion.div key="stop-icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center">
              <StopCircle size={22} className="animate-pulse" />
            </motion.div>
          ) : (
            <motion.div key="mic-icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Mic size={22} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Botão de Enviar - SEMPRE visível e desabilitado quando estiver ouvindo ou sem texto */}
      <motion.button
        type="submit"
        className="flex-shrink-0 p-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors ml-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Enviar mensagem"
        disabled={!inputMessage.trim() || isListening}
        animate={hasSent ? { scale: [1, 0.8, 1.2, 1], opacity: [1, 0.5, 1] } : { scale: 1, opacity: 1 }}
        transition={hasSent ? { duration: 0.3, ease: "easeInOut" } : { type: "spring", stiffness: 200, damping: 20 }}
      >
        <Send size={22} strokeWidth={1.5} />
      </motion.button>
    </motion.form>
  );
};

export default ChatInput;