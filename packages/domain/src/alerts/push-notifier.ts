/**
 * Canal de notificaciones del NAVEGADOR (Web Push): el aviso llega al celular
 * o al computador aunque la app esté cerrada, sin depender de terceros.
 *
 * Es hermano de `AlertChannel` pero no lo mismo: aquel es para fallas del
 * sistema (destinatario: quien mantiene el código, deduplicado por firma).
 * Este es para avisos de NEGOCIO al dueño y a los administradores.
 */

/** Un dispositivo suscrito. Los tres campos los da el navegador. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Ruta del admin que se abre al tocar el aviso. */
  url?: string;
  /**
   * Agrupador: un aviso nuevo con el mismo `tag` REEMPLAZA al anterior en la
   * bandeja en vez de apilarse. Sin esto, ocho descuadres dejan ocho avisos
   * que hay que descartar de a uno.
   */
  tag?: string;
}

export interface PushDeliveryResult {
  ok: boolean;
  /**
   * El servicio de push respondió que la suscripción ya no existe (404/410):
   * el navegador se desinstaló o la persona revocó el permiso. Quien llama
   * DEBE borrar la fila — si no, las muertas se acumulan y cada aviso las
   * reintenta para siempre.
   */
  gone: boolean;
  error?: string;
}

export interface PushNotifier {
  readonly name: string;
  /** Un canal mudo lo declara: la bitácora nunca afirma envíos que no ocurrieron. */
  readonly delivers: boolean;
  /** Llave pública VAPID que el navegador necesita para suscribirse. */
  readonly publicKey: string | null;
  send(target: PushTarget, message: PushMessage): Promise<PushDeliveryResult>;
}
