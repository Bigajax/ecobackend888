import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PhoneFrame from '../components/PhoneFrame';
import { useAuth } from '../contexts/AuthContext';
import { buscarMemoriasPorUsuario, Memoria } from '../api/memoriaApi';
import { buscarPerfilEmocional } from '../api/perfilApi';

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'memories' | 'profile'>('memories');

  const [memories, setMemories] = useState<Memoria[]>([]);
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const carregarDados = async () => {
      if (user?.id) {
        setLoading(true);
        setError(null);
        try {
          const memData = await buscarMemoriasPorUsuario(user.id);
          setMemories(memData);

          const perfilData = await buscarPerfilEmocional(user.id);
          setPerfil(perfilData);
        } catch (err: any) {
          console.error('Erro ao carregar dados:', err);
          setError('Erro ao carregar dados.');
        } finally {
          setLoading(false);
        }
      }
    };
    carregarDados();
  }, [user?.id]);

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
            {activeTab === 'memories' && (
              memories.length === 0 ? (
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
                      <span className="text-lg font-light text-neutral-800">
                        {emotionIcons[mem.emocao_principal || ''] || '📝'} {mem.rotulo || mem.emocao_principal || 'Sem rótulo'}
                      </span>
                      {mem.data_registro && (
                        <span className="text-xs text-neutral-500">{formatDateToHuman(mem.data_registro)}</span>
                      )}
                    </div>

                    <p className="text-neutral-700 mb-2 leading-relaxed text-sm">{mem.resumo_eco}</p>

                    <div className="text-xs text-neutral-600 space-y-1">
                      {mem.intensidade !== null && (
                        <p><span className="font-semibold">Intensidade:</span> {mem.intensidade}</p>
                      )}
                      {mem.dominio_vida && (
                        <p><span className="font-semibold">Domínio:</span> {mem.dominio_vida}</p>
                      )}
                      {mem.padrao_comportamental && (
                        <p><span className="font-semibold">Padrão:</span> {mem.padrao_comportamental}</p>
                      )}
                    </div>

                    {mem.categoria && typeof mem.categoria === 'string' && mem.categoria.length > 0 && (
                      <div className="flex flex-wrap items-center mt-2">
                        {mem.categoria.split(',').map((tag: string, tagIndex: number) => (
                          <span
                            key={tagIndex}
                            className="inline-block bg-neutral-200 text-neutral-700 rounded-full px-3 py-1 text-xs font-medium mr-2 mb-2"
                          >
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))
              )
            )}

            {activeTab === 'profile' && perfil && (
              <div className="bg-white/80 border border-neutral-200 p-4 rounded-3xl shadow-lg">
                <h3 className="text-lg font-light mb-2 text-neutral-800">Resumo Geral</h3>
                <p className="text-neutral-700 mb-4 text-sm">{perfil.resumo_geral_ia || 'Nenhum resumo disponível.'}</p>

                <div className="mb-4">
                  <h4 className="font-semibold text-neutral-700 text-sm">Emoções Frequentes</h4>
                  <ul className="list-disc ml-5 text-sm text-neutral-600">
                    {Object.entries(perfil.emocoes_frequentes || {}).map(([emo, count]) => (
                      <li key={emo}>{emo}: {count}</li>
                    ))}
                  </ul>
                </div>

                <div className="mb-4">
                  <h4 className="font-semibold text-neutral-700 text-sm">Temas/Padrões Recorrentes</h4>
                  <ul className="list-disc ml-5 text-sm text-neutral-600">
                    {Object.entries(perfil.temas_recorrentes || {}).map(([tema, count]) => (
                      <li key={tema}>{tema}: {count}</li>
                    ))}
                  </ul>
                </div>

                <p className="text-xs text-neutral-500">
                  Última interação significativa:{' '}
                  {new Date(perfil.ultima_interacao_significativa).toLocaleDateString()}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </PhoneFrame>
  );
};

export default MemoryPage;
