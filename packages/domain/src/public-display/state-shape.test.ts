import { describe, expect, it } from 'vitest';
import { PublicDisplayStateSchema } from '@pos-tercos/types';

// Turnos v2: el estado de la pantalla pública es un único turno llamado
// manualmente por el cajero — { currentTurn, callSeq, asOf }. El modelo
// anterior (current/next con items) fue eliminado.
describe('PublicDisplayStateSchema · turnos v2', () => {
  it('parses a state with a called turn', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      currentTurn: 7,
      callSeq: 3,
      asOf: '2026-05-08T12:00:01.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts currentTurn=null (sin turno llamado / reset)', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      currentTurn: null,
      callSeq: 0,
      asOf: '2026-05-08T12:00:01.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects currentTurn=0 (los turnos empiezan en 1)', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      currentTurn: 0,
      callSeq: 1,
      asOf: '2026-05-08T12:00:01.000Z',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects currentTurn > 9999', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      currentTurn: 10_000,
      callSeq: 1,
      asOf: '2026-05-08T12:00:01.000Z',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects negative callSeq', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      currentTurn: 1,
      callSeq: -1,
      asOf: '2026-05-08T12:00:01.000Z',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects missing asOf', () => {
    const parsed = PublicDisplayStateSchema.safeParse({
      currentTurn: 1,
      callSeq: 1,
    });
    expect(parsed.success).toBe(false);
  });
});
