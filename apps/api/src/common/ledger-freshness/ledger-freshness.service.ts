import { Injectable } from '@nestjs/common';

/**
 * Marcador de "los datos del ledger cambiaron".
 *
 * `CogsService` cachea el replay FIFO 60 s. Esa demora es inofensiva para las
 * VENTAS (son continuas y su agregado tolera un minuto), pero no para las
 * MERMAS: son eventos puntuales que alguien registra y va a mirar enseguida, y
 * durante ese minuto el reporte de "Uso y mermas" tendría que decir que todavía
 * no sabe cuánto costó lo que se acaba de tirar — o, peor, que costó $0.
 *
 * Un contador en memoria evita la dependencia `InventoryService → CogsService`,
 * que sería un ciclo: `ReportsModule` ya importa `InventoryModule`. Quien
 * escribe una merma lo incrementa; el caché lo compara y se descarta solo.
 *
 * Vive por proceso, como la caché a la que sirve. Es coherente con el
 * invariante de una sola réplica del backend.
 */
@Injectable()
export class LedgerFreshnessService {
  private stamp = 0;

  /** Marca que hubo un cambio que el ledger todavía no refleja. */
  bump(): void {
    this.stamp += 1;
  }

  /** Valor actual; si cambió desde que se guardó una entrada, está vencida. */
  get current(): number {
    return this.stamp;
  }
}
