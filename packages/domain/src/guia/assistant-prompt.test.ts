import { describe, expect, it } from 'vitest';
import { buildGuiaAssistantUserPrompt, buildGuiaKnowledgeBase } from './assistant-prompt';
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

  it('trae el flujo correcto primero en las preguntas típicas', () => {
    const casos: [string, string][] = [
      ['cómo registro una merma si mi repollo salió defectuoso', 'Registrar una merma'],
      ['cómo cierro la caja al final del día', 'Cerrar la caja del turno'],
      ['dónde cargo el arriendo', 'Registrar y pagar un costo fijo'],
      ['cómo creo un producto nuevo con su receta', 'Crear un producto'],
      ['cómo registro una tanda de salsa', 'Registrar una producción'],
      ['cómo subo una factura del proveedor', 'Subir y confirmar una factura de compra'],
      ['quiero contar el inventario físico', 'Hacer un conteo físico'],
    ];
    for (const [pregunta, esperado] of casos) {
      expect(flujosDe(buildGuiaKnowledgeBase(pregunta))[0], pregunta).toBe(esperado);
    }
  });

  it('cuando el título engaña, el flujo correcto igual viaja en el recorte', () => {
    // "pagar" está en el título de costos fijos, así que gana el primer puesto;
    // lo que importa es que el de cobrar TAMBIÉN llegue al modelo.
    const kb = buildGuiaKnowledgeBase('el cliente quiere pagar entre varios');
    expect(flujosDe(kb)).toContain('Vender y cobrar un pedido');
  });

  it('pesa el título por encima del cuerpo', () => {
    // Regresión: contando solo presencia, "caja" mencionada de pasada en el
    // flujo de vender le ganaba al flujo que trata de cerrar la caja.
    expect(flujosDe(buildGuiaKnowledgeBase('cerrar caja'))[0]).toBe('Cerrar la caja del turno');
  });

  it('encuentra por raíz de palabra (arriendo / arriendos)', () => {
    expect(flujosDe(buildGuiaKnowledgeBase('arriendos'))[0]).toBe('Registrar y pagar un costo fijo');
  });

  it('filtrando por cocina no incluye flujos que el cocinero no hace', () => {
    const kb = buildGuiaKnowledgeBase('cómo cobro un pedido', 'cocina');
    expect(kb).not.toContain('## FLUJO: Vender y cobrar un pedido');
    expect(kb).not.toContain('## FLUJO: Registrar y pagar un costo fijo');
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
