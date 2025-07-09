import React from 'react';
import { motion } from 'framer-motion';

interface PontoEmocional {
  emocao: string;
  valenciaNormalizada: number;
  excitacaoNormalizada: number;
  cor?: string;
}

interface Props {
  data: PontoEmocional[];
}

/**
 * 🔹 Cor pastel com mais contraste
 */
const gerarCorPastel = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
};

const MapaEmocional2D: React.FC<Props> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="text-neutral-400 text-sm italic p-4 text-center">
        Nenhum dado disponível para o mapa emocional 2D.
      </div>
    );
  }

  const limitedData = data.reduce((acc, item) => {
    const key = item.emocao;
    if (!acc[key]) acc[key] = [];
    if (acc[key].length < 30) acc[key].push(item);
    return acc;
  }, {} as Record<string, PontoEmocional[]>);

  const flattenedData = Object.values(limitedData).flat();

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="relative w-full h-[320px] sm:h-[380px] md:h-[420px] rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        {/* Grade / Eixos */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-px bg-neutral-200" />
          <div className="absolute inset-0 flex justify-center">
            <div className="h-full w-px bg-neutral-200" />
          </div>
        </div>

        {/* Bolhas */}
        {flattenedData.map((p, i) => {
          const left = ((p.valenciaNormalizada + 1) / 2) * 100;
          const top = (1 - ((p.excitacaoNormalizada + 1) / 2)) * 100;
          const leftClamped = Math.max(5, Math.min(95, left));
          const topClamped = Math.max(5, Math.min(95, top));
          const cor = p.cor ?? gerarCorPastel(p.emocao);
          const size = 22 + Math.floor(Math.random() * 8);

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 0.85, scale: 1 }}
              transition={{ duration: 0.6, delay: i * 0.01 }}
              className="absolute group"
              style={{
                left: `${leftClamped}%`,
                top: `${topClamped}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                className="rounded-full shadow-sm backdrop-blur-sm border border-white/80"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  backgroundColor: cor,
                  opacity: 0.8,
                }}
              />
              {/* Tooltip melhorado */}
              <div className="absolute -top-[72px] left-1/2 -translate-x-1/2 text-[11px] bg-white rounded-xl border border-neutral-200 shadow-md px-3 py-2 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                <div className="text-neutral-900 font-semibold text-[12px] mb-[2px]">{p.emocao}</div>
                <div className="text-neutral-500 text-[10px]">Valência: {p.valenciaNormalizada.toFixed(2)}</div>
                <div className="text-neutral-500 text-[10px]">Excitação: {p.excitacaoNormalizada.toFixed(2)}</div>
              </div>
            </motion.div>
          );
        })}

        {/* Label central */}
        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-neutral-400 pointer-events-none font-medium">
          Eixo de Valência / Excitação
        </div>
      </div>

      {/* Rodapé explicativo */}
      <div className="text-[12px] text-neutral-500 text-center italic max-w-sm leading-snug px-2">
        <span className="font-medium">Valência (Eixo X):</span> emoções negativas → positivas &nbsp;/&nbsp;
        <span className="font-medium">Excitação (Eixo Y):</span> baixa → alta energia
      </div>
    </div>
  );
};

export default MapaEmocional2D;
