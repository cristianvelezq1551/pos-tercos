import { Global, Logger, Module } from '@nestjs/common';
import type { StorageProvider } from '@pos-tercos/domain';
import { LocalFilesystemStorageAdapter } from './local-filesystem.adapter';
import { R2StorageAdapter } from './r2.adapter';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/**
 * Selección lazy del adapter según `STORAGE_PROVIDER` env. Default:
 * `local` (dev). Para activar R2 setear `STORAGE_PROVIDER=r2` + las
 * vars `R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET`.
 *
 * R2StorageAdapter NO está registrado como provider de Nest (su
 * constructor lanza si faltan vars). En su lugar, el factory lo
 * instancia a mano cuando corresponde — así dev sigue funcionando sin
 * setear ni una sola variable de R2.
 */
const logger = new Logger('StorageModule');

@Global()
@Module({
  providers: [
    LocalFilesystemStorageAdapter,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (local: LocalFilesystemStorageAdapter): StorageProvider => {
        const choice = (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase();
        if (choice === 'r2') {
          logger.log('Using R2StorageAdapter (production)');
          return new R2StorageAdapter();
        }
        logger.log('Using LocalFilesystemStorageAdapter (dev)');
        return local;
      },
      inject: [LocalFilesystemStorageAdapter],
    },
  ],
  exports: [STORAGE_PROVIDER, LocalFilesystemStorageAdapter],
})
export class StorageModule {}
