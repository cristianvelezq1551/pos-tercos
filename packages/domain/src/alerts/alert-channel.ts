/**
 * Canal por el que el SISTEMA avisa que algo se rompió (un 5xx inesperado,
 * más de una instancia viva). NO es la notificación al cliente ni la alerta
 * de negocio al dueño: el destinatario acá es quien mantiene el código, y lo
 * que se busca es enterarse SIN entrar a mirar los logs.
 */
export interface SystemAlert {
  /**
   * Firma estable del problema — es la clave de deduplicación: dos veces el
   * mismo error no abren dos avisos, se agrupan en uno.
   */
  signature: string;
  title: string;
  body: string;
}

export interface AlertDeliveryResult {
  ok: boolean;
  /**
   * `false` cuando no hay canal configurado. Se distingue de `ok` a propósito:
   * un canal que no entrega NO debe dejar registrado que entregó (§7.v22).
   */
  delivered: boolean;
  error?: string;
  /** A dónde fue a parar (Nº de Issue, id del mensaje) para el rastro en bitácora. */
  ref?: string;
}

export interface AlertChannel {
  readonly name: string;
  /** Un canal mudo lo declara acá: la bitácora nunca afirma envíos que no ocurrieron. */
  readonly delivers: boolean;
  send(alert: SystemAlert): Promise<AlertDeliveryResult>;
}
