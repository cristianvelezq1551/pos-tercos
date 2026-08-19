import type { Test } from '@nestjs/testing';
import { WHATSAPP_PROVIDER } from '../../src/adapters/whatsapp/whatsapp.module';

type ModuleBuilder = ReturnType<typeof Test.createTestingModule>;

/**
 * Inyecta un WhatsAppProvider que SÍ entrega.
 *
 * Hace falta porque el adapter por defecto de dev/test (`MockWhatsAppAdapter`)
 * declara `delivers:false`, y desde §7.v22 `NotificationService` no registra
 * como enviado lo que ningún proveedor entregó — antes fingía y la tabla de
 * auditoría mentía. Las suites que prueban el camino AUTOMÁTICO (el que corre
 * en prod con Kapso) tienen que traer su propio proveedor que entregue.
 *
 * La contraparte —que sin proveedor NO se envía ni se finge— se prueba en
 * `whatsapp-manual.e2e-spec.ts`, que deliberadamente NO usa este helper.
 */
export function withDeliveringWhatsApp(builder: ModuleBuilder): ModuleBuilder {
  return builder.overrideProvider(WHATSAPP_PROVIDER).useValue({
    sendText: () => Promise.resolve({ ok: true, providerMessageId: 'test-wa' }),
    sendTemplate: () => Promise.resolve({ ok: true, providerMessageId: 'test-wa-tpl' }),
  });
}
