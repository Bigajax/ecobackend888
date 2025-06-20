import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PhoneFrame from '../components/PhoneFrame';
import { useAuth } from '../contexts/AuthContext';
import { buscarMemoriasPorUsuario, Memoria } from '../api/memoriaApi';
import { buscarPerfilEmocional } from '../api/perfilApi';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from 'recharts';

const EMOTION_COLORS = [
  '#fbcfe8', '#a78bfa', '#fcd34d', '#6ee7b7', '#38bdf8', '#fda4af', '#fdba74', '#bbf7d0',
];

const humanDate = (raw: string) => {
  const diff = Math.floor((Date.now() - new Date(raw).getTime()) / 86400000);
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
  const [verMais, setVerMais] = useState(false);

  useEffect(() => {
    const carregar = async () => {
      if (!userId) return;
      setLoading(true);
      try {
        const memData = await buscarMemoriasPorUsuario(userId);
        setMemories(memData.filter(m => m.salvar_memoria === true || m.salvar_memoria === 'true'));
        setPerfil(await buscarPerfilEmocional(userId));
      } catch (e) {
        setError('Erro ao carregar dados.');
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, [userId]);

  const emotionChart = useMemo(() => {
    if (!perfil?.emocoes_frequentes) return [];
    return Object.entries(perfil.emocoes_frequentes)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [perfil]);

  const themeChart = useMemo(() => {
    if (!perfil?.temas_recorrentes) return [];
    return Object.entries(perfil.temas_recorrentes)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [perfil]);

  const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-6 p-4 rounded-3xl border border-neutral-200 bg-white/80 backdrop-blur shadow-md"
    >
      <h4 className="text-base font-semibold text-neutral-800 mb-3 tracking-tight">{title}</h4>
      {children}
    </motion.div>
  );

  return (
    <PhoneFrame className="flex flex-col h-full bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="flex items-center p-4">
        <button onClick={() => navigate('/chat')} className="text-neutral-700 hover:text-black">
          <ArrowLeft size={28} />
        </button>
        <h2 className="text-xl font-semibold ml-4 text-neutral-900 tracking-tight">
          {activeTab === 'memories' ? 'Minhas Memórias' : 'Meu Perfil Emocional'}
        </h2>
      </div>

      <div className="flex space-x-2 px-4 mb-2">
        {(['memories', 'profile'] as const).map(tab => (
          <button
            key={tab}
            className={`flex-1 px-3 py-2 rounded-full text-sm font-medium transition ${
              activeTab === tab ? 'bg-black text-white' : 'bg-white/70 text-neutral-700'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'memories' ? 'Memórias' : 'Perfil Emocional'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading ? (
          <div className="flex justify-center items-center h-full text-neutral-500 text-sm">Carregando…</div>
        ) : error ? (
          <div className="flex justify-center items-center h-full text-red-500 text-sm">{error}</div>
        ) : (
          <>
            {activeTab === 'memories' && (
              memories.length === 0 ? (
                <p className="text-center text-neutral-500 mt-10 text-sm">Nenhuma memória salva ainda.</p>
              ) : (
                memories.map((m, i) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="mb-4 p-4 rounded-3xl border border-neutral-200 bg-white/80 shadow-md hover:shadow-xl backdrop-blur"
                  >
                    <div className="flex justify-between mb-2 text-sm font-medium text-neutral-700">
                      <span>{m.emocao_principal || 'Memória'}</span>
                      <span className="text-neutral-500">{m.data_registro ? humanDate(m.data_registro) : ''}</span>
                    </div>
                    <p className="text-neutral-700 text-sm mb-2 leading-relaxed whitespace-pre-line">
                      {m.resumo_eco}
                    </p>
                    {Array.isArray(m.tags) && m.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {m.tags.map(t => (
                          <span
                            key={t}
                            className="px-3 py-1 text-xs rounded-full bg-purple-100 text-purple-800"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))
              )
            )}

            {activeTab === 'profile' && (
              perfil ? (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="mb-6 p-4 rounded-3xl shadow-md border border-neutral-200 bg-white/80 backdrop-blur"
                  >
                    <h3 className="text-base font-semibold text-neutral-800 mb-2">Resumo Geral</h3>
                    <p className="text-neutral-700 text-sm leading-relaxed whitespace-pre-line">
                      {verMais
                        ? perfil.resumo_geral_ia
                        : perfil.resumo_geral_ia?.slice(0, 300) + '...'}
                    </p>
                    {!verMais && (
                      <button
                        onClick={() => setVerMais(true)}
                        className="mt-2 text-sm text-blue-500 hover:underline"
                      >
                        Ver mais
                      </button>
                    )}
                  </motion.div>

                  <ChartCard title="Emoções Frequentes (top 8)">
                    <div className="h-64 w-full">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={emotionChart}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={40}
                            outerRadius={80}
                            paddingAngle={2}
                          >
                            {emotionChart.map((_, idx) => (
                              <Cell key={`cell-${idx}`} fill={EMOTION_COLORS[idx % EMOTION_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val: any) => `${val}×`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>

                  <ChartCard title="Temas Recorrentes (top 8)">
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={themeChart} layout="vertical" margin={{ left: 24 }}>
                          <XAxis type="number" hide domain={[0, 'dataMax']} />
                          <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                          <Bar dataKey="value" radius={[4, 4, 4, 4]} fill="#c084fc" />
                          <Tooltip formatter={(val: any) => `${val}×`} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>

                  <p className="text-xs text-neutral-500 text-center">
                    Última interação significativa:{' '}
                    {perfil.ultima_interacao_sig
                      ? new Date(perfil.ultima_interacao_sig).toLocaleDateString()
                      : 'Indisponível'}
                  </p>
                </>
              ) : (
                <p className="text-center text-neutral-500 mt-10 text-sm">
                  Nenhum perfil emocional foi gerado ainda. Interaja mais com a Eco para criarmos um 🌱
                </p>
              )
            )}
          </>
        )}
      </div>
    </PhoneFrame>
  );
};

export default MemoryPage;
