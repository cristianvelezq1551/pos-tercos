import { defineConfig } from 'vitest/config';
import { coverageConfig } from '../../vitest.coverage';

export default defineConfig({
  // JSX runtime automático (como Next): sin esto, los .test.tsx revientan con
  // "React is not defined" al renderizar componentes.
  esbuild: { jsx: 'automatic' },
  test: {
    // Los .test.tsx (componentes) declaran `// @vitest-environment jsdom` por
    // archivo; la lógica pura (`lib/`) corre en node.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    coverage: coverageConfig(),
  },
});
