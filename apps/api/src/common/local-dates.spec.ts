import { localMidnightOfYmd, utcDateOfLocalDay, ymdLocal } from './local-dates';

// Las aserciones se construyen desde componentes LOCALES (new Date(y,m,d,…)),
// así el spec pasa en cualquier TZ de máquina (Bogotá, UTC, CI).
describe('local-dates', () => {
  describe('ymdLocal', () => {
    it('serializa el día calendario local, no el UTC', () => {
      // Regresión del "Periodo mostrado: 01 jul – 01 ago": el fin de ventana
      // (31 jul 23:59:59.999 local) en Bogotá es 1 ago en UTC. ymdLocal debe
      // devolver el 31.
      expect(ymdLocal(new Date(2026, 6, 31, 23, 59, 59, 999))).toBe('2026-07-31');
      expect(ymdLocal(new Date(2026, 6, 1, 0, 0, 0, 0))).toBe('2026-07-01');
    });

    it('cero-pad de mes y día', () => {
      expect(ymdLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
    });
  });

  describe('utcDateOfLocalDay', () => {
    it('devuelve la medianoche UTC del día calendario local', () => {
      const d = new Date(2026, 6, 31, 23, 59, 59, 999);
      expect(utcDateOfLocalDay(d).getTime()).toBe(Date.UTC(2026, 6, 31));
    });

    it('coincide con parseYmd(ymdLocal(d)) — coherente con columnas @db.Date', () => {
      const d = new Date(2026, 7, 1, 0, 0, 0, 0);
      const viaString = new Date(`${ymdLocal(d)}T00:00:00.000Z`);
      expect(utcDateOfLocalDay(d).getTime()).toBe(viaString.getTime());
    });
  });

  describe('localMidnightOfYmd', () => {
    it('devuelve la medianoche LOCAL de la fecha', () => {
      const d = localMidnightOfYmd('2026-07-01');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(6);
      expect(d.getDate()).toBe(1);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    });
  });

  it('ventanas de meses consecutivos NO comparten días (con corte 1 y con corte 15)', () => {
    // Espeja getBusinessMonthWindow: from = día startDay, to = día startDay-1
    // del mes siguiente. El día visible del fin de julio y el del inicio de
    // agosto deben ser distintos y consecutivos.
    for (const startDay of [1, 15]) {
      const julTo = new Date(2026, 7, startDay - 1, 23, 59, 59, 999);
      const agoFrom = new Date(2026, 7, startDay, 0, 0, 0, 0);
      expect(ymdLocal(julTo)).not.toBe(ymdLocal(agoFrom));
      expect(agoFrom.getTime() - julTo.getTime()).toBe(1);
    }
  });
});
