import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';

const VoiceRecorder: React.FC = () => {
  const [isListening, setIsListening] = useState(false);

  const toggleListening = () => {
    setIsListening(!isListening);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full relative">
      {/* Glass sphere effect */}
      <motion.div
        className="relative flex items-center justify-center w-48 h-48 rounded-full"
        style={{
          background: 'radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.65) 20%, rgba(255, 255, 255, 0.35) 50%, rgba(255, 255, 255, 0) 100%)', // Gradiente mais sutil
          backdropFilter: 'blur(25px)', // Mais desfoque
          WebkitBackdropFilter: 'blur(25px)',
          boxShadow: '0 12px 60px rgba(0, 0, 0, 0.35)', // Sombra mais pronunciada e suave
          border: '1px solid rgba(255, 255, 255, 0.3)',
        }}
        animate={{
          scale: isListening ? [1, 1.12, 1] : 1, // Leve pulso ao ouvir
        }}
        transition={{
          repeat: isListening ? Infinity : 0,
          duration: 2,
          ease: 'easeInOut',
        }}
      >
        {/* Inner glow */}
        <motion.div
          className="absolute inset-0 rounded-full opacity-30" // Aumentei a opacidade
          style={{
            background: 'radial-gradient(circle at top left, rgba(255, 255, 255, 0.85) 0%, transparent 40%)', // Tom mais forte
            pointerEvents: 'none',
          }}
          animate={{
            scale: isListening ? [0.85, 1.15, 0.85] : 1, // Pulso mais pronunciado
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
      <div className="absolute bottom-20 left-0 right-0 flex justify-center">
        <motion.button
          onClick={toggleListening}
          className="p-4 rounded-full bg-white/90 backdrop-blur-md shadow-xl border border-gray-300" // Estilo mais definido
          whileHover={{ scale: 1.1 }} // Aumento de escala
          whileTap={{ scale: 0.9 }} // Diminuição ao tocar
        >
          <Mic size={30} className="text-blue-600" /> {/* Cor do ícone */}
        </motion.button>
      </div>

      <p className="mt-8 text-gray-800 text-center">
        {isListening ? 'Ouvindo... Toque para parar' : 'Toque para fazer uma pergunta'}
      </p>
    </div>
  );
};

export default VoiceRecorder;
