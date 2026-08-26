import { Inject, Injectable } from '@nestjs/common';
import type { StorageProvider } from '@pos-tercos/domain';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';

/**
 * Guarda las fotos que sube la cocina (merma e incidencias).
 *
 * Subir la foto y registrar el hecho son DOS pasos: así un reintento del
 * registro (que es idempotente) no re-sube megas de imagen, y una foto que
 * falla no se lleva puesto el dato.
 *
 * Servirlas NO vive acá: cada foto se sirve por el dueño del dato (movimiento
 * o incidencia), que es quien tiene el gate de rol. Un endpoint que devuelva
 * cualquier key deja el bucket a mano de quien la adivine.
 */
@Injectable()
export class KitchenEvidenceService {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  async upload(buffer: Buffer, mimeType: string): Promise<{ key: string }> {
    const ext = mimeType.split('/')[1] ?? 'jpg';
    const stored = await this.storage.put('kitchen', buffer, mimeType, ext);
    return { key: stored.key };
  }
}
