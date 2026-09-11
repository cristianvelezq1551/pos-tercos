import { describe, expect, it } from 'vitest';
import { motivoDeHorario, nombreDeDias, productScheduleState } from './schedule';

// Máscara: lunes=1, martes=2, miércoles=4, jueves=8, viernes=16, sábado=32, domingo=64.
const MIERCOLES = 4;
const JUEVES = 8;
const SABADO = 32;

/** 2026-09-09 fue miércoles; 2026-09-08 martes; 2026-09-12 sábado. */
const miercoles = (h = 13, m = 0, s = 0) => new Date(2026, 8, 9, h, m, s);
const martes = (h = 13) => new Date(2026, 8, 8, h, 0, 0);
const sabado = (h = 13) => new Date(2026, 8, 12, h, 0, 0);

const todoElDia = (mask: number) => ({ daysOfWeekMask: mask, timeStart: null, timeEnd: null });

describe('productScheduleState', () => {
  it('SIN ventanas se vende siempre — es el catálogo de hoy, no puede cambiar', () => {
    for (const at of [miercoles(), martes(), sabado(), miercoles(0, 0, 0)]) {
      expect(productScheduleState([], at).availableNow).toBe(true);
    }
  });

  it('una ventana de todo el miércoles cubre el miércoles entero', () => {
    const w = [todoElDia(MIERCOLES)];
    // Los bordes son los que se rompen: el primer y el último segundo del día.
    expect(productScheduleState(w, miercoles(0, 0, 0)).availableNow).toBe(true);
    expect(productScheduleState(w, miercoles(23, 59, 59)).availableNow).toBe(true);
    expect(productScheduleState(w, martes()).availableNow).toBe(false);
  });

  it('varias ventanas: basta que UNA calce', () => {
    const w = [todoElDia(MIERCOLES), { daysOfWeekMask: SABADO, timeStart: '18:00:00', timeEnd: '23:00:00' }];
    expect(productScheduleState(w, miercoles()).availableNow).toBe(true);
    expect(productScheduleState(w, sabado(19)).availableNow).toBe(true);
    expect(productScheduleState(w, sabado(17)).availableNow).toBe(false);
    expect(productScheduleState(w, martes()).availableNow).toBe(false);
  });

  it('la franja que cruza medianoche sigue valiendo de madrugada', () => {
    // Miércoles 11:00 → jueves 02:00, para un local que vende de noche.
    const w = [{ daysOfWeekMask: MIERCOLES, timeStart: '11:00:00', timeEnd: '02:00:00' }];
    expect(productScheduleState(w, miercoles(23, 30)).availableNow).toBe(true);
    expect(productScheduleState(w, miercoles(1, 0)).availableNow).toBe(true); // la madrugada del propio miércoles
    expect(productScheduleState(w, miercoles(10, 0)).availableNow).toBe(false);
  });

  it('dice CUÁNDO vuelve a venderse', () => {
    const r = productScheduleState([todoElDia(MIERCOLES)], martes(13));
    expect(r.availableNow).toBe(false);
    expect(r.nextStart?.getDay()).toBe(3); // miércoles
    expect(r.nextStart?.getDate()).toBe(9);
    expect(r.nextStart?.getHours()).toBe(0);
  });

  it('con varias ventanas, el próximo arranque es el MÁS CERCANO', () => {
    // Desde el martes: el miércoles llega antes que el sábado.
    const w = [todoElDia(SABADO), todoElDia(MIERCOLES)];
    expect(productScheduleState(w, martes()).nextStart?.getDate()).toBe(9);
  });

  it('el próximo arranque salta a la semana siguiente cuando ya pasó', () => {
    const r = productScheduleState([todoElDia(MIERCOLES)], sabado());
    expect(r.nextStart?.getDate()).toBe(16); // el miércoles siguiente
  });

  it('una máscara sin días no se vende nunca y no promete un regreso', () => {
    const r = productScheduleState([todoElDia(0)], miercoles());
    expect(r.availableNow).toBe(false);
    expect(r.nextStart).toBeNull();
  });
});

describe('nombreDeDias', () => {
  it('nombra uno, varios y todos', () => {
    expect(nombreDeDias(MIERCOLES)).toBe('miércoles');
    expect(nombreDeDias(MIERCOLES | SABADO)).toBe('miércoles y sábado');
    expect(nombreDeDias(MIERCOLES | JUEVES | SABADO)).toBe('miércoles, jueves y sábado');
    expect(nombreDeDias(127)).toBe('todos los días');
  });
});

describe('motivoDeHorario', () => {
  it('NUNCA dice "Agotado": el producto no se acabó, hoy no se vende', () => {
    const m = motivoDeHorario([todoElDia(MIERCOLES)]);
    expect(m).toBe('Solo miércoles');
    expect(m.toLowerCase()).not.toContain('agotado');
  });

  it('distingue "no es el día" de "no es la hora"', () => {
    expect(motivoDeHorario([{ daysOfWeekMask: MIERCOLES, timeStart: '18:00:00', timeEnd: '23:00:00' }]))
      .toBe('Fuera de horario (solo miércoles)');
  });
});
