import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * iOS hace ZOOM al enfocar un campo cuya letra mide menos de 16 px, y NO
 * vuelve atrás al salir: la persona queda con la pantalla ampliada y tiene que
 * despincharla a mano. Lo reportó el dueño usando el admin desde el celular.
 *
 * La guarda es `text-base sm:text-sm`: 16 px donde importa, 14 en escritorio.
 * Ya estaba en Input, Select y Textarea, pero MoneyInput, NumberInput y
 * SearchInput —los campos de plata, cantidad y búsqueda, o sea los que más se
 * tocan— se habían quedado en `text-sm`. Este test recorre los componentes y
 * falla si algún `<input>` o `<textarea>` vuelve a nacer chico.
 */
const DIR = join(__dirname);

function inputsConLetraChica(fuente: string): string[] {
  const malos: string[] = [];
  // Cada literal de className que acompañe a un input/textarea del componente.
  for (const m of fuente.matchAll(/'([^']*\bpx-3 py-2\b[^']*)'/g)) {
    const clases = m[1];
    if (!/\btext-(sm|xs)\b/.test(clases)) continue;
    if (/\btext-base\b/.test(clases)) continue; // ya tiene la guarda
    malos.push(clases.slice(0, 70));
  }
  return malos;
}

describe('los campos no disparan el zoom de iOS', () => {
  const archivos = readdirSync(DIR).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'));

  it.each(archivos)('%s', (archivo) => {
    const fuente = readFileSync(join(DIR, archivo), 'utf8');
    if (!/<input|<textarea/.test(fuente)) return;
    expect(inputsConLetraChica(fuente), `usa \`text-base sm:text-sm\` en ${archivo}`).toEqual([]);
  });
});
