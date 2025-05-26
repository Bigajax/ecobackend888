import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react'; // Importe LogOut aqui
import { motion, AnimatePresence } from 'framer-motion';
import TwoLinesIcon from './TwoLinesIcon'; // Importe o componente SVG (ajuste o caminho se necessário)

interface HeaderProps {
    title: string;
    showBackButton?: boolean;
    onOpenMemoryHistory?: () => void;
    mensagemDeSucesso?: string | null;
    onLogout?: () => void; // <--- NOVA PROP: Função para lidar com o logout
}

const Header: React.FC<HeaderProps> = ({
    title,
    showBackButton = false,
    onOpenMemoryHistory,
    mensagemDeSucesso,
    onLogout // <--- RECEBENDO A PROP
}) => {
    const navigate = useNavigate();

    return (
        <header className="px-6 py-4 flex items-center border-b border-gray-100 justify-center relative z-10 bg-white/90 backdrop-blur-md shadow-sm">
            <div className="flex items-center absolute left-6">
                {onOpenMemoryHistory && (
                    <button
                        onClick={onOpenMemoryHistory}
                        className="mr-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
                        aria-label="Ver histórico de memórias"
                        title="Ver Memórias"
                    >
                        <TwoLinesIcon size={24} strokeWidth={3} />
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
            </div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <div className="flex items-center absolute right-6"> {/* Este é o container dos elementos à direita */}
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

                {onLogout && ( // <--- Adicione o botão de logout aqui, no mesmo div do lado direito
                    <button
                        onClick={onLogout}
                        className="ml-4 p-1 rounded-full hover:bg-gray-100 transition-colors" // Adicionado ml-4 para espaçamento
                        aria-label="Sair da conta"
                        title="Sair da conta"
                    >
                        <LogOut size={24} className="text-gray-700" /> {/* Ícone de logout */}
                    </button>
                )}
            </div>
        </header>
    );
};

export default Header;