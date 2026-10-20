const timeZone = 'America/Sao_Paulo';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const localPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parsed(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  // A date in an input is a calendar date, not UTC midnight.
  const source = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-03:00` : value;
  const result = new Date(source);
  return Number.isNaN(result.getTime()) ? undefined : result;
}

export const money = (value: number): string =>
  currencyFormatter.format(Number.isFinite(value) ? value : 0);
export function date(value: string | undefined): string {
  const result = parsed(value);
  return result ? dateFormatter.format(result) : '—';
}
export function dateTime(value: string | undefined): string {
  const result = parsed(value);
  return result ? dateTimeFormatter.format(result) : '—';
}
export function time(value: string): string {
  const result = parsed(value);
  return result ? timeFormatter.format(result) : '—';
}
export function initials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length
    ? `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ''}`.toUpperCase()
    : '?';
}
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}
export function newId(prefix = 'item'): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  const full = cleanPrefix ? `${cleanPrefix}_${random}` : random;
  return full.slice(0, 36);
}

export function translateErrorMessage(
  error: unknown,
  fallback = 'Não foi possível concluir a operação. Tente novamente.',
): string {
  if (!error) return fallback;
  const msg = error instanceof Error ? error.message : String(error);

  if (/documentId/i.test(msg) && /36 chars/i.test(msg)) {
    return 'Identificador do registro inválido ou muito longo (máximo de 36 caracteres).';
  }
  if (/already exists/i.test(msg)) {
    return 'Já existe um registro com este mesmo identificador.';
  }
  if (/missing scope/i.test(msg) || /unauthorized/i.test(msg) || /not authorized/i.test(msg)) {
    return 'Sessão expirada ou sem permissão para realizar esta operação.';
  }
  if (/rate limit/i.test(msg)) {
    return 'Muitas requisições em curto período. Por favor, aguarde alguns instantes.';
  }
  if (/Network Error/i.test(msg) || /Failed to fetch/i.test(msg)) {
    return 'Falha na conexão com o servidor. Verifique sua conexão com a internet.';
  }
  if (/missing required attribute/i.test(msg)) {
    return 'Existem campos obrigatórios não preenchidos ou com formato incorreto.';
  }
  if (/invalid credentials/i.test(msg)) {
    return 'Usuário ou senha inválidos.';
  }
  if (/Write policy rejected/i.test(msg)) {
    return 'Ação bloqueada pelas políticas de governança da empresa.';
  }

  if (
    /[áàâãéêíóôõúç]/i.test(msg) ||
    /\b(não|com|para|erro|sucesso|registro|cliente|chamado|empresa|dados|ticket|campo|salvo|inválido)\b/i.test(
      msg,
    )
  ) {
    return msg;
  }

  return fallback;
}
export function localDateTime(value: Date): string {
  const parts = Object.fromEntries(
    localPartsFormatter.formatToParts(value).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function today(): string {
  return localDateTime(new Date()).slice(0, 10);
}
