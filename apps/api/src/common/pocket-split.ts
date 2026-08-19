import { BadRequestException } from '@nestjs/common';
// Redondeo canónico del dominio (PESO ENTERO, montos COP cobrados/abonados).
import { roundMoney as round2 } from '@pos-tercos/domain';

/**
 * Resuelve el reparto de un pago por bolsillo (efectivo/cuenta). Si no se
 * especifica nada, cae por defecto a CUENTA (el caso común "casi siempre
 * transferencia"). Valida que efectivo + cuenta sumen el total.
 */
export function resolvePocketSplit(
  cashAmount: number | undefined,
  bankAmount: number | undefined,
  total: number,
): { cash: number; bank: number } {
  if (cashAmount === undefined && bankAmount === undefined) {
    return { cash: 0, bank: round2(total) };
  }
  const cash = round2(cashAmount ?? 0);
  const bank = round2(bankAmount ?? Math.max(0, total - cash));
  if (cash < 0 || bank < 0) {
    throw new BadRequestException('Los montos por bolsillo no pueden ser negativos.');
  }
  if (Math.abs(cash + bank - round2(total)) > 0.01) {
    throw new BadRequestException(
      `La suma efectivo + cuenta (${cash + bank}) debe ser igual al total (${round2(total)}).`,
    );
  }
  return { cash, bank };
}

/** Etiqueta canónica del bolsillo según el reparto (única fuente — no re-derivar inline). */
export function pocketOf(split: { cash: number; bank: number }): 'EFECTIVO' | 'CUENTA' | 'MIXTO' {
  if (split.cash > 0 && split.bank === 0) return 'EFECTIVO';
  if (split.cash === 0) return 'CUENTA';
  return 'MIXTO';
}

/** Parsea un campo multipart opcional a número (undefined si vacío/ausente). */
export function parseOptionalAmount(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new BadRequestException('Monto inválido.');
  }
  return n;
}
