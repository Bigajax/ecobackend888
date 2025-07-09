import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  onOpenMemoryHistory?: () => void;
  mensagemDeSucesso?: string | null;
  onLogout?: () => void;
}

const Header: React.FC<HeaderProps> = ({
  title,
  showBackButton = false,
  onOpenMemoryHistory,
  mensagemDeSucesso,
  onLogout
}) => {
  const navigate = useNavigate();

  const handleMemoryClick = () => {
    console.log('Cliquei no botão de memória');
    if (onOpenMemoryHistory) {
      onOpenMemoryHistory();
    }
  };

  return (
    <header className="px-6 py-4 flex items-center border-b border-gray-100 justify-center relative z-10 bg-white/90 backdrop-blur-md shadow-sm">
      <div className="flex items-center absolute left-6">
        <button
          onClick={handleMemoryClick}
          className="mr-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Ver histórico de memórias"
          title="Ver Memórias"
        >
          <BookOpen size={24} strokeWidth={2} className="text-gray-700" />
        </button>
        {showBackButton && (
          <button
            onClick={() => navigate(-1)}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft size={24} className="text-gray-700" />
          </button>
        )}
      </div>
      <h1 className="text-2xl md:text-3xl font-light tracking-tight text-gray-483">Eco</h1>
      <div className="flex items-center absolute right-6">
        <AnimatePresence>
          {mensagemDeSucesso && (
            <motion.span
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="ml-4 text-green-500 font-semibold"
            >
              {mensagemDeSucesso}
            </motion.span>
          )}
        </AnimatePresence>
        {onLogout && (
          <button
            onClick={onLogout}
            className="ml-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Sair da conta"
            title="Sair da conta"
          >
            <LogOut size={24} className="text-gray-700" />
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
