import React, { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';
import { useTenant } from '../context/TenantContext';

export default function TenantSelector() {
  const { tenant, tenants, loading, error, isSuperAdmin, setTenant } = useTenant();
  const [isOpen, setIsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = async (tenantId: string) => {
    if (tenant?.id === tenantId) {
      setIsOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await setTenant(tenantId);
      setIsOpen(false);
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08] animate-pulse">
        <div className="w-4 h-4 rounded-md bg-slate-300 dark:bg-slate-700" />
        <div className="w-24 h-3.5 rounded bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  if (error && !tenant) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate max-w-[140px]" title={error}>Sem empresa</span>
      </div>
    );
  }

  const primaryColor = tenant?.primary_color || '#6366f1';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={switching}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all duration-200 text-left ${
          isOpen
            ? 'bg-white dark:bg-[#121722] border-indigo-500/50 shadow-md ring-2 ring-indigo-500/10'
            : 'bg-white/80 dark:bg-[#0c1017]/80 hover:bg-slate-50 dark:hover:bg-white/[0.05] border-slate-200/80 dark:border-white/[0.08]'
        }`}
        title={tenant ? `${tenant.name} (${tenant.slug})` : 'Selecionar empresa'}
      >
        {/* Ícone ou Avatar da Empresa */}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-xs flex-shrink-0 transition-transform active:scale-95"
          style={{ backgroundColor: primaryColor }}
        >
          {tenant?.name ? tenant.name.substring(0, 1).toUpperCase() : <Building2 className="w-3.5 h-3.5" />}
        </div>

        {/* Informações da Empresa Ativa */}
        <div className="flex flex-col min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[130px] sm:max-w-[180px]">
              {tenant?.trade_name || tenant?.name || 'Selecionar Empresa'}
            </span>
            {isSuperAdmin && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[9px] font-extrabold uppercase tracking-wider">
                <Sparkles className="w-2.5 h-2.5" />
                Super
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[120px]">
            {tenant?.slug || 'Multi-Tenant'}
          </span>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-indigo-500' : ''
          }`}
        />
      </button>

      {/* Dropdown de Seleção de Empresa */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-[#121722] rounded-2xl border border-slate-200/80 dark:border-white/[0.1] shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="p-3 bg-slate-50/80 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Empresas Autorizadas</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                {tenants.length} {tenants.length === 1 ? 'organização disponível' : 'organizações disponíveis'}
              </p>
            </div>
            {isSuperAdmin && (
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold"
                title="SuperAdmin tem visão transversal de todas as organizações"
              >
                <ShieldCheck className="w-3 h-3" />
                <span>Global</span>
              </div>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
            {tenants.map((t) => {
              const isSelected = tenant?.id === t.id;
              const color = t.primary_color || '#6366f1';
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelect(t.id)}
                  disabled={switching}
                  className={`w-full flex items-center justify-between p-2 rounded-xl transition-all duration-150 text-left ${
                    isSelected
                      ? 'bg-indigo-50/70 dark:bg-indigo-500/15 border border-indigo-200/60 dark:border-indigo-500/30'
                      : 'hover:bg-slate-100 dark:hover:bg-white/[0.05] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-xs flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {t.name.substring(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-200'}`}>
                        {t.trade_name || t.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                        <span className="truncate">{t.slug}</span>
                        <span>•</span>
                        <span className="capitalize font-medium text-slate-500 dark:text-slate-400">{t.plan}</span>
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white flex-shrink-0 shadow-xs">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {tenant && (
            <div className="p-2.5 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/[0.06] text-center">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                Tenant ID: <code className="font-mono text-slate-600 dark:text-slate-400">{tenant.id}</code>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
