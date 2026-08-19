/**
 * Guard compartido por TODOS los seeds. Cada uno crea usuarios con credenciales
 * de dev conocidas y públicamente documentadas (`dev12345`, PIN `123456`);
 * correr cualquiera con un DATABASE_URL de prod exportado en el shell dejaría
 * una cuenta con acceso total y credenciales conocidas.
 *
 * Vivía duplicado en `seed.ts` y `seed-dueno.ts`, y `seed-users.ts` — el que la
 * guía de QA manda a correr, y por eso el más propenso a apuntarse a una base
 * remota — no lo tenía. Acá queda uno solo, y agregar un seed nuevo sin guard
 * pasa a ser un olvido visible.
 *
 * Escape hatch explícito para un staging deliberado: FORCE_SEED=1. NUNCA prod.
 */
const LOCAL_DB_HOSTS = ['localhost', '127.0.0.1', 'host.docker.internal'];

export function assertNotProduction(seedName: string, whatItCreates: string): void {
  if (process.env.FORCE_SEED === '1') return;

  const problems: string[] = [];
  if (process.env.NODE_ENV === 'production') problems.push('NODE_ENV=production');
  try {
    const host = new URL(process.env.DATABASE_URL ?? '').hostname;
    if (!LOCAL_DB_HOSTS.includes(host)) {
      problems.push(`DATABASE_URL apunta a host no-local: ${host}`);
    }
  } catch {
    problems.push('DATABASE_URL ausente o inválida');
  }

  if (problems.length > 0) {
    console.error(
      `✗ Seed ABORTADO (${problems.join(' + ')}).\n` +
        `  ${seedName} crea ${whatItCreates} — NUNCA en prod.\n` +
        `  Staging deliberado: FORCE_SEED=1 <comando del seed>`,
    );
    process.exit(1);
  }
}
