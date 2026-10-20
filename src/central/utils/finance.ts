import type { Charge, ChargeStatus } from '../types';
import { localDateTime, today } from './format';

/** Returns the São Paulo calendar day, preserving values from date inputs. */
export function chargeDay(value: string | undefined): string {
  if (!value?.trim()) return '';
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new Date(`${text}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
      ? text
      : '';
  }
  // A datetime input without an offset represents a São Paulo wall-clock time.
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)
    ? `${text}-03:00`
    : text;
  const parsed = new Date(timestamp);
  return Number.isFinite(parsed.getTime()) ? localDateTime(parsed).slice(0, 10) : '';
}

/** Shared by all views so a pending charge ages consistently without rewriting history. */
export function effectiveChargeStatus(charge: Charge, referenceDay = today()): ChargeStatus {
  if (charge.status !== 'Pendente') return charge.status;
  const dueDay = chargeDay(charge.dueDate);
  const comparisonDay = chargeDay(referenceDay);
  return dueDay && comparisonDay && dueDay < comparisonDay ? 'Vencido' : 'Pendente';
}

export function isPaidInMonth(charge: Charge, referenceDay = today()): boolean {
  if (charge.status !== 'Pago') return false;
  const paidDay = chargeDay(charge.paidAt);
  const comparisonDay = chargeDay(referenceDay);
  return Boolean(paidDay && comparisonDay && paidDay.slice(0, 7) === comparisonDay.slice(0, 7));
}
