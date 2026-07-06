import { z } from 'zod';

/**
 * Config global del negocio:
 *  - `monthStartDay`: día de corte del "mes del negocio" (1–28) que define la
 *    ventana del estado financiero. 1 = mes calendario.
 *  - `webOrdersEnabled`: kill-switch de pedidos web (#13). false = el API
 *    rechaza POST /web/orders y la web oculta el checkout.
 */
export const BusinessConfigSchema = z.object({
  monthStartDay: z.number().int().min(1).max(28),
  webOrdersEnabled: z.boolean(),
});
export type BusinessConfig = z.infer<typeof BusinessConfigSchema>;

export const UpdateBusinessConfigSchema = z
  .object({
    monthStartDay: z.number().int().min(1).max(28).optional(),
    webOrdersEnabled: z.boolean().optional(),
  })
  .refine((d) => d.monthStartDay !== undefined || d.webOrdersEnabled !== undefined, {
    message: 'Indicá al menos un campo a actualizar.',
  });
export type UpdateBusinessConfig = z.infer<typeof UpdateBusinessConfigSchema>;
