import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PhoneFrame from '../components/PhoneFrame';
import { useAuth } from '../contexts/AuthContext';
import { buscarMemoriasPorUsuario } from '../api/memoria';

interface EmotionalMemory {
  resumo_eco: string;
  emocao_principal: string;
  data_registro?: string;
}

const emotionColors: Record<string, string> = {
  alegria: "from-yellow-100 to-yellow-300",
  calma: "from-blue-100 to-blue-300",
  tristeza: "from-gray-200 to-gray-400",
  incerteza: "from-purple-100 to-purple-300",
  raiva: "from-red-100 to-red-300",
  medo: "from-indigo-100 to-indigo-300",
};

const MemoryPage: React.FC = () => {
  const [memories, setMemories] = useState<EmotionalMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const carregarMemorias = async () => {
      if (user?.id) {
        setLoading(true);
        setError(null);
        try {
          const data = await buscarMemoriasPorUsuario(user.id);
          setMemories(data as EmotionalMemory[]);
        } catch (err: any) {
          console.error("Erro ao buscar memórias:", err.message);
          setError("Ocorreu um erro ao carregar as memórias.");
        } finally {
          setLoading(false);
        }
      }
    };

    carregarMemorias();
  }, [user?.id]);

  const handleBack = () => {
    navigate('/chat');
  };

  if (loading) {
    return (
      <PhoneFrame className="flex flex-col h-full bg-gradient-to-br from-white via-purple-50 to-pink-50">
        <div className="flex items-center p-4">
          <button onClick={handleBack} className="text-black">
            <ArrowLeft size={28} />
          </button>
          <h2 className="text-xl font-semibold ml-4">Minhas Memórias</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Carregando memórias...</p>
        </div>
      </PhoneFrame>
    );
  }

  if (error) {
    return (
      <PhoneFrame className="flex flex-col h-full bg-gradient-to-br from-white via-purple-50 to-pink-50">
        <div className="flex items-center p-4">
          <button onClick={handleBack} className="text-black">
            <ArrowLeft size={28} />
          </button>
          <h2 className="text-xl font-semibold ml-4">Minhas Memórias</h2>
        </div>
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <p className="text-red-500">{error}</p>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame className="flex flex-col h-full bg-gradient-to-br from-white via-purple-50 to-pink-50">
      <div className="flex items-center p-4">
        <button onClick={handleBack} className="text-black">
          <ArrowLeft size={28} />
        </button>
        <h2 className="text-xl font-semibold ml-4">Minhas Memórias</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {memories.length === 0 ? (
          <p className="text-center text-gray-500 mt-10">Nenhuma memória salva ainda.</p>
        ) : (
          memories.map((mem, index) => (
            <motion.div
              key={index}
              className={`rounded-xl p-4 mb-4 shadow-md bg-gradient-to-br ${emotionColors[mem.emocao_principal] || 'from-gray-100 to-gray-300'}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              {mem.data_registro && <p className="text-sm text-gray-700 mb-1">{new Date(mem.data_registro).toLocaleDateString()}</p>}
              <p className="text-black text-base">{mem.resumo_eco}</p>
              <span className="text-sm text-gray-600 italic">Emoção: {mem.emocao_principal}</span>
            </motion.div>
          ))
        )}
      </div>
    </PhoneFrame>
  );
};

export default MemoryPage;