import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MemoryButtonProps {
  onClick: () => void;
  className?: string; // Prop para estilos adicionais, se necessário
}

const MemoryButton: React.FC<MemoryButtonProps> = ({ onClick, className }) => {
  return (
    <motion.button
      onClick={onClick}
      className={`p-4 rounded-full bg-white/90 backdrop-blur-md shadow-md border border-gray-300 ${className}`}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
    >
      <BookOpen size={30} className="text-black" />
    </motion.button>
  );
};

export default MemoryButton;
