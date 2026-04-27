import { Injectable } from '@nestjs/common';
import type { StorageProvider, StoragePutResult } from '@pos-tercos/domain';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

@Injectable()
export class LocalFilesystemStorageAdapter implements StorageProvider {
  readonly name = 'local';
  private readonly basePath: string;

  constructor() {
    this.basePath = resolve(process.cwd(), process.env.STORAGE_LOCAL_PATH ?? './tmp/uploads');
  }

  async put(
    prefix: string,
    data: Buffer,
    contentType: string,
    ext: string,
  ): Promise<StoragePutResult> {
    const safePrefix = sanitize(prefix);
    const filename = `${randomUUID()}.${stripDotPrefix(ext)}`;
    const dirPath = join(this.basePath, safePrefix);
    await mkdir(dirPath, { recursive: true });
    const fullPath = join(dirPath, filename);
    await writeFile(fullPath, data);

    const key = `${safePrefix}/${filename}`;
    void contentType; // contentType not stored locally; kept for parity with R2 adapter
    return {
      key,
      url: `file://${fullPath}`,
    };
  }

  async get(key: string): Promise<Buffer> {
    const fullPath = join(this.basePath, sanitize(key));
    return readFile(fullPath);
  }

  async url(key: string): Promise<string> {
    return `file://${join(this.basePath, sanitize(key))}`;
  }
}

function sanitize(s: string): string {
  return s.replace(/\.\.+/g, '').replace(/^\/+/, '');
}

function stripDotPrefix(ext: string): string {
  return ext.startsWith('.') ? ext.slice(1) : ext;
}
