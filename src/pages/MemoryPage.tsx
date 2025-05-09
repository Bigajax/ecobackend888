import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PhoneFrame from '../components/PhoneFrame';

interface EmotionalMemory {
  memoria: string;
  emocao: string;
  data?: string;
}

const mockMemories: EmotionalMemory[] = [
  {
    memoria: "Você estava se sentindo animado com um novo projeto.",
    emocao: "alegria",
    data: "2025-05-08",
  },
  {
    memoria: "Houve um momento de reflexão sobre seus objetivos.",
    emocao: "calma",
    data: "2025-05-06",
  },
  {
    memoria: "Você ficou em dúvida se está no caminho certo.",
    emocao: "incerteza",
    data: "2025-05-03",
  },
];

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
  const navigate = useNavigate();

  useEffect(() => {
    // Aqui você pode futuramente buscar as memórias do banco
    setMemories(mockMemories);
  }, []);

  const handleBack = () => {
    navigate('/chat');
  };

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
              className={`rounded-xl p-4 mb-4 shadow-md bg-gradient-to-br ${emotionColors[mem.emocao] || 'from-gray-100 to-gray-300'}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <p className="text-sm text-gray-700 mb-1">{mem.data}</p>
              <p className="text-black text-base">{mem.memoria}</p>
              <span className="text-sm text-gray-600 italic">Emoção: {mem.emocao}</span>
            </motion.div>
          ))
        )}
      </div>
    </PhoneFrame>
  );
};

export default MemoryPage;
