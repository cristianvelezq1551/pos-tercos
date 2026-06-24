import { z } from 'zod';

/**
 * Config global del negocio. Por ahora solo el día de corte del "mes del
 * negocio" (1–28), que define la ventana del estado financiero: ej. 25 = el
 * mes va del 25 al 24 del mes siguiente. 1 = mes calendario.
 */
export const BusinessConfigSchema = z.object({
  monthStartDay: z.number().int().min(1).max(28),
});
export type BusinessConfig = z.infer<typeof BusinessConfigSchema>;

export const UpdateBusinessConfigSchema = z.object({
  monthStartDay: z.number().int().min(1).max(28),
});
export type UpdateBusinessConfig = z.infer<typeof UpdateBusinessConfigSchema>;
