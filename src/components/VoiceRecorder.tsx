import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const VoiceRecorder: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const navigate = useNavigate();

  const toggleListening = () => {
    setIsListening(!isListening);
  };

  const goToMemoryPage = () => {
    navigate('/memory');
  };

  return (
    <div className="flex flex-col items-center justify-center h-full relative">
      {/* Glass sphere effect */}
      <motion.div
        className="relative flex items-center justify-center w-48 h-48 rounded-full"
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
        <div className="absolute bottom-32 left-0 right-0 flex justify-center space-x-4">  {/* Ajustei o valor de bottom para 32 */}
            <motion.button
            onClick={goToMemoryPage}
            className="p-4 rounded-full bg-white/90 backdrop-blur-md shadow-md border border-gray-300"
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

      <p className="mt-8 text-gray-800 text-center"> {/* Aumentei o marginTop para espaçamento */}
        {isListening ? 'Ouvindo... Toque para parar' : 'Toque para fazer uma pergunta'}
      </p>
    </div>
  );
};

export default VoiceRecorder;
