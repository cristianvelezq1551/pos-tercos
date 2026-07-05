import { appendFileSync, existsSync, statSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

/**
 * Log a consola Y a un archivo (`print-agent.log` junto al .exe). Compartido por
 * main + driver, así TODO (incluido lo que pasa dentro de la impresión de
 * Windows) queda en el archivo cuando corre como .exe sin consola visible.
 * Rota por tamaño (>2 MB) para no crecer sin fin.
 */
export const LOG_FILE = resolve(
  process.env.PRINT_AGENT_LOG_DIR ?? dirname(process.execPath),
  'print-agent.log',
);
const LOG_MAX_BYTES = 2 * 1024 * 1024;

export function log(line: string): void {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  try {
    if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > LOG_MAX_BYTES) {
      writeFileSync(LOG_FILE, '');
    }
    appendFileSync(LOG_FILE, stamped + '\n');
  } catch {
    // si no se puede escribir el archivo, al menos quedó en consola.
  }
}
