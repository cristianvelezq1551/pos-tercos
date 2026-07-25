import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodIssue, ZodSchema } from 'zod';

/** Campos en plural: para que salga "Faltan los productos", no "Falta los". */
const PLURALES = new Set(['items', 'payments', 'productIds', 'edges']);

/**
 * Nombres de campo en castellano para el mensaje que ve la persona.
 *
 * El `message` de esta excepción viaja tal cual a la pantalla, así que
 * responder "Validation failed" es hablarle al desarrollador, no al cajero.
 * Lo que no esté en esta tabla cae al nombre técnico del campo: feo pero
 * entendible, y agregarlo cuando aparezca cuesta una línea.
 */
const NOMBRE_CAMPO: Record<string, string> = {
  amount: 'el monto',
  amountReceived: 'el efectivo recibido',
  basePrice: 'el precio',
  category: 'la categoría',
  conversionFactor: 'el factor de conversión',
  countedCash: 'el efectivo contado',
  customerName: 'el nombre del cliente',
  customerPhone: 'el celular',
  deliveryAddress: 'la dirección',
  delta: 'la cantidad',
  discountReason: 'el motivo del descuento',
  email: 'el correo',
  fullName: 'el nombre completo',
  items: 'los productos',
  name: 'el nombre',
  openingCash: 'el efectivo inicial',
  password: 'la contraseña',
  payments: 'los pagos',
  pin: 'el PIN',
  productId: 'el producto',
  quantity: 'la cantidad',
  reason: 'el motivo',
  unitPurchase: 'la unidad de compra',
  unitRecipe: 'la unidad de receta',
  unitStock: 'la unidad de stock',
};

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Textos por defecto de Zod: vienen en inglés y con jerga de tipos. Si el
 * mensaje NO es uno de estos, lo escribió alguien del equipo en castellano
 * (`.min(1, '…')`, `superRefine`) y explica el caso mejor que cualquier regla
 * genérica: se respeta tal cual.
 */
const MENSAJE_POR_DEFECTO_DE_ZOD =
  /^(Required|Expected |Invalid |String must|Number must|Array must|Too (big|small)|Unrecognized key)/i;

/** ¿"la categoría" o "el nombre"? Para concordar el adjetivo. */
function esFemenino(campo: string): boolean {
  return /^(la|las) /.test(campo);
}

/** Traduce el problema de Zod a algo que se entienda sin saber qué es Zod. */
function explicar(issue: ZodIssue): string {
  const clave = String(issue.path[0] ?? '');
  const campo = NOMBRE_CAMPO[clave] ?? clave ?? 'el dato';
  const a = esFemenino(campo) ? 'a' : 'o'; // cort-o / cort-a

  // Un mensaje escrito por nosotros gana siempre.
  if (issue.message && !MENSAJE_POR_DEFECTO_DE_ZOD.test(issue.message)) return issue.message;

  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' || issue.received === 'null'
        ? `${PLURALES.has(clave) ? 'Faltan' : 'Falta'} ${campo}.`
        : `${capitalizar(campo)} tiene un formato que no corresponde.`;
    case 'too_small':
      return issue.type === 'string'
        ? `${capitalizar(campo)} es demasiado cort${a}.`
        : `${capitalizar(campo)} es menor que el mínimo permitido.`;
    case 'too_big':
      return issue.type === 'string'
        ? `${capitalizar(campo)} es demasiado larg${a}.`
        : `${capitalizar(campo)} supera el máximo permitido.`;
    case 'invalid_string':
      return issue.validation === 'email'
        ? 'El correo no tiene un formato válido.'
        : `${capitalizar(campo)} no tiene un formato válido.`;
    case 'invalid_enum_value':
      return `${capitalizar(campo)} no es una opción válida.`;
    default:
      // Los mensajes de `superRefine` de este proyecto ya están escritos en
      // castellano y explican el caso mejor que cualquier regla genérica.
      return issue.message;
  }
}

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // Máximo 3: una lista de doce problemas no la lee nadie.
      const problemas = [...new Set(result.error.issues.map(explicar))].slice(0, 3);
      throw new BadRequestException({
        message: problemas.join(' ') || 'Revisa los datos: hay algo que no está bien.',
        // El detalle por campo se conserva para soporte y para los tests.
        errors: result.error.flatten(),
      });
    }
    return result.data;
  }
}
