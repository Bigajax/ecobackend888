import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';

const VoiceRecorder: React.FC = () => {
  const [isListening, setIsListening] = useState(false);

  const toggleListening = () => {
    setIsListening(!isListening);
  };

  const numberOfWaves = 3; // Número de ondas
  const waveAnimation = {
    initial: { scale: 0, opacity: 0.6 },
    animate: { scale: 2, opacity: 0 },
    transition: {
      duration: 1.5,
      repeat: Infinity,
      repeatDelay: 0.2,
    },
  };

  return (
    <div className="flex flex-col items-center justify-center h-full relative overflow-hidden">
      {/* Ondas sonoras */}
      {isListening && Array.from({ length: numberOfWaves }).map((_, index) => (
        <motion.div
          key={index}
          className="absolute rounded-full bg-blue-300 opacity-50"
          style={{ width: 48, height: 48 }}
          initial="initial"
          animate="animate"
          variants={waveAnimation}
          transition={{ ...waveAnimation.transition, delay: index * 0.5 }} // Adiciona um pequeno delay entre as ondas
        />
      ))}

      {/* Glass sphere effect */}
      <motion.div
        className="relative flex items-center justify-center w-48 h-48 rounded-full"
        style={{
          background: 'radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.5) 30%, rgba(255, 255, 255, 0.2) 70%, rgba(255, 255, 255, 0) 100%)',
          backdropFilter: 'blur(15px)',
          WebkitBackdropFilter: 'blur(15px)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)', // Sombra suave
          border: '1px solid rgba(255, 255, 255, 0.3)', // Borda sutil
          // Efeito 3D sutil com gradiente interno
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.3) 0%, transparent 60%)',
        }}
        animate={{
          scale: isListening ? [1, 1.05, 1] : 1
        }}
        transition={{
          repeat: isListening ? Infinity : 0,
          duration: 1.5
        }}
      >
        {/* Brilho sutil */}
        <motion.div
          className="absolute inset-0 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle at top left, rgba(255, 255, 255, 0.7) 0%, transparent 40%)',
            pointerEvents: 'none', // Para não interferir nos cliques
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
          className="z-10 w-full h-full rounded-full bg-transparent" // Fundo transparente para o botão
        />
      </motion.div>

      {/* Mode toggle button */}
      <div className="absolute bottom-20 left-0 right-0 flex justify-center">
        <motion.button
          onClick={toggleListening}
          className="p-4 rounded-full backdrop-blur-md bg-white/80 shadow-md border border-gray-300"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
          }}
        >
          <Mic size={24} className="text-gray-800" />
        </motion.button>
      </div>

      <p className="mt-8 text-black">
        {isListening
          ? 'Ouvindo... Toque para parar'
          : 'Toque para fazer uma pergunta'}
      </p>
    </div>
  );
};

export default VoiceRecorder;
