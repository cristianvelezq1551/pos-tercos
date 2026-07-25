import { defineConfig } from 'vitest/config';
import { coverageConfig } from '../../vitest.coverage';

export default defineConfig({
  // JSX runtime automático (como Next): sin esto los .test.tsx revientan.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
    environment: 'node',
    // El resto del kiosko son hooks de APIs del navegador (wake lock, audio) y
    // datos estáticos del B-roll: mockearlos no probaría nada real.
    coverage: coverageConfig(['src/app/**', 'src/**/lib/broll-menu.ts']),
  },
});
