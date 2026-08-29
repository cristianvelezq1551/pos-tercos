import {
  isSerializationFailure,
  isUniqueViolation,
  runWithSerializationRetry,
} from './tx';

/** Error tipo Prisma: lleva `code` además del mensaje. */
function prismaError(code: string, message = 'boom'): Error {
  return Object.assign(new Error(message), { code });
}

describe('isSerializationFailure', () => {
  it('reconoce P2034 (Prisma expone así el 40001 de Postgres)', () => {
    expect(isSerializationFailure(prismaError('P2034'))).toBe(true);
  });

  it('reconoce el mensaje crudo de Postgres', () => {
    expect(
      isSerializationFailure(new Error('could not serialize access due to read/write dependencies')),
    ).toBe(true);
  });

  it('reconoce deadlock (también amerita reintento con estado fresco)', () => {
    expect(isSerializationFailure(new Error('deadlock detected'))).toBe(true);
    expect(isSerializationFailure(new Error('DEADLOCK DETECTED'))).toBe(true);
  });

  it('NO reintenta errores de negocio ni otros códigos Prisma', () => {
    expect(isSerializationFailure(prismaError('P2002'))).toBe(false);
    expect(isSerializationFailure(new Error('Stock insuficiente'))).toBe(false);
  });

  it('no explota con valores que no son Error', () => {
    expect(isSerializationFailure(null)).toBe(false);
    expect(isSerializationFailure(undefined)).toBe(false);
    expect(isSerializationFailure('could not serialize')).toBe(false);
    expect(isSerializationFailure({ code: 'P2034' })).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  it('reconoce solo P2002', () => {
    expect(isUniqueViolation(prismaError('P2002'))).toBe(true);
    expect(isUniqueViolation(prismaError('P2034'))).toBe(false);
    expect(isUniqueViolation(new Error('duplicate key'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('runWithSerializationRetry', () => {
  it('no reintenta cuando el trabajo sale bien a la primera', async () => {
    const work = jest.fn().mockResolvedValue('ok');
    await expect(runWithSerializationRetry(work)).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('reintenta hasta que la tx gana la serialización', async () => {
    const work = jest
      .fn()
      .mockRejectedValueOnce(prismaError('P2034'))
      .mockRejectedValueOnce(prismaError('P2034'))
      .mockResolvedValue('cobrado');
    await expect(runWithSerializationRetry(work)).resolves.toBe('cobrado');
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('propaga de inmediato un error de negocio (sin reintentar)', async () => {
    const work = jest.fn().mockRejectedValue(new Error('Stock insuficiente'));
    await expect(runWithSerializationRetry(work)).rejects.toThrow('Stock insuficiente');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('se rinde tras maxAttempts y propaga el último fallo de serialización', async () => {
    const work = jest.fn().mockRejectedValue(prismaError('P2034', 'serialization'));
    await expect(runWithSerializationRetry(work, 3)).rejects.toMatchObject({ code: 'P2034' });
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('con maxAttempts=1 no reintenta nunca', async () => {
    const work = jest.fn().mockRejectedValue(prismaError('P2034'));
    await expect(runWithSerializationRetry(work, 1)).rejects.toMatchObject({ code: 'P2034' });
    expect(work).toHaveBeenCalledTimes(1);
  });

  /**
   * Sin espera, N transacciones que chocaron vuelven a entrar todas juntas y
   * vuelven a chocar: los 16 intentos se consumen sin que ninguna avance y el
   * cajero recibe un 500 cobrando. Es lo que destapó `sales-concurrency` con
   * ocho cobros del mismo producto.
   */
  it('espera entre reintentos en vez de volver a chocar de inmediato', async () => {
    const work = jest
      .fn()
      .mockRejectedValueOnce(prismaError('P2034'))
      .mockResolvedValue('cobrado');
    const t0 = Date.now();
    await expect(runWithSerializationRetry(work)).resolves.toBe('cobrado');
    expect(Date.now() - t0).toBeGreaterThan(0);
  });

  it('la espera es acotada: no crece sin techo con muchos intentos', async () => {
    const work = jest.fn().mockRejectedValue(prismaError('P2034'));
    const t0 = Date.now();
    await expect(runWithSerializationRetry(work, 8)).rejects.toMatchObject({ code: 'P2034' });
    // 7 esperas con tope de 60 ms + jitter ⇒ bien por debajo de un segundo.
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(work).toHaveBeenCalledTimes(8);
  });
});
