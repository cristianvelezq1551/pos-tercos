import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * La app es de tema oscuro permanente: la escala `ink` de 500 para arriba es
 * TINTA (fondos, bordes), no texto. Usarla como color de letra sobre una
 * superficie oscura da 1,1–2,7:1 de contraste — se lee como un renglón en
 * blanco. Pasó de verdad: la columna "Motivo" del hub de cocina estaba en
 * `text-ink-600` (1,6:1 sobre las tarjetas) y el dueño no podía leer por qué
 * se había tirado la comida.
 *
 * Para texto tenue va `text-muted-foreground`. La excepción legítima es la
 * tinta oscura SOBRE UN CHIP CLARO (`bg-ink-50/100/200`), donde la relación se
 * invierte y el contraste sobra: eso se detecta en el mismo literal.
 */

const RAIZ = join(__dirname, '..', '..', '..', '..');
const TINTA_PROHIBIDA = /\btext-ink-(500|600|700|800|900|950)\b/;
/** Superficies CLARAS: ahí la tinta oscura es el color correcto de la letra. */
const FONDO_CLARO = /\bbg-(ink-(50|100|200)|success|warning|white)\b/;
/** La guía de estilo pinta muestras de color sobre color a propósito: su
 *  trabajo es exhibir la paleta, no comunicar texto. */
const EXCEPTUADOS = ['apps/admin/src/app/styleguide/page.tsx'];
/** Literales entre comillas simples, dobles o backticks (multilínea incluida). */
const LITERAL = /'[^']*'|"[^"]*"|`[^`]*`/g;

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.next' || entrada === 'dist') continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acc);
    else if (/\.tsx?$/.test(ruta) && !ruta.endsWith('.test.ts')) acc.push(ruta);
  }
  return acc;
}

function raicesDeCodigo(): string[] {
  const raices: string[] = [];
  for (const grupo of ['apps', 'packages']) {
    for (const app of readdirSync(join(RAIZ, grupo))) {
      const src = join(RAIZ, grupo, app, 'src');
      try {
        if (statSync(src).isDirectory()) raices.push(src);
      } catch {
        /* la app no tiene src/ (print-agent, kds-flutter) */
      }
    }
  }
  return raices;
}

describe('la tinta oscura no se usa como color de texto', () => {
  it('ningún archivo pinta letras con text-ink-500 o más oscuro sobre fondo oscuro', () => {
    const infracciones: string[] = [];

    for (const raiz of raicesDeCodigo()) {
      for (const archivo of fuentes(raiz)) {
        const ruta = relative(RAIZ, archivo);
        if (EXCEPTUADOS.includes(ruta)) continue;
        const contenido = readFileSync(archivo, 'utf8');
        for (const literal of contenido.match(LITERAL) ?? []) {
          if (!TINTA_PROHIBIDA.test(literal)) continue;
          if (FONDO_CLARO.test(literal)) continue; // tinta oscura sobre fondo claro: correcto
          infracciones.push(`${ruta} → ${literal.trim().slice(0, 120)}`);
        }
      }
    }

    expect(
      infracciones,
      `Texto ilegible sobre fondo oscuro. Usa "text-muted-foreground" para texto tenue.\n${infracciones.join('\n')}`,
    ).toEqual([]);
  });
});

/* ── El otro lado de la misma regla: que el token de reemplazo siga siendo legible ── */

function hexDeToken(css: string, token: string): string {
  const m = new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token --color-${token} no encontrado en tokens.css`);
  return m[1];
}

function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const canales = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, bl] = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('los tokens de texto tenue cumplen AA', () => {
  const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

  it.each(['background', 'card', 'muted'])(
    'muted-foreground sobre %s llega a 4.5:1',
    (superficie) => {
      const ratio = contraste(hexDeToken(css, 'muted-foreground'), hexDeToken(css, superficie));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );
});
