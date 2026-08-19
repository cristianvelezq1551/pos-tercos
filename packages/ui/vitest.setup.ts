import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Con `globals: false`, Testing Library NO registra su auto-cleanup: el DOM de
// un test queda vivo en el siguiente y las queries encuentran duplicados.
afterEach(() => {
  cleanup();
});
