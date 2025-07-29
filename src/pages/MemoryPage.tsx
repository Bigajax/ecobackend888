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
import LinhaDoTempoEmocional from '../components/LinhaDoTempoEmocional';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

/**
 * 🎨 Paleta mais viva para emoções — azul = leve, roxo = neutro, rosa = forte
 */
const EMOTION_COLORS: Record<string, string> = {
  // Fortes / negativas (rosa/vivo)
  raiva: '#DB2777',         // rosa-600
  irritado: '#EC4899',      // rosa-500
  frustracao: '#BE185D',    // rosa-700
  medo: '#DB2777',          // rosa-600
  incerteza: '#BE185D',     // rosa-700

  // Leves / positivas (azul vivo)
  alegria: '#3B82F6',       // azul-500
  calmo: '#2563EB',         // azul-600
  surpresa: '#3B82F6',      // azul-500
  antecipacao: '#2563EB',   // azul-600

  // Neutras (roxo vivo)
  tristeza: '#A855F7',      // roxo-500
  neutro: '#8B5CF6'         // roxo-600
};

/**
 * 🔤 Normaliza string removendo acentos
 */
const normalizeEmotion = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * ⚡️ Função geradora de cor viva consistente
 */
const hashStringToHue = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
};

const generateConsistentPastelColor = (str: string, options = {}) => {
  const hue = hashStringToHue(str);
  const {
    saturation = 25,
    lightness = 88
  } = options;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const getEmotionColor = (name: string) => {
  const clean = normalizeEmotion(name);
  return EMOTION_COLORS[clean] || generateConsistentPastelColor(clean);
};

/**
 * 🏷️ Tooltip
 */
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

/**
 * 📜 MemoryCard estilizado
 */
const MemoryCard: React.FC<{ mem: Memoria }> = ({ mem }) => {
  const [expanded, setExpanded] = useState(false);

  const capitalize = (str: string) =>
    str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

  return (
    <li className="p-4 rounded-3xl border border-neutral-200 bg-white/80 backdrop-blur shadow-md transition-all">
      {/* TOPO - Emoção */}
      <div className="mb-2 text-center">
        <span className="block text-lg font-bold text-neutral-800 tracking-tight">
          {mem.emocao_principal
            ? capitalize(mem.emocao_principal)
            : 'Emoção desconhecida'}
        </span>
      </div>

      {/* TAGS */}
      {mem.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 justify-center">
          {mem.tags.map((tag, i) => (
            <span
              key={i}
              className="text-xs px-3 py-1 rounded-full font-medium border border-neutral-300 bg-white/60 backdrop-blur-sm shadow hover:bg-white/80 transition"
              style={{
                color: '#111',
                borderColor: 'rgba(0,0,0,0.1)',
                backgroundColor: getEmotionColor(tag),
              }}
            >
              {capitalize(tag)}
            </span>
          ))}
        </div>
      )}

      {/* DATA */}
      <div className="text-xs text-neutral-400 text-center">
        {mem.created_at ? humanDate(mem.created_at) : ''}
      </div>

      {/* BOTÃO VER MAIS */}
      <div className="mt-3 flex justify-end">
        <button
          className="text-xs font-medium text-blue-600 flex items-center gap-1 hover:opacity-80 transition"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <>Fechar <span>↑</span></> : <>Ver mais <span>↓</span></>}
        </button>
      </div>

      {/* EXPANDIDO */}
      {expanded && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 mt-3 border-t pt-3 border-neutral-200 text-sm text-neutral-700"
        >
          {/* Reflexão da Eco */}
          {mem.analise_resumo && (
            <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200 shadow-sm">
              <div className="font-semibold mb-1 text-neutral-800">Reflexão da Eco</div>
              <div className="text-sm">{mem.analise_resumo}</div>
            </div>
          )}

          {/* Seu pensamento */}
          {mem.contexto && (
            <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200 shadow-sm">
              <div className="font-semibold mb-1 text-neutral-800">Seu pensamento</div>
              <div className="text-sm">{mem.contexto}</div>
            </div>
          )}

          {/* Domínio e Categoria */}
          {(mem.dominio_vida || mem.categoria) && (
            <div className="flex flex-col sm:flex-row gap-2">
              {mem.dominio_vida && (
                <div className="flex-1 bg-neutral-50 rounded-xl p-3 border border-neutral-200 shadow-sm">
                  <div className="font-semibold mb-1 text-neutral-800">Domínio</div>
                  <div className="text-sm">{mem.dominio_vida}</div>
                </div>
              )}
              {mem.categoria && (
                <div className="flex-1 bg-neutral-50 rounded-xl p-3 border border-neutral-200 shadow-sm">
                  <div className="font-semibold mb-1 text-neutral-800">Categoria</div>
                  <div className="text-sm">{mem.categoria}</div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </li>
  );
};


/**
 * 📱 Main Page
 */
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
      emocao: p.emocao ?? p.emocao_principal ?? 'Desconhecida',
      valenciaNormalizada: clamp(typeof p.valencia === 'number' ? p.valencia : p.x ?? 0),
      excitacaoNormalizada: clamp(typeof p.excitacao === 'number' ? p.excitacao : p.y ?? 0),
      cor: p.cor ?? undefined,
    }))
    .filter(p => typeof p.valenciaNormalizada === 'number' && typeof p.excitacaoNormalizada === 'number');
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
      <div className="relative px-4 pt-4 pb-2 flex flex-col items-center">
        <button
    onClick={() => navigate('/chat')}
    className="absolute left-4 top-4 text-neutral-700 hover:text-black"
  >
          <ArrowLeft size={26} />
        </button>
         <h1 className="text-[22px] font-semibold text-neutral-900 tracking-tight text-center">
          {{
            memories: 'Minhas Memórias',
            profile: 'Meu Perfil Emocional',
            report: 'Relatório Emocional',
          }[activeTab]}
           </h1>
         <p className="text-sm text-neutral-400 mt-1 text-center">
    {{
      memories: 'Registre e relembre seus sentimentos',
      profile: 'Seu panorama emocional em destaque',
      report: 'Análise aprofundada das suas memórias',
    }[activeTab]}
  </p>
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
                      <MemoryCard key={mem.id} mem={mem} />
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center text-center mt-20 text-neutral-500 px-6">
  <p className="text-lg font-medium mb-2 text-neutral-800">
    Você ainda não tem memórias salvas
  </p>
  <p className="text-sm mb-6 max-w-xs">
    Crie sua primeira agora mesmo.
  </p>
  <button
    onClick={() => navigate('/chat')}
    className="
      px-4 py-2 rounded-full text-sm font-medium
      border border-neutral-300
      backdrop-blur-sm bg-white/40
      text-neutral-800
      hover:bg-white/60 transition
    "
  >
    + Nova memória
  </button>
</div>

                )}
              </>
            )}

            {activeTab === 'profile' && (
  <>
    {(perfil && (emotionChart.length > 0 || themeChart.length > 0)) ? (
      <>
        <ChartCard title="Emoções mais frequentes">
          {emotionChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart
                data={emotionChart}
                margin={{ top: 20, right: 5, left: 5, bottom: 40 }}
                barCategoryGap="30%"
              >
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#333', fontSize: 12 }}
                />
                <YAxis
                  domain={[0, 'dataMax + 5']}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" barSize={37} radius={[6, 6, 0, 0]}>
                  {emotionChart.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getEmotionColor(entry.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center text-center py-8 text-neutral-500">
              <p className="text-base mb-2 text-neutral-800">
                Nenhum dado emocional ainda
              </p>
              <p className="text-sm max-w-xs">
                Registre suas memórias para ver seu perfil aqui.
              </p>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Temas mais recorrentes">
          {themeChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart
                data={themeChart}
                margin={{ top: 20, right: 10, left: 10, bottom: 20 }}
                barCategoryGap="30%"
              >
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#333', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9CA3AF', fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" barSize={37} radius={[6, 6, 0, 0]}>
                  {themeChart.map((entry, index) => (
                    <Cell key={`cell-theme-${index}`} fill={generateConsistentPastelColor(entry.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center text-center py-8 text-neutral-500">
              <p className="text-base mb-2 text-neutral-800">
                Nenhum tema ainda
              </p>
              <p className="text-sm max-w-xs">
                Crie registros para descobrir seus principais temas.
              </p>
            </div>
          )}
        </ChartCard>
      </>
    ) : (
      <div className="flex flex-col items-center text-center mt-20 text-neutral-500 px-6">
        <p className="text-lg font-medium mb-2 text-neutral-800">
          Seu perfil emocional está vazio
        </p>
        <p className="text-sm mb-6 max-w-xs">
          Compartilhe o que sente com a Eco para criar seu panorama emocional.
        </p>
        <button
          onClick={() => navigate('/chat')}
          className="
            px-4 py-2 rounded-full text-sm font-medium
            border border-neutral-300
            backdrop-blur-sm bg-white/40
            text-neutral-800
            hover:bg-white/60 transition
          "
        >
          + Nova memória
        </button>
      </div>
    )}
  </>
)}
            {activeTab === 'report' && (
              <>
                {relatorio && (mapaEmocional2D.length > 0 || (relatorio.linha_do_tempo_intensidade?.length > 0)) ? (
                  <>
                    <ChartCard title="Mapa Emocional 2D">
                      <MapaEmocional2D data={mapaEmocional2D} />
                    </ChartCard>

                    <ChartCard title="Linha do Tempo Emocional">
                      <LinhaDoTempoEmocional data={relatorio.linha_do_tempo_intensidade} />
                    </ChartCard>

                    <p className="text-xs text-neutral-500 text-center">
                      Total de memórias significativas: {relatorio.total_memorias ?? 'Indisponível'}
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-center mt-20 text-neutral-500 px-6">
                    <div className="text-5xl mb-4">🪷</div>
                    <p className="text-lg font-medium mb-2 text-neutral-800">
                      Seu Relatório Emocional está em branco
                    </p>
                    <p className="text-sm mb-6 max-w-xs">
                      Para criar seu primeiro relatório, compartilhe suas memórias mais marcantes com a Eco.
                    </p>
                    <button
                      onClick={() => navigate('/chat')}
                      className="
                        px-4 py-2 rounded-full text-sm font-medium
                        border border-neutral-300
                        backdrop-blur-sm bg-white/40
                        text-neutral-800
                        hover:bg-white/60 transition
                      "
                    >
                      + Registrar memória
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </PhoneFrame>
  );
};

export default MemoryPage;
