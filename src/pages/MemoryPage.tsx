import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PhoneFrame from '../components/PhoneFrame';
import { useAuth } from '../contexts/AuthContext';
import { buscarMemoriasPorUsuario, Memoria } from '../api/memoria';

const emotionColors: Record<string, string> = {
  alegria: 'bg-yellow-100 border-yellow-300',
  calma: 'bg-blue-100 border-blue-300',
  tristeza: 'bg-gray-200 border-gray-400',
  incerteza: 'bg-purple-100 border-purple-300',
  raiva: 'bg-red-100 border-red-300',
  medo: 'bg-indigo-100 border-indigo-300',
};

const emotionIcons: Record<string, string> = {
  alegria: '😊',
  calma: '🌿',
  tristeza: '😢',
  incerteza: '🤔',
  raiva: '😡',
  medo: '😨',
};

const formatDateToHuman = (dateStr: string) => {
  const date = new Date(dateStr);
  const diff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return `${diff} dias atrás`;
};

const MemoryPage: React.FC = () => {
  const [memories, setMemories] = useState<Memoria[]>([]);
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
          setMemories(data);
        } catch (err: any) {
          console.error('Erro ao buscar memórias:', err.message);
          setError('Ocorreu um erro ao carregar as memórias.');
        } finally {
          setLoading(false);
        }
      }
    };
    carregarMemorias();
  }, [user?.id]);

  const handleBack = () => navigate('/chat');

  return (
    <PhoneFrame className="flex flex-col h-full bg-gradient-to-br from-white via-purple-50 to-pink-50">
      <div className="flex items-center p-4">
        <button onClick={handleBack} className="text-black">
          <ArrowLeft size={28} />
        </button>
        <h2 className="text-xl font-semibold ml-4">Minhas Memórias</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <p className="text-gray-500">Carregando memórias...</p>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center h-full">
            <p className="text-red-500">{error}</p>
          </div>
        ) : memories.length === 0 ? (
          <p className="text-center text-gray-500 mt-10">Nenhuma memória salva ainda.</p>
        ) : (
          memories.map((mem, index) => (
            <motion.div
              key={mem.id}
              className={`backdrop-blur-md bg-white/60 border p-4 mb-4 rounded-2xl shadow hover:shadow-lg transition-all ${emotionColors[mem.emocao_principal || ''] || 'bg-gray-100 border-gray-300'}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg">
                  {emotionIcons[mem.emocao_principal || ''] || '📝'} {mem.emocao_principal}
                </span>
                {mem.data_registro && (
                  <span className="text-sm text-gray-500">{formatDateToHuman(mem.data_registro)}</span>
                )}
              </div>
              <p className="text-gray-800 mb-2">{mem.resumo_eco}</p>
              {mem.intensidade !== null && (
                <p className="text-sm text-gray-600">Intensidade: {mem.intensidade}</p>
              )}
              {mem.categoria && mem.categoria.length > 0 && (
                <p className="text-sm text-gray-600">Categorias: {mem.categoria.join(', ')}</p>
              )}
            </motion.div>
          ))
        )}
      </div>
    </PhoneFrame>
  );
};

export default MemoryPage;
