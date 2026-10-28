import React from 'react';

interface PreloaderProps {
  message?: string;
}

export default function Preloader({
  message = 'Carregando plataforma...',
}: PreloaderProps) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#090d15] select-none"
      role="status"
      aria-label="Carregando"
    >
      {/* Ambient background glow */}
      <div className="absolute w-96 h-96 rounded-full bg-indigo-600/[0.08] blur-3xl pointer-events-none -translate-y-4" />

      {/* Typographic LVPlatform Logo with Light Sweep */}
      <div className="relative flex flex-col items-center justify-center mb-6">
        <div className="relative inline-block">
          {/* Base Text: Premium Metallic Gradient */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-200 to-slate-400 drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]">
            <span className="text-indigo-400 font-extrabold mr-0.5">LV</span>
            Platform
          </h1>

          {/* Light Sweep Layer: Sweeps across the interior of letters ONCE (2s) */}
          <span
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none text-4xl sm:text-5xl md:text-6xl font-black tracking-tight select-none"
            style={{
              background:
                'linear-gradient(110deg, transparent 32%, rgba(255, 255, 255, 0.12) 42%, rgba(255, 255, 255, 0.95) 50%, rgba(255, 255, 255, 0.12) 58%, transparent 68%)',
              backgroundSize: '250% 100%',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'lightSweepOnce 2s cubic-bezier(0.25, 1, 0.5, 1) 0.1s 1 forwards',
            }}
          >
            <span className="mr-0.5">LV</span>
            Platform
          </span>
        </div>

        {/* Subtitle tag */}
        <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.28em] text-slate-400/80 mt-2">
          Central de Operações & CRM
        </span>
      </div>

      {/* Discrete Progress Bar */}
      <div className="relative w-44 sm:w-52 h-[3px] bg-white/[0.06] rounded-full overflow-hidden mb-3">
        <div className="absolute top-0 bottom-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-indigo-400 to-transparent rounded-full animate-progress-stream" />
      </div>

      {/* Status message */}
      <p className="text-xs font-medium text-slate-400/90 tracking-wide animate-pulse">
        {message}
      </p>
    </div>
  );
}
