import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PhoneFrame from '../components/PhoneFrame';
import { useAuth } from '../contexts/AuthContext';
import { buscarMemoriasPorUsuario, Memoria } from '../api/memoriaApi';
import { buscarPerfilEmocional } from '../api/perfilApi';

const tagColors: Record<string, string> = {
  'silêncio': 'bg-white text-neutral-500 border border-neutral-200',
  'peso': 'bg-neutral-300 text-neutral-700',
  'desconexão': 'bg-blue-100 text-blue-800',
  'desânimo': 'bg-gray-200 text-gray-700',
  'perda de sentido': 'bg-slate-100 text-slate-600',
  'perda de cor': 'bg-purple-100 text-purple-800',
  'distanciamento': 'bg-purple-200 text-purple-900'
};

const formatDateToHuman = (dateStr: string) => {
  const date = new Date(dateStr);
  const diff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return `${diff} dias atrás`;
};

const MemoryPage: React.FC = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'memories' | 'profile'>('memories');
  const [memories, setMemories] = useState<Memoria[]>([]);
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const carregarDados = async () => {
      if (!userId) return;

      setLoading(true);
      setError(null);

      try {
        const memData = await buscarMemoriasPorUsuario(userId);
        const memFiltradas = memData.filter(
          mem => mem.salvar_memoria === true || mem.salvar_memoria === 'true'
        );
        setMemories(memFiltradas);

        try {
          const perfilData = await buscarPerfilEmocional(userId);
          setPerfil(perfilData);
        } catch {
          setPerfil(null);
        }
      } catch (err: any) {
        setError('Erro ao carregar dados.');
      } finally {
        setLoading(false);
      }
    };

    carregarDados();
  }, [userId]);

  const handleBack = () => navigate('/chat');

  return (
    <PhoneFrame className="flex flex-col h-full bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="flex items-center p-4">
        <button onClick={handleBack} className="text-neutral-700 hover:text-black">
          <ArrowLeft size={28} />
        </button>
        <h2 className="text-xl font-light ml-4 text-neutral-800">
          {activeTab === 'memories' ? 'Minhas Memórias' : 'Meu Perfil Emocional'}
        </h2>
      </div>

      <div className="flex space-x-2 px-4 mb-2">
        <button
          className={`flex-1 px-3 py-2 rounded-full text-sm font-medium transition ${
            activeTab === 'memories' ? 'bg-black text-white' : 'bg-white/70 text-neutral-700'
          }`}
          onClick={() => setActiveTab('memories')}
        >
          Memórias
        </button>
        <button
          className={`flex-1 px-3 py-2 rounded-full text-sm font-medium transition ${
            activeTab === 'profile' ? 'bg-black text-white' : 'bg-white/70 text-neutral-700'
          }`}
          onClick={() => setActiveTab('profile')}
        >
          Perfil Emocional
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <p className="text-neutral-500 text-sm">Carregando...</p>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center h-full">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        ) : (
          <>
            {activeTab === 'memories' &&
              (memories.length === 0 ? (
                <p className="text-center text-neutral-500 mt-10 text-sm">Nenhuma memória salva ainda.</p>
              ) : (
                memories.map((mem, index) => (
                  <motion.div
                    key={mem.id}
                    className="backdrop-blur bg-white/80 border border-neutral-200 p-4 mb-4 rounded-3xl shadow-lg hover:shadow-xl transition-all"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-base font-semibold text-neutral-800">
                        {mem.emocao_principal || 'Memória'}
                      </h3>
                      {mem.data_registro && (
                        <span className="text-xs text-neutral-500">
                          {formatDateToHuman(mem.data_registro)}
                        </span>
                      )}
                    </div>

                    <p className="text-neutral-700 text-sm mb-2">
                      {mem.resumo_eco || 'Sem descrição disponível.'}
                    </p>

                    {Array.isArray(mem.tags) && mem.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {mem.tags.map((tag: string, tagIndex: number) => {
                          const baseTag = tag.toLowerCase();
                          const colorClass = tagColors[baseTag] || 'bg-purple-100 text-purple-800';
                          return (
                            <span
                              key={tagIndex}
                              className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${colorClass}`}
                            >
                              {tag.trim()}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                ))
              ))}

            {activeTab === 'profile' &&
              (perfil ? (
                <div className="bg-white/80 border border-neutral-200 p-4 rounded-3xl shadow-lg">
                  <h3 className="text-lg font-light mb-2 text-neutral-800">Resumo Geral</h3>
                  <p className="text-neutral-700 mb-4 text-sm">
                    {perfil.resumo_geral_ia || 'Nenhum resumo disponível.'}
                  </p>

                  <div className="mb-4">
                    <h4 className="font-semibold text-neutral-700 text-sm">Emoções Frequentes</h4>
                    <ul className="list-disc ml-5 text-sm text-neutral-600">
                      {Object.entries(perfil.emocoes_frequentes || {}).length > 0 ? (
                        Object.entries(perfil.emocoes_frequentes).map(([emo, count]) => (
                          <li key={emo}>{emo}: {count}</li>
                        ))
                      ) : (
                        <li>Nenhum dado emocional encontrado.</li>
                      )}
                    </ul>
                  </div>

                  <div className="mb-4">
                    <h4 className="font-semibold text-neutral-700 text-sm">Temas/Padrões Recorrentes</h4>
                    <ul className="list-disc ml-5 text-sm text-neutral-600">
                      {Object.entries(perfil.temas_recorrentes || {}).length > 0 ? (
                        Object.entries(perfil.temas_recorrentes).map(([tema, count]) => (
                          <li key={tema}>{tema}: {count}</li>
                        ))
                      ) : (
                        <li>Nenhum padrão recorrente identificado.</li>
                      )}
                    </ul>
                  </div>

                  <p className="text-xs text-neutral-500">
                    Última interação significativa:{' '}
                    {perfil.ultima_interacao_sig
                      ? new Date(perfil.ultima_interacao_sig).toLocaleDateString()
                      : 'Indisponível'}
                  </p>
                </div>
              ) : (
                <p className="text-center text-neutral-500 mt-10 text-sm">
                  Nenhum perfil emocional foi gerado ainda. Interaja mais com a Eco para que possamos criar um para você 🌱
                </p>
              ))}
          </>
        )}
      </div>
    </PhoneFrame>
  );
};

export default MemoryPage;
