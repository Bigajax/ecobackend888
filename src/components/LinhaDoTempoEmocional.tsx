import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

type LinhaDoTempoItem = {
  data: string;
  [dominio: string]: number | string;
};

interface Props {
  data: LinhaDoTempoItem[];
}

/**
 * 🎨 Paleta fixa inspirada na referência
 */
const pastelPalette = [
  'hsl(205, 40%, 80%)', // azul claro suave
  'hsl(95, 35%, 80%)',  // verde oliva claro
  'hsl(40, 50%, 80%)'   // laranja/bege claro
];

const getPastelColor = (index: number) => pastelPalette[index % pastelPalette.length];

/**
 * 🎁 Tooltip customizado minimalista
 */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-md border border-neutral-200 bg-white/95 p-2 shadow-sm text-xs">
        <div className="font-medium mb-1">{label}</div>
        {payload.map((entry: any, idx: number) => (
          <div key={idx} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
            {entry.name}: {entry.value}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const LinhaDoTempoEmocional: React.FC<Props> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-neutral-400 italic text-center p-6">
        Nenhum dado para exibir na linha do tempo.
      </div>
    );
  }

  // 1️⃣ Somar os domínios para pegar top 3
  const domainCounts: Record<string, number> = {};
  data.forEach(item => {
    Object.keys(item).forEach(key => {
      if (key !== 'data') {
        domainCounts[key] = (domainCounts[key] || 0) + Number(item[key]) || 0;
      }
    });
  });

  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([domain]) => domain);

  const parsedData = data.map(item => {
    const parsedItem: any = { data: item.data };
    topDomains.forEach(domain => {
      parsedItem[domain] = Number(item[domain]) || 0;
    });
    return parsedItem;
  });

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart
        data={parsedData}
        margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="2 2" stroke="#F3F4F6" />
        <XAxis
          dataKey="data"
          tick={{ fontSize: 10, fill: '#9CA3AF' }}
          tickMargin={6}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#D1D5DB' }}
          axisLine={false}
          tickLine={false}
          domain={[0, 'dataMax + 5']}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 10, color: '#6B7280' }} iconSize={10} />

        {topDomains.map((dominio, idx) => (
          <Area
            key={idx}
            type="monotone"
            dataKey={dominio}
            stackId="1"
            stroke={getPastelColor(idx)}
            fill={getPastelColor(idx)}
            fillOpacity={0.4}
            strokeWidth={1.5}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default LinhaDoTempoEmocional;
