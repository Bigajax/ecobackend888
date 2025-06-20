import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, Plus, X, BookOpen, Headphones } from 'lucide-react';

const ChatInput = ({ onSendMessage, onMoreOptionSelected, onSendAudio }) => {
  const [inputMessage, setInputMessage] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [isRecordingUI, setIsRecordingUI] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  const speechRecognitionRef = useRef(null);
  const plusButtonRef = useRef(null);
  const popoverRef   = useRef(null);

  /* ────────────────────────────  WEB KIT SPEECH  ─────────────────────────── */
  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous     = true;
      recognition.interimResults = true;
      recognition.lang           = 'pt-BR';

      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript.trim()) {
          setInputMessage((prev) => (prev ? prev + ' ' : '') + finalTranscript);
        }
      };

      recognition.onerror = (e) =>
        console.error('Erro no reconhecimento de fala:', e.error);

      speechRecognitionRef.current = recognition;
    }
  }, []);

  /* ────────────────────────────  GRAVAÇÃO  ─────────────────────────── */
  const startRecording = async () => {
    setIsRecordingUI(true);
    setIsTranscribing(false);

    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks   = [];

      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

      recorder.onstop = () => {
        setIsTranscribing(true);
        const blob = new Blob(chunks, { type: 'audio/webm' });
        onSendAudio(blob);
        // Aguarda ~1 s para “transcrição” e fecha UI
        setTimeout(() => setIsRecordingUI(false), 1200);
      };

      setMediaRecorder(recorder);
      recorder.start();
      speechRecognitionRef.current?.start();
    } catch (err) {
      console.error('Erro ao acessar microfone:', err);
      setIsRecordingUI(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    speechRecognitionRef.current?.stop();
  };

  const cancelRecording = () => {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
    speechRecognitionRef.current?.abort();

    setInputMessage('');
    setIsRecordingUI(false);
    setIsTranscribing(false);
  };

  /* ────────────────────────────  ENVIO TEXTO  ─────────────────────────── */
  const handleSend = () => {
    if (inputMessage.trim()) {
      onSendMessage(inputMessage.trim());
      setInputMessage('');
    }
  };

  /* ────────────────────────────  UI DE GRAVAÇÃO  ─────────────────────────── */
  if (isRecordingUI) {
    return (
      <div className="relative bg-white border border-gray-200 rounded-2xl px-4 py-2 w-full max-w-2xl mx-auto">
        {/* Faixa de status */}
        <div className="w-full h-10 mb-2 rounded-xl bg-gray-100 flex items-center justify-center">
          {isTranscribing ? (
            <div className="text-gray-400 text-sm flex items-center gap-2">
              <span className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full" />
              Transcrevendo
            </div>
          ) : (
            <div className="text-gray-500 text-sm flex items-center gap-2">
              <svg className="animate-pulse w-4 h-4" viewBox="0 0 24 24" fill="none">
                <rect x="6"  y="8"  width="2" height="8"  fill="currentColor" />
                <rect x="11" y="5"  width="2" height="14" fill="currentColor" />
                <rect x="16" y="10" width="2" height="4"  fill="currentColor" />
              </svg>
              Ouvindo
            </div>
          )}
        </div>

        {/* Botões cancelar / confirmar */}
        <div className="flex justify-between items-center">
          <Plus size={18} className="text-transparent select-none" />{/* placeholder */}
          <div className="flex gap-2">
            <button
              onClick={cancelRecording}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
              aria-label="Cancelar"
            >
              <X size={18} className="text-gray-700" />
            </button>
            <button
              onClick={stopRecording}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
              aria-label="Confirmar"
            >
              ✓
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ────────────────────────────  UI PADRÃO  ─────────────────────────── */
  return (
    <motion.form
      onSubmit={(e) => {
        e.preventDefault();
        handleSend();
      }}
      className="relative bg-white rounded-3xl px-4 py-3 shadow-sm border border-gray-100 w-full max-w-2xl mx-auto"
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 14 }}
    >
      <div className="flex flex-col">
        {/* Pop-over de opções extra */}
        <AnimatePresence>
          {showMoreOptions && (
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-full mb-2 left-4 w-56 bg-white rounded-xl shadow-xl p-2 z-50"
            >
              <button
                type="button"
                onClick={() => onMoreOptionSelected('save_memory')}
                className="flex items-center p-2 text-gray-800 hover:bg-gray-100 rounded-lg"
              >
                <BookOpen size={20} className="mr-3" strokeWidth={1.5} />
                Registro de memória
              </button>
              <button
                type="button"
                onClick={() => onMoreOptionSelected('go_to_voice_page')}
                className="flex items-center p-2 text-gray-800 hover:bg-gray-100 rounded-lg mt-1"
              >
                <Headphones size={20} className="mr-3" strokeWidth={1.5} />
                Modo de voz
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Caixa de entrada */}
        <div className="flex items-start gap-2">
          {/* Botão + */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowMoreOptions((prev) => !prev)}
              ref={plusButtonRef}
              className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 focus:outline-none"
              aria-label="Mais opções"
            >
              {showMoreOptions ? <X size={22} /> : <Plus size={22} />}
            </button>
          </div>

          {/* Textarea */}
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Fale com a Eco"
            className="flex-1 px-2 py-1.5 bg-transparent border-none focus:outline-none text-sm text-gray-800 placeholder-gray-400 resize-none overflow-y-auto max-h-40 leading-snug"
          />

          {/* Mic e Enviar */}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={startRecording}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
              aria-label="Iniciar gravação"
            >
              <Mic size={18} className="text-gray-600" />
            </button>

            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
              aria-label="Enviar mensagem"
            >
              <Send size={18} className="text-gray-600" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
    </motion.form>
  );
};

export default ChatInput;
