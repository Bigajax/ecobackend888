import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PhoneFrame from '../components/PhoneFrame';
import { useAuth } from '../contexts/AuthContext';
import { buscarMemoriasPorUsuario, Memoria } from '../api/memoriaApi';
import { buscarPerfilEmocional } from '../api/perfilApi';

const MemoryPage: React.FC = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'memories' | 'profile'>('profile');
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

  const renderBar = (label: string, value: number, total: number) => {
    const percent = (value / total) * 100;
    return (
      <div className="mb-3">
        <div className="flex justify-between text-xs text-neutral-600 mb-1">
          <span>{label}</span>
          <span>{value}</span>
        </div>
        <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-pink-400 rounded-full"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  };

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
            {activeTab === 'profile' && perfil && (
              <div className="bg-white/80 border border-neutral-200 p-4 rounded-3xl shadow-lg">
                <h3 className="text-lg font-light mb-2 text-neutral-800">Resumo Geral</h3>
                <p className="text-neutral-700 mb-6 text-sm leading-relaxed whitespace-pre-line">
                  {perfil.resumo_geral_ia || 'Nenhum resumo disponível.'}
                </p>

                <div className="mb-6">
                  <h4 className="font-semibold text-neutral-700 text-sm mb-3">Emoções Frequentes</h4>
                  {Object.entries(perfil.emocoes_frequentes || {}).length > 0 ? (
                    Object.entries(perfil.emocoes_frequentes).map(([emo, count]) =>
                      renderBar(emo, Number(count), perfil.total_emocoes || 100)
                    )
                  ) : (
                    <p className="text-neutral-500 text-sm">Nenhum dado emocional encontrado.</p>
                  )}
                </div>

                <div className="mb-6">
                  <h4 className="font-semibold text-neutral-700 text-sm mb-3">Temas/Padrões Recorrentes</h4>
                  {Object.entries(perfil.temas_recorrentes || {}).length > 0 ? (
                    Object.entries(perfil.temas_recorrentes).map(([tema, count]) =>
                      renderBar(tema, Number(count), perfil.total_temas || 100)
                    )
                  ) : (
                    <p className="text-neutral-500 text-sm">Nenhum padrão recorrente identificado.</p>
                  )}
                </div>

                <p className="text-xs text-neutral-500">
                  Última interação significativa:{' '}
                  {perfil.ultima_interacao_sig
                    ? new Date(perfil.ultima_interacao_sig).toLocaleDateString()
                    : 'Indisponível'}
                </p>
              </div>
            )}

            {activeTab === 'memories' && (
              <p className="text-center text-neutral-500 mt-10 text-sm">
                (Em breve) Exibição interativa das suas memórias 🌱
              </p>
            )}
          </>
        )}
      </div>
    </PhoneFrame>
  );
};

export default MemoryPage;
