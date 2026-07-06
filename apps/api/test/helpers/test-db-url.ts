/**
 * URL de la base de TEST. Los e2e truncan TODAS las tablas (cleanDb) — si
 * corrieran contra la DB de dev borrarían usuarios, catálogo y sesiones
 * debajo del que esté usando el sistema. Por eso SIEMPRE se deriva una DB
 * separada: `TEST_DATABASE_URL` si está definida, o la de dev con el nombre
 * cambiado a `pos_tercos_test`.
 */
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  const url = explicit
    ? new URL(explicit)
    : (() => {
        const base = process.env.DATABASE_URL;
        if (!base) {
          throw new Error('DATABASE_URL no definida — no se puede derivar la DB de test.');
        }
        const u = new URL(base);
        u.pathname = '/pos_tercos_test';
        return u;
      })();

  // Pool DETERMINISTA para los e2e: el default de Prisma es num_cpu*2+1, así
  // que en un runner de CI de 2 CPU quedaba en ~5 — insuficiente para el test
  // de 8 cobros SERIALIZABLE en paralelo (agotaba el pool → "Unable to start a
  // transaction"). Fijarlo desacopla los tests del CPU del runner. (En prod el
  // pool se dimensiona en el DATABASE_URL real — ver deploy.md.)
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', '15');
  }
  return url.toString();
}
