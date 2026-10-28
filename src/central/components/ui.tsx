import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  X,
  Inbox,
  type LucideIcon,
} from 'lucide-react';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function FormPage({
  eyebrow,
  title,
  description,
  backLabel = 'Voltar para a listagem',
  onBack,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  backLabel?: string;
  onBack: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  return (
    <div className="page-stack form-page-view">
      <div className="form-page-nav">
        <button type="button" className="form-page-back" onClick={onBack}>
          <ChevronLeft size={16} />
          <span>{backLabel}</span>
        </button>
      </div>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          actions ?? (
            <Button variant="secondary" onClick={onBack}>
              Voltar
            </Button>
          )
        }
      />
      <Card className="form-page-card">{children}</Card>
    </div>
  );
}
export function Badge({ children, status }: { children?: ReactNode; status?: string }) {
  const v = String(status ?? (typeof children === 'string' ? children : '')).toLocaleLowerCase(
    'pt-BR',
  );
  let tone = 'gray';
  if (['ativo', 'disponível', 'resolvido', 'pago', 'concluído', 'vigente', 'emitida'].includes(v))
    tone = 'green';
  if (['novo', 'em andamento', 'agendado', 'média', 'a vencer', 'a receber'].includes(v)) tone = 'blue';
  if (
    ['pendente', 'em atenção', 'aguardando retorno', 'alta', 'em renovação', 'suspenso', 'em aberto'].includes(v)
  )
    tone = 'amber';
  if (['vencido', 'crítica', 'indisponível', 'aberto'].includes(v)) tone = 'red';
  return (
    <span className={`badge badge-${tone}`}>
      <span className="badge-dot" />
      {children ?? status}
    </span>
  );
}
export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const n = name.trim().split(/\s+/);
  const text = (n[0]?.[0] ?? '') + (n.length > 1 ? n[n.length - 1][0] : '');
  const tones = ['blue', 'violet', 'mint', 'amber', 'rose'];
  return (
    <span
      className={`avatar avatar-${tones[(name.charCodeAt(0) || 0) % tones.length]}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.31) }}
      aria-hidden="true"
    >
      {text.toUpperCase()}
    </span>
  );
}
export function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <label className={`field ${error ? 'field-invalid' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
const modalStack: string[] = [];
export function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    modalStack.push(titleId);
    document.body.style.overflow = 'hidden';
    const focusables = () =>
      Array.from(
        contentRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ) ?? [],
      ).filter((el) => !el.hidden);
    const focus = setTimeout(() => {
      (
        contentRef.current?.querySelector<HTMLElement>('[data-autofocus]') ??
        focusables()[0] ??
        contentRef.current
      )?.focus();
    }, 0);
    function keyboard(e: KeyboardEvent) {
      if (modalStack.at(-1) !== titleId) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === contentRef.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => {
      clearTimeout(focus);
      document.removeEventListener('keydown', keyboard);
      const i = modalStack.indexOf(titleId);
      if (i >= 0) modalStack.splice(i, 1);
      if (!modalStack.length) document.body.style.overflow = '';
      if (previous?.isConnected) previous.focus();
    };
  }, [open, titleId]);
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={contentRef}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Fechar janela" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
export function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onClose,
  danger = true,
  confirmTextMatch,
  confirmInputPlaceholder,
  confirmButtonLabel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  danger?: boolean;
  confirmTextMatch?: string;
  confirmInputPlaceholder?: string;
  confirmButtonLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [typedValue, setTypedValue] = useState('');

  useEffect(() => {
    if (open) setTypedValue('');
  }, [open]);

  const isUnlocked = !confirmTextMatch || typedValue.trim() === confirmTextMatch.trim();

  return (
    <Modal
      open={open}
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p className="confirm-description" style={{ margin: 0 }}>
          {description}
        </p>

        {confirmTextMatch && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #64748b)' }}>
              Para confirmar a exclusão, digite exatamente{' '}
              <strong style={{ color: '#dc2626', userSelect: 'all', fontFamily: 'monospace' }}>
                {confirmTextMatch}
              </strong>{' '}
              abaixo:
            </label>
            <input
              type="text"
              style={{
                width: '100%',
                padding: '9px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--border, #cbd5e1)',
                background: 'var(--input-bg, #ffffff)',
                color: 'var(--foreground, #0f172a)',
                outline: 'none',
              }}
              placeholder={confirmInputPlaceholder || `Digite ${confirmTextMatch}...`}
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
        )}

        <div className="form-actions" style={{ marginTop: '6px' }}>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Voltar
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            disabled={!isUnlocked || busy}
            onClick={async () => {
              if (!isUnlocked) return;
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } catch {
                /* service displays the actionable error */
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmButtonLabel || (danger ? 'Excluir' : 'Confirmar')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={25} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'blue',
  onClick,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'navy';
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="stat-top">
        <span>{label}</span>
        {Icon && (
          <span className={`stat-icon stat-icon-${tone}`}>
            <Icon size={18} strokeWidth={1.8} />
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </>
  );
  return onClick ? (
    <button type="button" className="stat-card stat-clickable" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="stat-card">{content}</div>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Seções da página">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          className={`tab ${value === item.id ? 'active' : ''}`}
          onKeyDown={(e) => {
            let next: number | null = null;
            if (e.key === 'ArrowRight') next = (index + 1) % items.length;
            if (e.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
            if (e.key === 'Home') next = 0;
            if (e.key === 'End') next = items.length - 1;
            if (next !== null) {
              e.preventDefault();
              onChange(items[next].id);
              (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
            }
          }}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined && <span className="tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = 'Pesquisar...',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button onClick={() => onChange('')} className="search-clear" aria-label="Limpar pesquisa">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
}
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  onRowClick,
  emptyTitle = 'Nenhum registro encontrado',
  pageSize = 8,
}: {
  rows: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  pageSize?: number;
}) {
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(pageSize);
  const ordered = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.sortValue || !sort) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = get(a),
        y = get(b);
      return (
        (typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * (sort.asc ? 1 : -1)
      );
    });
  }, [rows, columns, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / limit));
  const currentPage = Math.min(page, pages);
  const offset = (currentPage - 1) * limit;
  useEffect(() => setPage(1), [rows.length, limit]);
  if (!rows.length)
    return (
      <EmptyState
        title={emptyTitle}
        description="Tente ajustar os filtros ou cadastre um novo registro."
      />
    );
  return (
    <div className="data-table">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={c.className}
                  aria-sort={
                    sort?.key === c.key ? (sort.asc ? 'ascending' : 'descending') : undefined
                  }
                >
                  {c.sortValue ? (
                    <button
                      onClick={() => {
                        setSort({ key: c.key, asc: sort?.key === c.key ? !sort.asc : true });
                        setPage(1);
                      }}
                    >
                      {c.label}
                      {sort?.key === c.key ? (
                        sort.asc ? (
                          <ArrowUp size={12} />
                        ) : (
                          <ArrowDown size={12} />
                        )
                      ) : (
                        <ArrowUpDown size={12} />
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.slice(offset, offset + limit).map((row) => (
              <tr
                key={row.id}
                className={onRowClick ? 'clickable-row' : ''}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('button,a,input,select'))
                    onRowClick?.(row);
                }}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onRowClick?.(row);
                  }
                }}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          Mostrando{' '}
          <strong>
            {offset + 1}–{Math.min(offset + limit, rows.length)}
          </strong>{' '}
          de <strong>{rows.length}</strong> registros
        </span>
        <div className="inline">
          <label className="per-page">
            Por página{' '}
            <select
              aria-label="Registros por página"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {Array.from(new Set([pageSize, 8, 12, 20]))
                .sort((a, b) => a - b)
                .map((n) => (
                  <option value={n} key={n}>
                    {n}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="pagination-button"
            aria-label="Página anterior"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          {Array.from({ length: Math.min(5, pages) }, (_, i) => {
            const n = Math.min(Math.max(1, currentPage - 2), Math.max(1, pages - 4)) + i;
            return (
              <button
                key={n}
                className={`pagination-button ${currentPage === n ? 'selected' : ''}`}
                aria-label={`Página ${n}`}
                aria-current={currentPage === n ? 'page' : undefined}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            );
          })}
          <button
            className="pagination-button"
            aria-label="Próxima página"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
export function CheckLine({ children }: { children: ReactNode }) {
  return (
    <div className="check-line">
      <Check size={15} />
      {children}
    </div>
  );
}
