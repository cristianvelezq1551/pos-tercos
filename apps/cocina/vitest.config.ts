import { defineConfig } from 'vitest/config';
import { coverageConfig } from '../../vitest.coverage';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globals: false,
    environment: 'node',
    coverage: coverageConfig(['src/app/**', 'src/**/api.ts', 'src/**/api/**']),
  },
});
