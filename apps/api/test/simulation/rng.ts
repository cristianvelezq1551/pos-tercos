/**
 * Generador pseudoaleatorio DETERMINISTA para las simulaciones financieras.
 *
 * Una simulación que no se puede repetir no sirve para arreglar nada: el test
 * falla, se corre de nuevo con otros números y el fallo desaparece. Acá la
 * corrida entera se deriva de una semilla entera, así que el mensaje de error
 * puede decir "SEMILLA=1234" y esa corrida se reproduce byte a byte.
 *
 * `Math.random` queda PROHIBIDO dentro de la simulación por la misma razón.
 */
export class Rng {
  private state: number;

  constructor(public readonly seed: number) {
    // mulberry32: rápido, sin dependencias y con período más que suficiente
    // para las decenas de miles de decisiones de una corrida.
    this.state = seed >>> 0;
  }

  /** Flotante en [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entero en [min, max] (ambos inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** `true` con probabilidad `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Un elemento cualquiera del arreglo. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() sobre un arreglo vacío');
    return items[this.int(0, items.length - 1)]!;
  }

  /** `n` elementos distintos, en orden aleatorio. */
  sample<T>(items: readonly T[], n: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    const take = Math.min(n, pool.length);
    for (let i = 0; i < take; i += 1) out.push(pool.splice(this.int(0, pool.length - 1), 1)[0]!);
    return out;
  }

  /** Elige una clave según su peso relativo. */
  weighted<K extends string>(weights: Record<K, number>): K {
    const entries = Object.entries(weights) as Array<[K, number]>;
    const total = entries.reduce((acc, [, w]) => acc + w, 0);
    let roll = this.next() * total;
    for (const [key, w] of entries) {
      roll -= w;
      if (roll < 0) return key;
    }
    return entries[entries.length - 1]![0];
  }

  /**
   * Monto redondeado a la centena (como teclea un cajero). OJO: para PRECIOS
   * conviene `int`, no esto — un catálogo entero en múltiplos de 100 hace que
   * todo porcentaje dé entero exacto y esconde el redondeo a peso.
   */
  money(min: number, max: number): number {
    return this.int(Math.ceil(min / 100), Math.floor(max / 100)) * 100;
  }
}
