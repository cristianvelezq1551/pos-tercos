import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import type { StorageProvider, StoragePutResult } from '@pos-tercos/domain';
import { randomUUID } from 'crypto';

/**
 * Adapter para Cloudflare R2 (S3-compatible API). Usado en producción.
 * En dev se usa `LocalFilesystemStorageAdapter` (más rápido, sin red).
 *
 * Variables env requeridas:
 *  - R2_ENDPOINT — `https://<account_id>.r2.cloudflarestorage.com`
 *  - R2_ACCESS_KEY_ID
 *  - R2_SECRET_ACCESS_KEY
 *  - R2_BUCKET — nombre del bucket (ej. `pos-tercos-prod`)
 *  - R2_PUBLIC_URL_BASE (opcional) — si el bucket está expuesto vía
 *    Cloudflare custom domain (`https://media.tercos.co`), las URLs son
 *    directas. Si NO se setea, generamos signed URLs con TTL.
 *
 * Las keys siguen el mismo formato que el local adapter:
 * `{prefix}/{uuid}.{ext}` (ej. `invoices/abc-123.jpg`).
 */
@Injectable()
export class R2StorageAdapter implements StorageProvider {
  readonly name = 'r2';
  private readonly logger = new Logger(R2StorageAdapter.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string | null;

  constructor() {
    const endpoint = required('R2_ENDPOINT');
    const accessKeyId = required('R2_ACCESS_KEY_ID');
    const secretAccessKey = required('R2_SECRET_ACCESS_KEY');
    this.bucket = required('R2_BUCKET');
    this.publicUrlBase = process.env.R2_PUBLIC_URL_BASE ?? null;

    this.client = new S3Client({
      region: 'auto', // R2 ignora region pero el SDK lo requiere
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      // Timeouts: una conexión half-open a R2 no debe colgar el upload de
      // factura/comprobante indefinidamente. maxAttempts da un reintento corto.
      requestHandler: { requestTimeout: 15000, connectionTimeout: 5000 },
      maxAttempts: 3,
    });
  }

  async put(
    prefix: string,
    data: Buffer,
    contentType: string,
    ext: string,
  ): Promise<StoragePutResult> {
    const safePrefix = sanitize(prefix);
    const filename = `${randomUUID()}.${stripDotPrefix(ext)}`;
    const key = `${safePrefix}/${filename}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );

    return {
      key,
      url: await this.url(key),
    };
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: sanitize(key) }),
    );
    if (!res.Body) {
      throw new Error(`R2 GetObject returned no body for key=${key}`);
    }
    // Body es streamable; lo materializamos a Buffer.
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as NodeJS.ReadableStream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }

  async url(key: string): Promise<string> {
    const safeKey = sanitize(key);
    if (this.publicUrlBase) {
      return `${this.publicUrlBase.replace(/\/+$/, '')}/${safeKey}`;
    }
    // Signed URL con TTL 1 hora — suficiente para que el frontend
    // muestre la imagen en el modal de detalle de factura.
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: safeKey }),
      { expiresIn: 3600 },
    );
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: sanitize(key) }),
      );
    } catch (err) {
      // R2/S3 DeleteObject es idempotente — pero por si acaso no
      // lanzamos si el objeto no existe.
      const code = (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name;
      if (code === 'NoSuchKey' || code === 'NotFound') return;
      throw err;
    }
  }

  async listKeys(prefix: string): Promise<string[]> {
    const safePrefix = sanitize(prefix);
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `${safePrefix}/`,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `R2StorageAdapter requires env var ${name}. ` +
        `Set STORAGE_PROVIDER=local en dev si no querés configurar R2.`,
    );
  }
  return v;
}

/**
 * Neutraliza path traversal descartando segmentos `.`/`..`/vacíos (no por
 * reemplazo de substring, que dejaba pasar `foo/../../bar`). Las keys de R2 son
 * UUID server-side; esto blinda el sink ante una key futura derivada de input.
 */
function sanitize(s: string): string {
  return s
    .split('/')
    .filter((seg) => seg !== '' && seg !== '.' && seg !== '..')
    .join('/');
}

function stripDotPrefix(ext: string): string {
  return ext.startsWith('.') ? ext.slice(1) : ext;
}
