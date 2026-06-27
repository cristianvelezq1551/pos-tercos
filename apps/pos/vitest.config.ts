import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los .test.tsx (hooks/componentes) declaran `// @vitest-environment jsdom`
    // por archivo; el resto (lógica pura) corre en node.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
    environment: 'node',
  },
});
