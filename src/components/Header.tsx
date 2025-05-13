import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, List } from 'lucide-react';
import { motion } from 'framer-motion';

interface HeaderProps {
    title: string;
    showBackButton?: boolean;
    onOpenMemoryHistory?: () => void;
    mensagemDeSucesso?: string | null; // Nova prop para receber a mensagem
}

const Header: React.FC<HeaderProps> = ({ title, showBackButton = false, onOpenMemoryHistory, mensagemDeSucesso }) => {
    const navigate = useNavigate();

    return (
        <header className="px-6 py-4 flex items-center border-b border-gray-100">
            <div className="flex items-center">
                {onOpenMemoryHistory && (
                    <button
                        onClick={onOpenMemoryHistory}
                        className="mr-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
                        aria-label="Ver histórico de memórias"
                    >
                        <List size={24} />
                    </button>
                )}
                {showBackButton && (
                    <button
                        onClick={() => navigate(-1)}
                        className={onOpenMemoryHistory ? "mr-4 p-1 rounded-full hover:bg-gray-100 transition-colors" : "p-1 rounded-full hover:bg-gray-100 transition-colors"}
                        aria-label="Voltar"
                    >
                        <ArrowLeft size={24} />
                    </button>
                )}
                <h1 className="text-2xl font-semibold text-center flex-1">{title}</h1>
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
            </div>
            {!onOpenMemoryHistory && !showBackButton && <div className="w-6 h-6" />}
        </header>
    );
};

export default Header;
