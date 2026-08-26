import { BadRequestException } from '@nestjs/common';
import type { ChecklistDay, ChecklistDayItem, ChecklistType } from '@pos-tercos/types';
import { ymdLocal } from '../common/local-dates';

export interface DbItem {
  id: string;
  type: ChecklistType;
  label: string;
  isActive: boolean;
  createdAt: Date;
}
export interface DbMark {
  type: ChecklistType;
  day: string;
  itemId: string;
  doneById: string;
  doneAt: Date;
}
export interface DbCompletion {
  type: ChecklistType;
  day: string;
  doneItemIds: string[];
  completedById: string;
  updatedAt: Date;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Días del rango, del más nuevo al más viejo.
 *
 * El cursor se construye como medianoche UTC y solo se usa como calendario
 * (sumar/restar días), nunca para representar un instante local — por eso acá
 * `toISOString().slice(0,10)` es correcto y no cae en la trampa de §3.
 */
export function listDaysDesc(from: string, to: string, maxDays: number): string[] {
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) {
    throw new BadRequestException('Las fechas deben ir como YYYY-MM-DD.');
  }
  if (from > to) {
    throw new BadRequestException('La fecha inicial no puede ser posterior a la final.');
  }
  const start = new Date(`${from}T00:00:00Z`);
  const cursor = new Date(`${to}T00:00:00Z`);
  const days: string[] = [];
  while (cursor >= start) {
    if (days.length >= maxDays) {
      throw new BadRequestException(`El rango no puede pasar de ${maxDays} días.`);
    }
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

/**
 * Arma el estado de una rutina en un día.
 *
 * Qué tareas se esperaban ese día:
 *  - Las creadas ese día o antes — una tarea agregada hoy no puede figurar como
 *    incumplida la semana pasada.
 *  - Las activas, más cualquiera que se haya marcado o cerrado ese día aunque
 *    hoy esté desactivada.
 *
 * Una tarea desactivada que NO se marcó ese día queda fuera: no guardamos
 * cuándo se desactivó, así que contarla como faltante inventaría un
 * incumplimiento que quizá nunca existió.
 */
export function buildChecklistDay(input: {
  type: ChecklistType;
  day: string;
  items: DbItem[];
  marks: DbMark[];
  completion: DbCompletion | null;
  names: Map<string, string>;
}): ChecklistDay {
  const { type, day, items, marks, completion, names } = input;
  const markByItem = new Map(marks.map((m) => [m.itemId, m]));

  // Día previo a las marcas por tarea: solo queda la lista que guardó el cierre,
  // sin autor por tarea. Se declara `legacy` en vez de inventar un nombre.
  const legacy = marks.length === 0 && completion !== null;
  const legacyDone = new Set(legacy && completion ? completion.doneItemIds : []);

  const expected = items.filter(
    (i) =>
      ymdLocal(i.createdAt) <= day &&
      (i.isActive || markByItem.has(i.id) || legacyDone.has(i.id)),
  );

  const dayItems: ChecklistDayItem[] = expected.map((i) => {
    const mark = markByItem.get(i.id);
    return {
      itemId: i.id,
      label: i.label,
      done: mark !== undefined || legacyDone.has(i.id),
      doneById: mark?.doneById ?? null,
      doneByName: mark ? (names.get(mark.doneById) ?? null) : null,
      doneAt: mark?.doneAt.toISOString() ?? null,
    };
  });

  return {
    day,
    type,
    items: dayItems,
    doneCount: dayItems.filter((i) => i.done).length,
    totalCount: dayItems.length,
    completedAt: completion?.updatedAt.toISOString() ?? null,
    completedById: completion?.completedById ?? null,
    completedByName: completion ? (names.get(completion.completedById) ?? null) : null,
    legacy,
  };
}
