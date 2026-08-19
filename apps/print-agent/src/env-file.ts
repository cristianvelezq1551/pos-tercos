/**
 * Parser de `.env` de respaldo, para cuando el Node que corre el .exe no trae
 * `process.loadEnvFile`. Extraído de `main.ts` para poder testearlo: si este
 * parser falla, el agent arranca sin PRINTER_NAME y no imprime nada.
 */

const LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/** Pares clave/valor en orden de aparición. Ignora comentarios y basura. */
export function parseEnvFile(content: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of content.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const m = LINE.exec(line);
    if (!m) continue;
    out.push([m[1], m[2].trim().replace(/^["']|["']$/g, '')]);
  }
  return out;
}

/**
 * Aplica los pares al entorno SIN pisar lo que ya está definido: una variable
 * del sistema (o del servicio de Windows) gana sobre el archivo.
 */
export function applyEnvPairs(
  pairs: ReadonlyArray<[string, string]>,
  env: NodeJS.ProcessEnv,
): void {
  for (const [key, value] of pairs) {
    if (env[key] === undefined) env[key] = value;
  }
}
