import type { ExtractedInvoice } from '@pos-tercos/types';

/**
 * Compara DOS lecturas de la MISMA foto de factura y devuelve, en español, en
 * qué no coinciden.
 *
 * Por qué existe: la IA no es determinista. Con una factura real de Postobón de
 * 16 líneas, cuatro corridas de la misma imagen dieron cuatro resultados
 * distintos — el total salió bien las cuatro veces, el IVA solo una, y una
 * línea se leyó mal en todas. Una corrida erró $10 en una línea, que pasa por
 * debajo de cualquier tolerancia razonable; y un error de CANTIDAD que no
 * cambia el total de la línea no lo detecta ninguna suma.
 *
 * Leer dos veces no arregla la lectura: convierte un error invisible en un
 * desacuerdo visible. Donde las dos corridas coinciden, la confianza es alta;
 * donde discrepan, hay que mirar el papel. Es la única señal disponible que
 * cubre cantidades y nombres, que no afectan ninguna suma.
 *
 * NO decide cuál lectura es la buena —no hay forma de saberlo— y por eso jamás
 * cambia datos: solo agrega avisos.
 */

/** Diferencia relativa por debajo de la cual dos números son "el mismo". */
const TOLERANCIA_RELATIVA = 0.0001;

/**
 * Esto corre sobre lo que devolvió un modelo: un campo puede llegar AUSENTE y
 * no `null`, aunque el tipo diga otra cosa. Normalizar acá —en vez de confiar
 * en el tipo— es la diferencia entre un aviso de más y tumbar la carga de la
 * factura con un 500.
 */
function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function mismoNumero(x: number | null | undefined, y: number | null | undefined): boolean {
  const a = num(x);
  const b = num(y);
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  const escala = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / escala < TOLERANCIA_RELATIVA;
}

function mismoTexto(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined): string =>
    (s ?? '')
      // El número de renglón del papel («1.- KOLA…»): una lectura lo incluye y
      // la otra no, y eso marcaba las 16 líneas como distintas. Es el mismo
      // nombre; señalarlo es ruido que tapa los desacuerdos de verdad.
      .replace(/^\s*\d{1,3}\s*[.\-–)]+\s*/, '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  return norm(a) === norm(b);
}

const pesos = (v: number | null | undefined): string => {
  const n = num(v);
  return n === null ? 'nada' : `$${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;
};

/** Desacuerdos del encabezado: total, IVA, domicilio y número de factura. */
function compararEncabezado(a: ExtractedInvoice, b: ExtractedInvoice): string[] {
  const avisos: string[] = [];

  if (!mismoNumero(a.total, b.total)) {
    avisos.push(
      `El TOTAL de la factura se leyó distinto en cada intento (${pesos(a.total)} y ${pesos(b.total)}). Confirma cuál dice el papel.`,
    );
  }
  if (!mismoNumero(a.iva, b.iva)) {
    avisos.push(
      `El IVA se leyó distinto en cada intento (${pesos(a.iva)} y ${pesos(b.iva)}). Confirma cuál dice el papel.`,
    );
  }
  if (!mismoNumero(a.freight, b.freight)) {
    avisos.push(
      `El domicilio se leyó distinto en cada intento (${pesos(a.freight)} y ${pesos(b.freight)}).`,
    );
  }
  if (!mismoTexto(a.invoiceNumber, b.invoiceNumber)) {
    avisos.push(
      `El número de factura se leyó distinto en cada intento («${a.invoiceNumber ?? '—'}» y «${b.invoiceNumber ?? '—'}»).`,
    );
  }

  return avisos;
}

/**
 * A partir de acá, listar renglón por renglón deja de ayudar: si media factura
 * discrepa en lo mismo, lo que pasó no es un error de una línea sino que una
 * lectura tomó otra columna. Un muro de treinta avisos se ignora entero —
 * justo lo contrario de lo que este trabajo busca.
 */
const MAX_AVISOS_POR_CAMPO = 3;

/** Agrupa: pocos casos se listan uno a uno; muchos, se resumen en una frase. */
function resumirSiSonMuchos(avisos: string[], resumen: (n: number) => string): string[] {
  return avisos.length > MAX_AVISOS_POR_CAMPO ? [resumen(avisos.length)] : avisos;
}

/** Desacuerdos línea por línea. */
function compararLineas(a: ExtractedInvoice, b: ExtractedInvoice): string[] {
  const avisos: string[] = [];
  const itemsA = a.items ?? [];
  const itemsB = b.items ?? [];
  if (itemsA.length !== itemsB.length) {
    avisos.push(
      `Un intento encontró ${itemsA.length} líneas y el otro ${itemsB.length}. Cuenta las del papel antes de confirmar.`,
    );
    // Con distinta cantidad de líneas, comparar por posición señalaría
    // diferencias falsas en todo lo que sigue al renglón que sobra o falta.
    return avisos;
  }

  const { cantidades, totales, precios, nombres } = recolectarPorCampo(itemsA, itemsB);
  // Las cantidades NO se resumen: son el error que ninguna suma detecta, y cada
  // una señala una línea concreta contra la que hay que mirar el papel.
  avisos.push(...cantidades);
  avisos.push(
    ...resumirSiSonMuchos(
      totales,
      (n) =>
        `Los totales de ${n} líneas se leyeron distinto en cada intento. Cuando falla en tantas a la vez suele ser que una lectura tomó otra columna del papel (por ejemplo el precio sin IVA): revisa la factura completa antes de confirmar.`,
    ),
  );
  avisos.push(
    ...resumirSiSonMuchos(
      precios,
      (n) => `Los precios unitarios de ${n} líneas se leyeron distinto. Revisa la factura completa.`,
    ),
  );
  avisos.push(
    ...resumirSiSonMuchos(
      nombres,
      (n) =>
        `Los nombres de ${n} líneas se leyeron distinto entre los dos intentos. Revisa uno por uno que cada línea quede enganchada al insumo correcto.`,
    ),
  );

  return avisos;
}

type Items = ExtractedInvoice['items'];

/** Recorre las líneas y agrupa los desacuerdos por campo. */
function recolectarPorCampo(itemsA: Items, itemsB: Items) {
  const cantidades: string[] = [];
  const totales: string[] = [];
  const precios: string[] = [];
  const nombres: string[] = [];

  itemsA.forEach((ia, i) => {
    const ib = itemsB[i];
    if (!ib) return;
    const n = i + 1;
    const nombre = (ia.descriptionRaw ?? '').slice(0, 40);
    if (!mismoNumero(ia.quantity, ib.quantity)) {
      cantidades.push(
        `Línea ${n} («${nombre}»): la CANTIDAD se leyó distinta (${ia.quantity} y ${ib.quantity}). Este error no lo detectan las sumas: entraría al inventario la cantidad equivocada.`,
      );
    }
    if (!mismoNumero(ia.total, ib.total)) {
      totales.push(
        `Línea ${n} («${nombre}»): el total se leyó distinto (${pesos(ia.total)} y ${pesos(ib.total)}).`,
      );
    }
    if (!mismoNumero(ia.unitPrice, ib.unitPrice)) {
      precios.push(
        `Línea ${n} («${nombre}»): el precio unitario se leyó distinto (${pesos(ia.unitPrice)} y ${pesos(ib.unitPrice)}).`,
      );
    }
    if (!mismoTexto(ia.descriptionRaw, ib.descriptionRaw)) {
      nombres.push(
        `Línea ${n}: el nombre se leyó distinto («${nombre}» y «${(ib.descriptionRaw ?? '').slice(0, 40)}»). Revisa que la enganches al insumo correcto.`,
      );
    }
  });

  return { cantidades, totales, precios, nombres };
}

/**
 * Avisos listos para pantalla. Se anexan a `extraction.warnings`, que la
 * pantalla de confirmación ya muestra — así esto no necesita UI nueva ni
 * cambia el contrato de la respuesta.
 */
export function compararExtracciones(a: ExtractedInvoice, b: ExtractedInvoice): string[] {
  return [...compararEncabezado(a, b), ...compararLineas(a, b)];
}
