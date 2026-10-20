export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

export function maskDocument(value: string, type: 'PJ' | 'PF'): string {
  const digits = onlyDigits(value).slice(0, type === 'PJ' ? 14 : 11);
  if (type === 'PJ')
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/\.(\d{3})(\d)/, '.$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function checkDigit(base: string, weights: number[]): number {
  const remainder =
    base.split('').reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0) % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function validateDocument(value: string, type: 'PJ' | 'PF'): boolean {
  if (/[^\d\s./-]/.test(value)) return false;
  const digits = onlyDigits(value);
  if (/^(\d)\1+$/.test(digits)) return false;
  if (type === 'PF') {
    if (digits.length !== 11) return false;
    const first = checkDigit(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = checkDigit(digits.slice(0, 9) + first, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.endsWith(`${first}${second}`);
  }
  if (digits.length !== 14) return false;
  const first = checkDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}

/** Build synthetic identifiers with valid check digits for this demo seed only. */
export function demoDocument(base: string, type: 'PJ' | 'PF'): string {
  const weights =
    type === 'PJ'
      ? [
          [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
          [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
        ]
      : [
          [10, 9, 8, 7, 6, 5, 4, 3, 2],
          [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
        ];
  const first = checkDigit(base, weights[0]);
  const second = checkDigit(base + first, weights[1]);
  return maskDocument(`${base}${first}${second}`, type);
}

export function maskPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length < 3) return digits ? `(${digits}` : '';
  const local = digits.slice(2);
  const breakAt = digits.length > 10 ? 5 : 4;
  return `(${digits.slice(0, 2)}) ${local.slice(0, breakAt)}${local.length > breakAt ? `-${local.slice(breakAt)}` : ''}`;
}
export function maskCep(value: string): string {
  return onlyDigits(value)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, '$1-$2');
}
export function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
export function validatePhone(value: string): boolean {
  return /^\d{10,11}$/.test(onlyDigits(value));
}
