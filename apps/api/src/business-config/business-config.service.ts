import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BusinessValueSchema,
  DEFAULT_OPENING_HOURS,
  PaymentAccountSchema,
  OpeningHoursSchema,
  type BusinessConfig,
  type OpeningHours,
  type PublicBusinessInfo,
  type UpdateBusinessConfig,
} from '@pos-tercos/types';
import {
  haversineKm,
  isOpenAt,
  nextOpenAt,
  parseLatLng,
  type LatLng,
  type StorageProvider,
} from '@pos-tercos/domain';
import type { BusinessConfig as DbConfig } from '@prisma/client';
import { z } from 'zod';
import { STORAGE_PROVIDER } from '../adapters/storage/storage.module';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation } from '../common/tx';
import { PrismaService } from '../prisma/prisma.service';
import { resolveMapsCoords } from './resolve-maps-coords';

const SINGLETON_ID = 'singleton';
const ABOUT_IMAGE_PREFIX = 'business/about';

const AboutValuesSchema = z.array(BusinessValueSchema);
const PaymentAccountsSchema = z.array(PaymentAccountSchema);

/**
 * Config global del negocio (fila única). Dos familias:
 *  - Operación/finanzas: `monthStartDay`, `webOrdersEnabled` (#13).
 *  - Web del cliente (2026-07-16): contacto, horarios, redes y "Nosotros" —
 *    los edita el dueño y salen por `GET /web-hero/config` sin redeploy.
 */
@Injectable()
export class BusinessConfigService {
  private readonly logger = new Logger(BusinessConfigService.name);
  private aboutImageCache: { buffer: Buffer; mime: string; key: string } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async get(): Promise<BusinessConfig> {
    return this.toDto(await this.row());
  }

  /** Kill-switch de pedidos web (#13). */
  async isWebOrdersEnabled(): Promise<boolean> {
    return (await this.get()).webOrdersEnabled;
  }

  /** Atajo para los reportes: día (1–28) en que arranca el mes del negocio. */
  async getMonthStartDay(): Promise<number> {
    return (await this.get()).monthStartDay;
  }

  /**
   * Ventana del "mes del negocio" `(year, month1)` (month1: 1-12) en HORA LOCAL
   * del servidor. En prod el server corre `TZ=America/Bogota` → la ventana queda
   * anclada a medianoche de Bogotá, IDÉNTICA a la convención de `parseDateRange`
   * (reports.controller) que usan /reports/sales y el resto del tablero.
   *
   * ⚠️ NO usar `Date.UTC(...)` acá: una venta cobrada a las 22:00 Bogotá se guarda
   * en UTC (03:00 del día siguiente) y con límites UTC caería en otro día/mes →
   * `/finanzas/estado` y `/reports/sales` mostrarían ingresos distintos para el
   * mismo período. Esta es la fuente ÚNICA de la ventana mensual para que
   * estado, pagos y cortesías coincidan entre sí y con el resto de reportes.
   *
   * startDay=1 (default) ⇒ mes calendario exacto.
   *
   * ⚠️ Estos límites son para columnas TIMESTAMP (paidAt, etc.). Para columnas
   * fecha-solo (@db.Date: hireDate, periodStart de nómina, startedAt de costos
   * fijos, …) derivar límites con `utcDateOfLocalDay` (common/local-dates) —
   * y para serializar el período a YYYY-MM-DD usar `ymdLocal`, nunca
   * toISOString (el 31 jul 23:59 local es 1 ago en UTC).
   */
  async getBusinessMonthWindow(
    year: number,
    month1: number,
  ): Promise<{ from: Date; to: Date }> {
    const month0 = month1 - 1;
    const startDay = await this.getMonthStartDay();
    const from = new Date(year, month0, startDay, 0, 0, 0, 0);
    const to = new Date(year, month0 + 1, startDay - 1, 23, 59, 59, 999);
    return { from, to };
  }

  // ── Web del cliente ────────────────────────────────────────────────

  /** Subset SEGURO que consume la web, con el estado de apertura ya resuelto. */
  async getPublicInfo(at: Date = new Date()): Promise<PublicBusinessInfo> {
    const config = await this.get();
    const state = this.scheduleStateOf(config, at);
    return {
      contact: {
        phone: config.phone,
        phoneDisplay: config.phoneDisplay || config.phone,
        address: config.address,
        mapsUrl: config.mapsUrl || null,
        coords: config.coords || null,
      },
      social: {
        instagram: config.instagramUrl || null,
        tiktok: config.tiktokUrl || null,
      },
      about: {
        headline: config.aboutHeadline,
        story: config.aboutStory,
        values: config.aboutValues,
        imageUrl: config.aboutImageUrl,
      },
      schedule: {
        hours: config.hours,
        isOpenNow: state.isOpenNow,
        nextOpenAt: state.nextOpenAt,
        ordersRespectSchedule: config.ordersRespectSchedule,
      },
      radius: {
        deliveryEnabled: config.deliveryEnabled,
        radiusKm: config.orderRadiusKm,
        ordersRespectRadius: config.ordersRespectRadius,
        originCoords: config.coords || null,
      },
      webOrdersEnabled: config.webOrdersEnabled,
      acceptingOrders: state.acceptingOrders,
    };
  }

  /**
   * ¿La ubicación del cliente entra en la zona de cobertura?
   *
   * `inRange: true` cuando NO se puede decidir (switch apagado, sin coordenadas
   * del local, o el cliente no compartió su ubicación): el radio es un FILTRO,
   * no un candado — el permiso de GPS se puede negar y las coordenadas se
   * pueden falsear desde el navegador. Decisión del dueño: ante la duda, se deja
   * pedir. `distanceKm: null` marca justamente "no se pudo medir".
   */
  async checkRadius(
    customer: LatLng | null,
    at?: BusinessConfig,
  ): Promise<{ inRange: boolean; distanceKm: number | null; radiusKm: number }> {
    const config = at ?? (await this.get());
    const origin = parseLatLng(config.coords);
    if (!config.ordersRespectRadius || !origin || !customer) {
      return { inRange: true, distanceKm: null, radiusKm: config.orderRadiusKm };
    }
    const distanceKm = haversineKm(origin, customer);
    return {
      inRange: distanceKm <= config.orderRadiusKm,
      distanceKm,
      radiusKm: config.orderRadiusKm,
    };
  }

  /**
   * ¿Se toman pedidos web AHORA? Fuente ÚNICA de la regla: la usan el gate de
   * `POST /web/orders` y el `acceptingOrders` que ve la web. Si divergieran, la
   * web ofrecería pedir y el server rechazaría.
   */
  async getOrderingState(at: Date = new Date()): Promise<{
    accepting: boolean;
    reason: 'ok' | 'orders_disabled' | 'closed';
    nextOpenAt: string | null;
  }> {
    const config = await this.get();
    if (!config.webOrdersEnabled) {
      return { accepting: false, reason: 'orders_disabled', nextOpenAt: null };
    }
    const state = this.scheduleStateOf(config, at);
    if (!state.acceptingOrders) {
      return { accepting: false, reason: 'closed', nextOpenAt: state.nextOpenAt };
    }
    return { accepting: true, reason: 'ok', nextOpenAt: state.nextOpenAt };
  }

  async update(input: UpdateBusinessConfig, actorId: string): Promise<BusinessConfig> {
    const before = await this.get();
    const patch: Record<string, unknown> = { ...input };

    // El dueño pega el link de Maps y listo: las coordenadas (mapa embebido +
    // Waze) se deducen solas. Si él las escribió a mano, mandan las suyas.
    if (input.mapsUrl !== undefined && input.coords === undefined) {
      patch.coords = input.mapsUrl ? (await this.tryResolveCoords(input.mapsUrl)) ?? '' : '';
    }

    const row = await this.prisma.businessConfig.upsert({
      where: { id: SINGLETON_ID },
      update: patch,
      create: { id: SINGLETON_ID, ...patch },
    });
    const after = this.toDto(row);
    await this.audit.log({
      userId: actorId,
      action: 'BUSINESS_CONFIG_UPDATED',
      entityType: 'business_config',
      entityId: SINGLETON_ID,
      before,
      after,
    });
    return after;
  }

  /** Foto de "Nosotros". Ya validada por magic bytes en el controller. */
  async setAboutImage(buffer: Buffer, mime: string, ext: string, actorId: string): Promise<BusinessConfig> {
    const previous = await this.row();
    const stored = await this.storage.put(ABOUT_IMAGE_PREFIX, buffer, mime, ext);
    const row = await this.prisma.businessConfig.upsert({
      where: { id: SINGLETON_ID },
      update: { aboutImageKey: stored.key, aboutImageMime: mime },
      create: { id: SINGLETON_ID, aboutImageKey: stored.key, aboutImageMime: mime },
    });
    this.aboutImageCache = null;
    if (previous.aboutImageKey) {
      void this.storage.delete(previous.aboutImageKey).catch((e: unknown) => {
        this.logger.warn(`No se pudo borrar la foto vieja de Nosotros: ${String(e)}`);
      });
    }
    await this.audit.log({
      userId: actorId,
      action: 'BUSINESS_CONFIG_UPDATED',
      entityType: 'business_config',
      entityId: SINGLETON_ID,
      before: { aboutImageKey: previous.aboutImageKey },
      after: { aboutImageKey: stored.key },
    });
    return this.toDto(row);
  }

  /** null si no hay foto cargada — la web cae a su fondo degradado. */
  async getAboutImage(): Promise<{ buffer: Buffer; mime: string } | null> {
    const row = await this.row();
    if (!row.aboutImageKey || !row.aboutImageMime) return null;
    const cached = this.aboutImageCache;
    if (cached && cached.key === row.aboutImageKey) {
      return { buffer: cached.buffer, mime: cached.mime };
    }
    const buffer = await this.storage.get(row.aboutImageKey);
    this.aboutImageCache = { buffer, mime: row.aboutImageMime, key: row.aboutImageKey };
    return { buffer, mime: row.aboutImageMime };
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private scheduleStateOf(
    config: BusinessConfig,
    at: Date,
  ): { isOpenNow: boolean; nextOpenAt: string | null; acceptingOrders: boolean } {
    const isOpenNow = isOpenAt(at, config.hours);
    const next = nextOpenAt(at, config.hours);
    return {
      isOpenNow,
      nextOpenAt: next ? next.toISOString() : null,
      acceptingOrders:
        config.webOrdersEnabled && (!config.ordersRespectSchedule || isOpenNow),
    };
  }

  private async tryResolveCoords(mapsUrl: string): Promise<string | null> {
    try {
      return await resolveMapsCoords(mapsUrl);
    } catch (e: unknown) {
      // Best-effort: guardar la config nunca puede depender de que Google responda.
      this.logger.warn(`No se pudieron deducir las coordenadas del link: ${String(e)}`);
      return null;
    }
  }

  private async row(): Promise<DbConfig> {
    // Muchos endpoints leen la config en paralelo (estado + trend, menú web,
    // etc.): con la tabla vacía dos upserts concurrentes chocan creando el
    // singleton (P2002, el upsert de Prisma no es atómico sin fila) → el
    // perdedor relee la fila ganadora.
    return this.prisma.businessConfig
      .upsert({ where: { id: SINGLETON_ID }, update: {}, create: { id: SINGLETON_ID } })
      .catch((e: unknown) => {
        if (isUniqueViolation(e)) {
          return this.prisma.businessConfig.findUniqueOrThrow({ where: { id: SINGLETON_ID } });
        }
        throw e;
      });
  }

  private toDto(row: DbConfig): BusinessConfig {
    return {
      monthStartDay: row.monthStartDay,
      webOrdersEnabled: row.webOrdersEnabled,
      phone: row.phone,
      phoneDisplay: row.phoneDisplay,
      address: row.address,
      mapsUrl: row.mapsUrl,
      coords: row.coords,
      hours: this.parseHours(row.hours),
      ordersRespectSchedule: row.ordersRespectSchedule,
      deliveryEnabled: row.deliveryEnabled,
      orderRadiusKm: row.orderRadiusKm,
      ordersRespectRadius: row.ordersRespectRadius,
      instagramUrl: row.instagramUrl,
      tiktokUrl: row.tiktokUrl,
      aboutHeadline: row.aboutHeadline,
      aboutStory: row.aboutStory,
      aboutValues: this.parseValues(row.aboutValues),
      aboutImageUrl: row.aboutImageKey ? '/api/web-hero/about-image' : null,
      paymentAccounts: this.parseAccounts(row.paymentAccounts),
    };
  }

  /**
   * La columna arranca en `{}` y es JSON libre. Ante cualquier cosa rara caemos
   * al horario por defecto: un horario corrupto NO puede tumbar la web ni —peor—
   * dejar el local "cerrado" para siempre con el gate prendido.
   */
  private parseHours(raw: unknown): OpeningHours {
    const parsed = OpeningHoursSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    this.logger.warn('El horario guardado no es válido; usando el horario por defecto.');
    return DEFAULT_OPENING_HOURS;
  }

  private parseValues(raw: unknown): BusinessConfig['aboutValues'] {
    const parsed = AboutValuesSchema.safeParse(raw);
    return parsed.success ? parsed.data : [];
  }

  /**
   * Columna JSON libre. Ante cualquier cosa rara devolvemos lista vacía, que
   * hace caer el mensaje al fallback de env vars: preferimos los datos viejos
   * a un mensaje de pago a medio armar.
   */
  private parseAccounts(raw: unknown): BusinessConfig['paymentAccounts'] {
    const parsed = PaymentAccountsSchema.safeParse(raw);
    return parsed.success ? parsed.data : [];
  }
}
