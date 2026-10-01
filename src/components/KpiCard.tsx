import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color?: string;
}

export default function KpiCard({
  title,
  value,
  icon: Icon,
  color = 'from-indigo-600 to-indigo-700'
}: KpiCardProps) {
  return (
    <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 shadow-xs hover:shadow-md transition-all duration-200 border border-slate-200/80 dark:border-white/[0.08] hover:border-indigo-500/30 dark:hover:border-indigo-500/30">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1.5">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
        </div>
        <div className={`w-11 h-11 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center shadow-xs shadow-indigo-500/15`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}
