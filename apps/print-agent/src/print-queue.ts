/**
 * Cola de impresión: procesa los /print y /drawer DE A UNO. El POS dispara
 * varios casi simultáneos (comanda cocina + comanda completa + factura ×N
 * impresoras); imprimir RAW en paralelo por el spooler de Windows puede trabar
 * o intercalar bytes. Serializar lo hace confiable.
 */
export interface PrintQueue {
  enqueue<T>(work: () => Promise<T>): Promise<T>;
}

export function createPrintQueue(): PrintQueue {
  let chain: Promise<void> = Promise.resolve();
  return {
    enqueue<T>(work: () => Promise<T>): Promise<T> {
      const result = chain.then(work);
      // La cadena nunca se rompe por un fallo de un trabajo (el siguiente sigue).
      chain = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
