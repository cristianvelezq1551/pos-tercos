import { describe, expect, it } from 'vitest';
import {
  GUIA_ASSISTANT_SYSTEM,
  buildGuiaAssistantUserPrompt,
  buildGuiaKnowledgeBase,
} from './assistant-prompt';
import { FLOWS } from './flows';

const flujosDe = (kb: string) => [...kb.matchAll(/## FLUJO: (.+)/g)].map((m) => m[1]);

describe('buildGuiaKnowledgeBase', () => {
  it('recorta: mandar la guía entera son ~23k tokens por pregunta', () => {
    const kb = buildGuiaKnowledgeBase('cómo registro una merma');
    // El recorte tiene que dejarla MUY por debajo del texto completo.
    expect(kb.length).toBeLessThan(30_000);
    expect(kb.length).toBeGreaterThan(2_000); // …pero no vaciarla
  });

  it('siempre manda el índice completo, aunque el recorte deje fuera el bloque', () => {
    const kb = buildGuiaKnowledgeBase('xyzzy nada que ver');
    expect(kb).toContain('ÍNDICE DE FLUJOS');
    expect(kb).toContain('ÍNDICE DE TEMAS');
    // Sin esto el modelo diría "no está en la guía" cuando sí está.
    for (const f of FLOWS) expect(kb).toContain(f.title);
  });

  /**
   * El contrato real NO es "acertar el primero": el modelo lee los cinco
   * bloques del recorte. Lo que no puede pasar es que el flujo correcto se
   * quede fuera, porque ahí el asistente responde "no está en la guía"
   * teniendo la respuesta.
   */
  it('el flujo correcto SIEMPRE viaja en el recorte', () => {
    const casos: [string, string][] = [
      ['cómo registro una merma si mi repollo salió defectuoso', 'Registrar una merma'],
      ['cómo cierro la caja al final del día', 'Cerrar la caja del turno'],
      ['dónde cargo el arriendo', 'Registrar y pagar un costo fijo'],
      ['cómo abro la caja en la mañana', 'Abrir la caja del día'],
      ['le pagué al domiciliario del cajón', 'Registrar una entrada o salida de efectivo'],
      ['cómo anulo una venta', 'Anular o reembolsar una venta'],
      ['cómo confirmo el pago de un pedido web', 'Atender un pedido de la web'],
      ['cómo creo un insumo nuevo', 'Cargar un insumo'],
      ['¿cómo le pago a los empleados?', 'Pagar la nómina de la semana'],
      ['cómo creo una promoción 2x1', 'Crear una promoción'],
      ['un cliente va a pagar al final', 'Manejar una cuenta abierta'],
      ['cómo regalo un producto', 'Dar una cortesía'],
      ['cómo hago el checklist', 'Hacer el checklist de apertura o cierre'],
      ['tengo insumos en negativo', 'Resolver las deudas de inventario'],
      ['cómo le pido al proveedor', 'Armar el pedido y mandárselo al proveedor'],
      ['cómo creo un usuario nuevo', 'Crear un usuario y darle su PIN'],
      ['dónde veo si el mes dio ganancia', 'Leer el resultado del mes'],
      ['cómo registro una tanda de salsa', 'Registrar una producción'],
      ['quiero contar el inventario físico', 'Hacer un conteo físico'],
      ['cómo subo una factura del proveedor', 'Subir y confirmar una factura de compra'],
    ];
    for (const [pregunta, esperado] of casos) {
      expect(flujosDe(buildGuiaKnowledgeBase(pregunta)), pregunta).toContain(esperado);
    }
  });

  it('un término distintivo gana sobre uno genérico que esté en el título', () => {
    // Regresión: sin pesar por rareza, "cargo" —que está en media guía— traía
    // "Cargar un insumo" y enterraba el flujo del arriendo.
    expect(flujosDe(buildGuiaKnowledgeBase('dónde cargo el arriendo'))[0]).toBe(
      'Registrar y pagar un costo fijo',
    );
    // Ídem: "pago" está en muchos flujos; "empleados" en uno.
    expect(flujosDe(buildGuiaKnowledgeBase('¿cómo le pago a los empleados?'))[0]).toBe(
      'Pagar la nómina de la semana',
    );
  });

  it('encuentra por raíz de palabra (arriendo / arriendos, pago / pagar)', () => {
    expect(flujosDe(buildGuiaKnowledgeBase('arriendos'))[0]).toBe('Registrar y pagar un costo fijo');
    expect(flujosDe(buildGuiaKnowledgeBase('nómina empleados'))[0]).toBe(
      'Pagar la nómina de la semana',
    );
  });

  it('filtrando por cocina no incluye flujos que el cocinero no hace', () => {
    const kb = buildGuiaKnowledgeBase('cómo cobro un pedido', 'cocina');
    expect(kb).not.toContain('## FLUJO: Vender y cobrar un pedido');
    expect(kb).not.toContain('## FLUJO: Registrar y pagar un costo fijo');
    expect(kb).not.toContain('## FLUJO: Pagar la nómina de la semana');
  });

  it('el prompt prohíbe el voseo con ejemplos concretos', () => {
    // Un modelo sigue mucho mejor un ejemplo que una regla abstracta: con solo
    // "usa tuteo" respondió "escribís, marcás, elegís, guardás".
    expect(GUIA_ASSISTANT_SYSTEM).toMatch(/escrib[íi]s/i);
    expect(GUIA_ASSISTANT_SYSTEM).toMatch(/PROHIBIDO/);
    expect(GUIA_ASSISTANT_SYSTEM).toMatch(/TUTEO/);
  });

  it('el prompt prohíbe markdown, porque el texto se muestra tal cual', () => {
    expect(GUIA_ASSISTANT_SYSTEM).toMatch(/asterisco/i);
  });

  it('para cocina sí trae sus flujos', () => {
    const kb = buildGuiaKnowledgeBase('merma', 'cocina');
    expect(kb).toContain('## FLUJO: Registrar una merma');
  });
});

describe('buildGuiaAssistantUserPrompt', () => {
  it('separa la guía de la pregunta para que el modelo no las confunda', () => {
    const p = buildGuiaAssistantUserPrompt('  ¿cómo registro una merma?  ');
    expect(p.startsWith('GUÍA:')).toBe(true);
    expect(p).toContain('PREGUNTA DE LA PERSONA:');
    expect(p.trimEnd().endsWith('¿cómo registro una merma?')).toBe(true);
  });
});
