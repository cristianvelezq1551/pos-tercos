import { ConflictException } from '@nestjs/common';
import { assertNombreDisponible, conNombreUnico } from './nombre-unico';

describe('nombre-unico', () => {
  describe('assertNombreDisponible', () => {
    it('deja pasar si el nombre está libre', async () => {
      await expect(
        assertNombreDisponible(async () => null, 'Gaseosa', 'producto'),
      ).resolves.toBeUndefined();
    });

    it('falla si otro item activo ya lo usa, y lo dice en lenguaje de persona', async () => {
      const buscar = async () => ({ id: 'otro' });
      await expect(assertNombreDisponible(buscar, 'Gaseosa', 'producto')).rejects.toThrow(
        ConflictException,
      );
      await expect(assertNombreDisponible(buscar, 'Gaseosa', 'producto')).rejects.toThrow(
        /Ya tienes un producto activo que se llama "Gaseosa"/,
      );
    });

    it('el propio item no choca consigo mismo (guardar sin renombrar)', async () => {
      await expect(
        assertNombreDisponible(async () => ({ id: 'yo' }), 'Gaseosa', 'producto', 'yo'),
      ).resolves.toBeUndefined();
    });

    it('nombra la cosa según lo que sea', async () => {
      const buscar = async () => ({ id: 'otro' });
      await expect(assertNombreDisponible(buscar, 'Pan', 'insumo')).rejects.toThrow(/un insumo/);
      await expect(assertNombreDisponible(buscar, 'Salsa', 'subproducto')).rejects.toThrow(
        /un subproducto/,
      );
    });
  });

  describe('conNombreUnico', () => {
    /**
     * Para un índice de EXPRESIÓN, Prisma devuelve la expresión y no el nombre del
     * índice. Si esto no se reconociera, la carrera perdida saldría como 500 — y un
     * 500 abre un Issue de alerta en producción por algo que es un choque normal.
     */
    const choquePrisma = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { modelName: 'Product', target: ['lower(btrim(name))'] },
    });

    it('traduce el choque del índice a un 409 legible', async () => {
      await expect(
        conNombreUnico('producto', 'Gaseosa', () => Promise.reject(choquePrisma)),
      ).rejects.toThrow(ConflictException);
    });

    it('también si Prisma reportara el nombre del índice', async () => {
      const porNombre = Object.assign(new Error('x'), {
        code: 'P2002',
        meta: { target: 'uq_products_nombre_activo' },
      });
      await expect(
        conNombreUnico('producto', 'Gaseosa', () => Promise.reject(porNombre)),
      ).rejects.toThrow(ConflictException);
    });

    it('NO se traga otras violaciones de unicidad: esas tienen su propio mensaje', async () => {
      const otra = Object.assign(new Error('otra cosa'), {
        code: 'P2002',
        meta: { target: ['idempotency_key'] },
      });
      await expect(
        conNombreUnico('producto', 'Gaseosa', () => Promise.reject(otra)),
      ).rejects.toThrow('otra cosa');
    });

    it('deja pasar el resultado cuando todo va bien', async () => {
      await expect(conNombreUnico('insumo', 'Pan', async () => 'guardado')).resolves.toBe(
        'guardado',
      );
    });
  });
});
