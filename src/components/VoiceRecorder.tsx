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
        className="relative flex items-center justify-center w-48 h-48 rounded-full bg-gradient-to-br from-white/60 to-white/30" // Ligeiramente mais escuro
        style={{
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px 0 rgba(255, 255, 255, 0.3)', // Sombra um pouco mais forte
          border: '2px solid rgba(255, 255, 255, 0.25)', // Borda mais visível
        }}
        animate={{
          scale: isListening ? [1, 1.05, 1] : 1
        }}
        transition={{
          repeat: isListening ? Infinity : 0,
          duration: 1.5
        }}
      >
        <motion.div
          className="absolute inset-0 rounded-full opacity-60 bg-white/40" // Ligeiramente mais opaco
          style={{
            backdropFilter: 'blur(5px)',
          }}
          animate={{
            scale: isListening ? [0.8, 1.1, 0.8] : 1,
          }}
          transition={{
            repeat: isListening ? Infinity : 0,
            duration: 2
          }}
        />
        <button
          onClick={toggleListening}
          className="z-10 w-full h-full rounded-full"
        />
      </motion.div>

      {/* Mode toggle button */}
      <div className="absolute bottom-20 left-0 right-0 flex justify-center">
        <motion.button
          onClick={toggleListening}
          className="p-4 rounded-full backdrop-blur-md bg-white/90 shadow-md border border-gray-300" // Fundo mais opaco, sombra e borda
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)', // Sombra mais escura
          }}
        >
          <Mic size={24} className="text-gray-800" /> {/* Ícone do microfone mais escuro */}
        </motion.button>
      </div>

      <p className="mt-8 text-gray-800"> {/* Texto mais escuro */}
        {isListening
          ? 'Ouvindo... Toque para parar'
          : 'Toque para fazer uma pergunta'}
      </p>
    </div>
  );
};

export default VoiceRecorder;