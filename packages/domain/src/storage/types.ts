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
  /** Borra el objeto. Idempotente — no falla si la key no existe. */
  delete(key: string): Promise<void>;
  /**
   * Lista keys bajo un prefijo (FASE 15.A para sweep de huérfanos). El
   * adapter local recorre el filesystem; en R2 se traduce a list_objects.
   * Devuelve keys con la misma forma que las almacenadas (ej.
   * `invoices/{uuid}.jpg`).
   */
  listKeys(prefix: string): Promise<string[]>;
}
