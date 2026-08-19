import { defineConfig } from 'vitest/config';
import { coverageConfig } from '../../vitest.coverage';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globals: false,
    environment: 'node',
    // `main.ts` arranca el servidor al importarse (y puede llamar process.exit);
    // su lógica vive extraída en auth/print-queue/schemas/env-file, que sí se testean.
    coverage: coverageConfig(['src/main.ts', 'src/list-usb.ts', 'src/test-print.ts']),
  },
});
