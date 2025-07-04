import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PhoneFrame from '../components/PhoneFrame';
import { useAuth } from '../contexts/AuthContext';
import { buscarMemoriasPorUsuario, Memoria } from '../api/memoriaApi';
import { buscarPerfilEmocional } from '../api/perfilApi';
import { buscarRelatorioEmocional, RelatorioEmocional } from '../api/relatorioEmocionalApi';
import MapaEmocional2D from '../components/MapaEmocional2D';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// 🎨 Paleta pré-definida para emoções principais
const EMOTION_COLORS: Record<string, string> = {
  raiva: '#F4A261',
  alegria: '#E9C46A',
  calmo: '#2A9D8F',
  medo: '#264653',
  triste: '#A9D6E5',
  surpresa: '#F6BD60',
  antecipacao: '#F7E07D',
  irritado: '#E76F51'
};

// ⚡️ Função geradora de cor pastel consistente
const hashStringToHue = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
};

const generateConsistentPastelColor = (str: string) => {
  const hue = hashStringToHue(str);
  return `hsl(${hue}, 65%, 72%)`; // Mais vibrante e pastel ao mesmo tempo
};

const getEmotionColor = (name: string) => {
  const clean = name?.toLowerCase().trim();
  return EMOTION_COLORS[clean] || generateConsistentPastelColor(clean);
};

// Tooltip estilizado Apple-like
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          borderRadius: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(6px)',
          border: '1px solid #E5E7EB',
          padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          color: '#374151',
          fontSize: '0.85rem'
        }}
      >
        <div className="font-medium">{label}</div>
        <div>{payload[0].value}</div>
      </div>
    );
  }
  return null;
};

const humanDate = (raw: string) => {
  const date = new Date(raw);
  if (isNaN(date.getTime())) return '';
  const diff = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return `${diff} dias atrás`;
};

const clamp = (val: number, min = -1, max = 1) => Math.max(min, Math.min(max, val));

const MemoryPage: React.FC = () => {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'memories' | 'profile' | 'report'>('memories');
  const [memories, setMemories] = useState<Memoria[]>([]);
  const [perfil, setPerfil] = useState<any>(null);
  const [relatorio, setRelatorio] = useState<RelatorioEmocional | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const carregar = async () => {
      if (!userId) return;
      setLoading(true);
      try {
        const [memData, perfilData, relatorioData] = await Promise.all([
          buscarMemoriasPorUsuario(userId),
          buscarPerfilEmocional(userId),
          buscarRelatorioEmocional(userId)
        ]);
        setMemories(memData.filter(m => m.salvar_memoria === true || m.salvar_memoria === 'true'));
        setPerfil(perfilData);
        setRelatorio(relatorioData);
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
      .slice(0, 5);
  }, [perfil]);

  const themeChart = useMemo(() => {
    if (!perfil?.temas_recorrentes) return [];
    return Object.entries(perfil.temas_recorrentes)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [perfil]);

  const mapaEmocional2D = useMemo(() => {
    if (!Array.isArray(relatorio?.mapa_emocional)) return [];
    return relatorio.mapa_emocional
      .map(p => ({
        ...p,
        valencia: clamp(typeof p.valencia === 'number' ? p.valencia : p.x ?? 0),
        excitacao: clamp(typeof p.excitacao === 'number' ? p.excitacao : p.y ?? 0),
      }))
      .filter(p => typeof p.valencia === 'number' && typeof p.excitacao === 'number');
  }, [relatorio]);

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
          {{
            memories: 'Minhas Memórias',
            profile: 'Meu Perfil Emocional',
            report: 'Relatório Emocional',
          }[activeTab]}
        </h2>
      </div>

      <div className="flex space-x-2 px-4 mb-2">
        {(['memories', 'profile', 'report'] as const).map(tab => (
          <button
            key={tab}
            className={`flex-1 px-3 py-2 rounded-full text-sm font-medium transition ${
              activeTab === tab ? 'bg-black text-white' : 'bg-white/70 text-neutral-700'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {{
              memories: 'Memórias',
              profile: 'Perfil Emocional',
              report: 'Relatório',
            }[tab]}
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
              <>
                {memories.length > 0 ? (
                  <ul className="space-y-3">
                    {memories.map(mem => (
                      <li
                        key={mem.id}
                        className="p-4 rounded-xl border border-neutral-200 bg-white/80 backdrop-blur shadow-sm"
                      >
                        <div className="text-sm text-neutral-800 mb-2">
                          {mem.resumo_eco || <span className="italic text-neutral-400">Sem resumo</span>}
                        </div>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {mem.tags?.map((tag, i) => (
                            <span
                              key={i}
                              className="text-xs px-3 py-1 rounded-full shadow-inner border"
                              style={{
                                backgroundColor: getEmotionColor(tag),
                                color: '#333'
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="text-xs text-neutral-500 flex justify-between">
                          <span>{mem.emocao_principal ?? 'Emoção desconhecida'}</span>
                          <span>{mem.intensidade != null ? `Intensidade: ${mem.intensidade}` : ''}</span>
                        </div>
                        <div className="text-xs text-neutral-400 mt-1">
                          {mem.created_at ? humanDate(mem.created_at) : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-400 italic text-center mt-8">
                    Nenhuma memória significativa registrada ainda.
                  </p>
                )}
              </>
            )}

            {activeTab === 'profile' && perfil && (
              <>
                <ChartCard title="Emoções mais frequentes">
                  {emotionChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={emotionChart}>
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#6B7280', fontSize: 12 }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {emotionChart.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getEmotionColor(entry.name)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-neutral-400 italic">Nenhuma emoção frequente identificada ainda.</p>
                  )}
                </ChartCard>

                <ChartCard title="Temas mais recorrentes">
                  {themeChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={themeChart}>
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#6B7280', fontSize: 12 }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {themeChart.map((entry, index) => (
                            <Cell key={`cell-theme-${index}`} fill={generateConsistentPastelColor(entry.name)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-neutral-400 italic">Nenhum tema recorrente identificado ainda.</p>
                  )}
                </ChartCard>
              </>
            )}

            {activeTab === 'report' && relatorio && (
              <>
                <ChartCard title="Mapa Emocional 2D">
                  <MapaEmocional2D data={mapaEmocional2D} />
                </ChartCard>

                <ChartCard title="Linha do Tempo Emocional">
                  <div className="h-64 w-full flex items-center justify-center text-neutral-400 text-sm">
                    [Gráfico linha do tempo — em breve]
                  </div>
                </ChartCard>

                <p className="text-xs text-neutral-500 text-center">
                  Total de memórias significativas: {relatorio.total_memorias ?? 'Indisponível'}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </PhoneFrame>
  );
};

export default MemoryPage;
