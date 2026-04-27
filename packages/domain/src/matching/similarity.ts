/**
 * Similaridad simple para sugerir match entre la descripción raw que
 * la IA extrae de una factura ("POLLO ENTERO LIMPIO X 1.8KG") y los
 * items del catálogo ("Pollo crudo"). Devuelve 0..1.
 *
 * Mezcla:
 *  - Bonus si una string es substring de la otra (ignorando case +
 *    diacríticos)
 *  - Token overlap normalizado por la cantidad de tokens del candidato
 *
 * Pragmático para v1; no usa Levenshtein ni embeddings.
 */
export function similarity(query: string, candidate: string): number {
  const a = normalize(query);
  const b = normalize(candidate);
  if (!a || !b) return 0;

  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;

  const tokensA = a.split(' ').filter(Boolean);
  const tokensB = b.split(' ').filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setB = new Set(tokensB);
  let overlap = 0;
  for (const t of tokensA) {
    if (setB.has(t)) overlap += 1;
    // Match parcial: si un token de A es prefijo o substring de uno de B
    else if (tokensB.some((bt) => bt.startsWith(t) || t.startsWith(bt) || bt.includes(t))) {
      overlap += 0.5;
    }
  }

  const tokenRatio = overlap / Math.max(tokensA.length, tokensB.length);
  return Math.min(tokenRatio, 0.84); // tope para no competir con substring match
}

/**
 * Encuentra el mejor match entre `query` y un set de candidatos.
 * Retorna el candidato con mayor score si supera `threshold`.
 */
export function bestMatch<T>(
  query: string,
  candidates: T[],
  getName: (c: T) => string,
  threshold = 0.4,
): { candidate: T; score: number } | null {
  let best: { candidate: T; score: number } | null = null;
  for (const c of candidates) {
    const score = similarity(query, getName(c));
    if (score >= threshold && (best === null || score > best.score)) {
      best = { candidate: c, score };
    }
  }
  return best;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
