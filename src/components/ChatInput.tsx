import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, Plus, X, BookOpen, Headphones } from 'lucide-react';

const ChatInput = ({ onSendMessage, onMoreOptionSelected, onSendAudio }) => {
  const [inputMessage, setInputMessage] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [isRecordingUI, setIsRecordingUI] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [transcription, setTranscription] = useState('');

  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationIdRef = useRef(null);
  const speechRecognitionRef = useRef(null);

  const plusButtonRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript.trim()) {
          setTranscription((prev) => (prev ? prev + ' ' : '') + finalTranscript);
          setInputMessage((prev) => (prev ? prev.trim() + ' ' : '') + finalTranscript);
        }
      };

      recognition.onerror = (event) => {
        console.error('Erro no reconhecimento de fala:', event.error);
      };

      speechRecognitionRef.current = recognition;
    }
  }, []);

  const startRecording = async () => {
    setIsRecordingUI(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        onSendAudio(blob);
      };

      setMediaRecorder(recorder);
      recorder.start();

      if (speechRecognitionRef.current) speechRecognitionRef.current.start();

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      drawMinimalWaveform();
    } catch (err) {
      console.error('Erro ao acessar o microfone', err);
      setIsRecordingUI(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    if (speechRecognitionRef.current) speechRecognitionRef.current.stop();
    cancelAnimationFrame(animationIdRef.current);
    audioContextRef.current?.close();
    setIsRecordingUI(false);
  };

  const cancelRecording = () => {
    mediaRecorder?.stream.getTracks().forEach((track) => track.stop());
    if (speechRecognitionRef.current) speechRecognitionRef.current.stop();
    cancelAnimationFrame(animationIdRef.current);
    audioContextRef.current?.close();
    setTranscription('');
    setInputMessage('');
    setIsRecordingUI(false);
  };

  const drawMinimalWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationIdRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#f3f4f6'; // fundo claro
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 1.2; // mais fino
      ctx.strokeStyle = '#9ca3af'; // cinza claro
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.stroke();
    };

    draw();
  };

  const handleSend = () => {
    if (inputMessage.trim()) {
      onSendMessage(inputMessage.trim());
      setInputMessage('');
      setTranscription('');
    }
  };

  if (isRecordingUI) {
    return (
      <div className="relative bg-white border border-gray-200 rounded-2xl px-4 py-2 w-full max-w-2xl mx-auto">
        <canvas ref={canvasRef} width={600} height={40} className="w-full h-10 rounded-xl mb-2" />
        <div className="flex justify-between items-center gap-6 pt-1">
          <div className="flex items-center gap-2 pl-2">
            <Plus size={18} className="text-gray-400" />
          </div>
          <div className="flex items-center gap-6 pr-2">
            <button onClick={cancelRecording} className="text-sm text-gray-600 hover:text-black">✕</button>
            <button onClick={stopRecording} className="text-sm text-gray-600 hover:text-black">✓</button>
          </div>
        </div>
      </div>
    );
  }

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
        <AnimatePresence>
          {showMoreOptions && (
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-full mb-2 left-4 w-56 bg-white rounded-xl shadow-xl p-2 flex flex-col z-50"
            >
              <button type="button" onClick={() => onMoreOptionSelected('save_memory')} className="flex items-center p-2 text-gray-800 hover:bg-gray-100 rounded-lg text-left">
                <BookOpen size={20} className="mr-3" strokeWidth={1.5} />
                <span className="font-medium">Registro de memória</span>
              </button>
              <button type="button" onClick={() => onMoreOptionSelected('go_to_voice_page')} className="flex items-center p-2 text-gray-800 hover:bg-gray-100 rounded-lg mt-1 text-left">
                <Headphones size={20} className="mr-3" strokeWidth={1.5} />
                <span className="font-medium">Modo de voz</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-start gap-2">
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowMoreOptions((prev) => !prev)}
              ref={plusButtonRef}
              className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Mais opções"
            >
              <AnimatePresence mode="wait">
                {showMoreOptions ? (
                  <motion.div key="close-icon" initial={{ opacity: 0, rotate: -45 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 45 }} transition={{ duration: 0.2 }}>
                    <X size={22} className="text-gray-500" />
                  </motion.div>
                ) : (
                  <motion.div key="plus-icon" initial={{ opacity: 0, rotate: 45 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -45 }} transition={{ duration: 0.2 }}>
                    <Plus size={22} className="text-gray-500" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>

          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Fale com a Eco"
            className="flex-1 py-2 pl-1 pr-2 bg-transparent border-none focus:outline-none text-gray-800 placeholder-gray-400 resize-none overflow-y-auto max-h-40 leading-relaxed"
          />

          <div className="flex items-end gap-2">
            <motion.button
              type="button"
              onClick={startRecording}
              className="flex-shrink-0 p-1.5 rounded-full text-gray-500 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Iniciar gravação"
            >
              <Mic size={22} />
            </motion.button>

            <motion.button
              type="submit"
              className="flex-shrink-0 p-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!inputMessage.trim()}
            >
              <Send size={22} strokeWidth={1.5} />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.form>
  );
};

export default ChatInput;
