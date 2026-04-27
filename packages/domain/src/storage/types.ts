export interface StoragePutResult {
  /** Key opaca usada por el StorageProvider para recuperar después. */
  key: string;
  /** URL pública/firmada para visualizar la imagen (en dev: file://, en prod: signed URL R2). */
  url: string;
}

export interface StorageProvider {
  readonly name: string;
  put(prefix: string, data: Buffer, contentType: string, ext: string): Promise<StoragePutResult>;
  get(key: string): Promise<Buffer>;
  url(key: string): Promise<string>;
}
