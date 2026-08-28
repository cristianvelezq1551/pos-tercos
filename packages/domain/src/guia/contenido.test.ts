import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './index';
import { FLOWS } from './flows';

describe('integridad del contenido de la guía', () => {
  it('los ids de flujo son únicos: son la URL', () => {
    const ids = FLOWS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('los ids son kebab-case, porque van en la URL', () => {
    for (const f of FLOWS) expect(f.id).toMatch(/^[a-z0-9-]+$/);
    for (const c of CHAPTERS) expect(c.id).toMatch(/^[a-z0-9-]+$/);
  });

  it('todo `seeAlso` apunta a un capítulo que existe', () => {
    const capitulos = new Set(CHAPTERS.map((c) => c.id));
    const rotos = FLOWS.flatMap((f) =>
      (f.seeAlso ?? []).filter((id) => !capitulos.has(id)).map((id) => `${f.id} → ${id}`),
    );
    expect(rotos).toEqual([]);
  });

  it('cada flujo tiene pasos y dice dónde se ve el resultado', () => {
    // "Dónde se ve" es la razón de ser de esta sección: un flujo sin eso es un
    // instructivo más, que es justo lo que el dueño dijo que no servía.
    for (const f of FLOWS) {
      expect(f.steps.length, f.id).toBeGreaterThan(0);
      expect(f.sightings.length, f.id).toBeGreaterThan(0);
    }
  });

  it('cada flujo declara al menos una audiencia', () => {
    for (const f of FLOWS) expect(f.audience.length, f.id).toBeGreaterThan(0);
  });

  it('los ids de sección son únicos dentro de su capítulo: son el ancla', () => {
    for (const c of CHAPTERS) {
      const ids = c.sections.map((s) => s.id);
      expect(new Set(ids).size, c.id).toBe(ids.length);
    }
  });
});
