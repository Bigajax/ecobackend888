import React, { useState, useEffect, useCallback } from 'react';
import { buscarMemorias } from '../api/memoria';
import { motion, AnimatePresence } from 'framer-motion';
import { XCircle } from 'lucide-react';
import { cn } from "@/lib/utils"

interface TelaDeHistoricoDeMemoriasProps {
  onClose: () => void;
}

interface Memoria {
  id: string;
  usuario_id: string;
  mensagem_id: string;
  resumo_eco: string;
  emocao_principal?: string | null;
  intensidade?: number | null;
  contexto?: string | null;
  salvar_memoria: boolean;
  data_registro: string;
}

const TelaDeHistoricoDeMemorias: React.FC<TelaDeHistoricoDeMemoriasProps> = ({ onClose }) => {
  const [memorias, setMemorias] = useState<Memoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carrega as memórias
    const carregarMemorias = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await buscarMemorias();
            setMemorias(data);
        } catch (err: any) {
            setError('Erro ao carregar o histórico de memórias.');
            console.error('Erro ao buscar memórias:', err);
        } finally {
            setLoading(false);
        }
    }, []);


  useEffect(() => {
    carregarMemorias();
  }, [carregarMemorias]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <p>Carregando histórico de memórias...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <p className="text-red-500">Erro: {error}</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-100 rounded-md hover:bg-gray-200">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      transition={{ duration: 0.3 }}
      className="fixed top-0 left-0 w-full h-full bg-black/50 z-50 overflow-y-auto flex justify-start"
    >
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        className="bg-gray-900 text-white w-full max-w-md h-full p-4 shadow-lg rounded-r-lg flex flex-col"
      >
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-semibold">Histórico de Memórias</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-700 text-gray-400"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {memorias.length > 0 ? (
            <ul className="space-y-3">
              <AnimatePresence>
                {memorias.map((memoria) => (
                  <motion.li
                    key={memoria.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="bg-gray-800 rounded-md p-3 border border-gray-700"
                  >
                    <p className="text-sm">{memoria.resumo_eco}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(memoria.data_registro).toLocaleDateString()} {new Date(memoria.data_registro).toLocaleTimeString()}
                    </p>
                    {memoria.emocao_principal && (
                      <p className="text-xs text-gray-400">
                        Emoção: {memoria.emocao_principal}
                      </p>
                    )}
                    {memoria.intensidade && (
                      <p className="text-xs text-gray-400">
                        Intensidade: {memoria.intensidade}
                      </p>
                    )}
                    {memoria.contexto && (
                      <p className="text-xs text-gray-400">
                        Contexto: {memoria.contexto}
                      </p>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="text-gray-400">Nenhuma memória salva ainda.</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TelaDeHistoricoDeMemorias;
