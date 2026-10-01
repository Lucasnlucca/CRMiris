import { FileQuestion } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
}

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-180px)]">
      <div className="text-center">
        <div className="w-24 h-24 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/20">
          <FileQuestion className="w-12 h-12 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-3">{title}</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">Esta página está em desenvolvimento</p>
        <button 
          onClick={() => window.location.href = '/'}
          className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm transition-all"
        >
          Voltar ao Dashboard
        </button>
      </div>
    </div>
  );
}
