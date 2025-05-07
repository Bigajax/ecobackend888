import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MemoryButtonProps {
  onClick: () => void;
  className?: string;
}

const MemoryButton: React.FC<MemoryButtonProps> = ({ onClick, className }) => {
  const navigate = useNavigate();

  const handleNavigation = () => {
    onClick(); // Execute a função onClick passada
    navigate('/memory'); // Navegue para a página de memória
  };

  return (
    <motion.button
      onClick={handleNavigation}
      className={`p-4 rounded-full bg-white/90 backdrop-blur-md shadow-md border border-gray-300 ${className}`}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
    >
      <BookOpen size={30} className="text-black" />
    </motion.button>
  );
};

export default MemoryButton;
