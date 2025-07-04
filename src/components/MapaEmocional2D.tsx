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

const MapaEmocional2D: React.FC<Props> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="text-neutral-400 text-sm italic p-4 text-center">
        Nenhum dado disponível para o mapa emocional 2D.
      </div>
    );
  }

  return (
    <div className="relative h-64 w-full rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-inner">
      {/* Grade / Eixos */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full h-px bg-neutral-200" />
        <div className="absolute inset-0 flex justify-center">
          <div className="h-full w-px bg-neutral-200" />
        </div>
      </div>

      {/* Bolhas animadas */}
      {data.map((p, i) => {
        const left = Math.max(5, Math.min(95, p.valenciaNormalizada * 100));
        const top = Math.max(5, Math.min(95, (1 - p.excitacaoNormalizada) * 100));
        const cor = p.cor ?? '#a78bfa';

        // Tamanho variável para dar vida (opcional)
        const size = 24 + Math.floor(Math.random() * 12);

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 0.85, scale: 1 }}
            transition={{ duration: 0.6, delay: i * 0.02 }}
            className="absolute rounded-full shadow-lg backdrop-blur-sm"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${size}px`,
              height: `${size}px`,
              backgroundColor: cor,
              border: '2px solid white',
              transform: 'translate(-50%, -50%)',
              opacity: 0.85,
            }}
            title={`${p.emocao} (Valência: ${p.valenciaNormalizada}, Excitação: ${p.excitacaoNormalizada})`}
          />
        );
      })}

      {/* Label central */}
      <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400 pointer-events-none">
        Eixo de Valência / Excitação
      </div>
    </div>
  );
};

export default MapaEmocional2D;
