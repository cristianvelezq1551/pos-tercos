/**
 * Generador pseudoaleatorio DETERMINISTA para pruebas de propiedad.
 *
 * Las pruebas de propiedad corren la misma función miles de veces con entradas
 * distintas para verificar una ley que debe cumplirse SIEMPRE (ej. "el FIFO
 * nunca crea ni destruye unidades"), en vez de un puñado de casos escritos a
 * mano. Un escenario prueba un caso; una propiedad prueba el espacio.
 *
 * Es determinista a propósito: cada corrida usa una semilla explícita, así que
 * un fallo se reproduce exacto (el test imprime la semilla). Un generador con
 * `Math.random()` daría fallos que aparecen y desaparecen — inútiles.
 *
 * NO se exporta desde el index del paquete: es soporte de pruebas, no dominio.
 */

/** mulberry32 — pequeño, rápido y de buena distribución para este uso. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Entero en [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Float en [min, max). */
  float(min: number, max: number): number;
  /** Un elemento del arreglo. */
  pick<T>(xs: readonly T[]): T;
  /** true con probabilidad `p`. */
  chance(p: number): boolean;
}

export function rngFrom(seed: number): Rng {
  const next = makeRng(seed);
  return {
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    pick: (xs) => xs[Math.floor(next() * xs.length)]!,
    chance: (p) => next() < p,
  };
}

/**
 * Semillas de una corrida. Fijas (no derivadas del reloj) para que la suite sea
 * reproducible entre máquinas y entre commits.
 */
export function seeds(count: number, base = 1_000): number[] {
  return Array.from({ length: count }, (_, i) => base + i * 7919); // primo, evita ciclos
}
