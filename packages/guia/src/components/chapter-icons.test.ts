import { describe, expect, it } from 'vitest';
import { CHAPTERS, FLOWS } from '@pos-tercos/domain/guia';
import { chapterIcon } from './chapter-icons';
import { Map as MapaGenerico } from 'lucide-react';

describe('chapterIcon', () => {
  it('TODO icono declarado en el contenido está en el mapa', () => {
    // Regresión: 10 de 25 íconos no estaban definidos y caían al genérico EN
    // SILENCIO. No rompe nada, así que solo se nota mirando la pantalla: diez
    // tarjetas con el ícono equivocado.
    const usados = [...new Set([...FLOWS.map((f) => f.icon), ...CHAPTERS.map((c) => c.icon)])];
    const sinDefinir = usados.filter((i) => chapterIcon(i) === MapaGenerico && i !== 'map');
    expect(sinDefinir).toEqual([]);
  });

  it('un nombre desconocido cae al genérico en vez de reventar', () => {
    expect(chapterIcon('no-existe-este-icono')).toBe(MapaGenerico);
  });
});
