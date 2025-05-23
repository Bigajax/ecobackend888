import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react'; // Certifique-se que o ícone é este

interface MemoryButtonProps {
  onClick: () => void;
  className?: string;
}

const MemoryButton: React.FC<MemoryButtonProps> = ({ onClick, className }) => {
  return (
    <motion.button
      type="button" // Importante: Garante que não é um submit de formulário
      onClick={onClick} // Agora apenas chama a função onClick que vem das props
      className={`p-4 rounded-full bg-white/90 backdrop-blur-md shadow-md border border-gray-300 ${className}`}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      aria-label="Salvar memória ou ver histórico" // Adicione uma descrição acessível
    >
      <BookOpen size={30} className="text-black" />
    </motion.button>
  );
};

export default MemoryButton;