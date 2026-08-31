import { z } from 'zod';

/**
 * Suscripción a las notificaciones del navegador (Web Push). El navegador
 * entrega estos tres datos; el servidor no los inventa ni los deriva.
 */
export const PushSubscriptionInputSchema = z.object({
  /**
   * URL del servicio de push del navegador. HTTPS obligatorio: por acá viaja
   * el aviso cifrado, y además es a quien le firmamos el JWT de VAPID.
   */
  endpoint: z.string().url().max(1000).startsWith('https://', {
    message: 'El endpoint de la suscripción debe ser https.',
  }),
  keys: z.object({
    /** Punto P-256 sin comprimir, base64url (65 bytes → 88 caracteres). */
    p256dh: z.string().min(1).max(200),
    /** Secreto de autenticación, base64url (16 bytes → 22 caracteres). */
    auth: z.string().min(1).max(100),
  }),
  /** Para que la persona reconozca cuál de sus dispositivos está viendo. */
  userAgent: z.string().max(300).optional(),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInputSchema>;

export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
});
export type PushUnsubscribe = z.infer<typeof PushUnsubscribeSchema>;

/** Un dispositivo suscrito, como se lo muestra a su dueño. */
export const PushDeviceSchema = z.object({
  id: z.string().uuid(),
  /** Nombre legible derivado del user agent ("Chrome en Android"). */
  label: z.string(),
  createdAt: z.string(),
  lastSentAt: z.string().nullable(),
  /** True si es el dispositivo desde el que se está mirando la pantalla. */
  isCurrent: z.boolean(),
});
export type PushDevice = z.infer<typeof PushDeviceSchema>;

export const PushStatusSchema = z.object({
  /**
   * Llave pública VAPID. `null` cuando el servidor no tiene las llaves: la
   * pantalla lo dice en vez de ofrecer un botón que no hace nada.
   */
  publicKey: z.string().nullable(),
  devices: z.array(PushDeviceSchema),
});
export type PushStatus = z.infer<typeof PushStatusSchema>;

/** Resultado de mandar un aviso a varios dispositivos. */
export const PushSendOutcomeSchema = z.object({
  sent: z.number().int().min(0),
  failed: z.number().int().min(0),
  /** Suscripciones muertas que se borraron en esta corrida. */
  removed: z.number().int().min(0),
  /** Motivo cuando no se envió nada (sin llaves, sin dispositivos). */
  reason: z.string().nullable(),
});
export type PushSendOutcome = z.infer<typeof PushSendOutcomeSchema>;
