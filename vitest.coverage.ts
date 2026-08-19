import type { ViteUserConfig } from 'vitest/config';

type Coverage = NonNullable<NonNullable<ViteUserConfig['test']>['coverage']>;

/**
 * Config de cobertura COMPARTIDA por los paquetes que corren Vitest.
 *
 * Los excludes no son para inflar el número: son archivos sin lógica que
 * ejecutar (barrels que solo re-exportan, módulos de puros `type`/`interface`,
 * config). Contarlos como "descubiertos" mide ruido, no riesgo.
 */
export function coverageConfig(extraExclude: string[] = []): Coverage {
  return {
    provider: 'v8',
    include: ['src/**/*.{ts,tsx}'],
    exclude: [
      'src/**/index.ts', // barrels: solo re-exports
      'src/**/types.ts', // solo interfaces/types (se borran al compilar)
      'src/**/*.d.ts',
      'src/**/*.test.{ts,tsx}',
      ...extraExclude,
    ],
    reporter: ['text-summary', 'json-summary', 'html'],
    reportsDirectory: './coverage',
  };
}
