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
});
