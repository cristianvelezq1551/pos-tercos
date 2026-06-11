/**
 * URL de la base de TEST. Los e2e truncan TODAS las tablas (cleanDb) — si
 * corrieran contra la DB de dev borrarían usuarios, catálogo y sesiones
 * debajo del que esté usando el sistema. Por eso SIEMPRE se deriva una DB
 * separada: `TEST_DATABASE_URL` si está definida, o la de dev con el nombre
 * cambiado a `pos_tercos_test`.
 */
export function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL no definida — no se puede derivar la DB de test.');
  }
  const url = new URL(base);
  url.pathname = '/pos_tercos_test';
  return url.toString();
}
