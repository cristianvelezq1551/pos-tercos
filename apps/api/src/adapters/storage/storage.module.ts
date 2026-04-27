import { Global, Module } from '@nestjs/common';
import { LocalFilesystemStorageAdapter } from './local-filesystem.adapter';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

@Global()
@Module({
  providers: [
    LocalFilesystemStorageAdapter,
    {
      provide: STORAGE_PROVIDER,
      useExisting: LocalFilesystemStorageAdapter,
    },
  ],
  exports: [STORAGE_PROVIDER, LocalFilesystemStorageAdapter],
})
export class StorageModule {}
