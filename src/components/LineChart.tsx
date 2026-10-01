import { ChartDataPoint } from '../types';

interface LineChartProps {
  data: ChartDataPoint[];
  period: 'today' | '7days' | '30days';
  onPeriodChange: (period: 'today' | '7days' | '30days') => void;
  title: string;
  color?: string;
  gradientId?: string;
}

export default function LineChart({
  data,
  period,
  onPeriodChange,
  title,
  color = '#6366F1',
  gradientId = 'areaGradient'
}: LineChartProps) {
  const maxValue = Math.max(...data.map((d) => d.conversations), 1);
  const chartHeight = 300;
  const chartWidth = 800;
  const padding = 40;

  const points = data.length > 0 ? data.map((point, index) => {
    const x = padding + (index / Math.max(data.length - 1, 1)) * (chartWidth - padding * 2);
    const y = chartHeight - padding - ((point.conversations / maxValue) * (chartHeight - padding * 2));
    return { x, y, value: point.conversations, hour: point.hour };
  }) : [];

  const pathD = points.length > 0 ? points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`)
    .join(' ') : '';

  const areaD = points.length > 0 ? `${pathD} L ${points[points.length - 1].x},${chartHeight - padding} L ${padding},${chartHeight - padding} Z` : '';

  const periodLabels = {
    today: 'Hoje',
    '7days': 'Últimos 7 dias',
    '30days': 'Últimos 30 dias'
  };

  return (
    <div className="bg-white dark:bg-[#121824] rounded-2xl p-6 shadow-xs border border-slate-200/80 dark:border-white/[0.08]">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
          {title}
        </h3>
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value as 'today' | '7days' | '30days')}
          className="px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-white/[0.04] cursor-pointer outline-none focus:border-indigo-500"
        >
          <option value="today">{periodLabels.today}</option>
          <option value="7days">{periodLabels['7days']}</option>
          <option value="30days">{periodLabels['30days']}</option>
        </select>
      </div>

      {data.length === 0 || maxValue === 0 ? (
        <div className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500 text-xs">
          Nenhuma conversa registrada no período selecionado
        </div>
      ) : (
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          <path d={areaD} fill={`url(#${gradientId})`} />

          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point, index) => (
            <g key={index}>
              <circle
                cx={point.x}
                cy={point.y}
                r="4"
                fill="white"
                stroke={color}
                strokeWidth="2.5"
                className="cursor-pointer hover:r-6 transition-all"
              />
              {((period === 'today' && index % 2 === 0) || (period !== 'today' && true)) && (
                <text
                  x={point.x}
                  y={chartHeight - padding + 20}
                  textAnchor="middle"
                  className="text-[11px] font-medium fill-slate-400 dark:fill-slate-500"
                >
                  {point.hour}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
