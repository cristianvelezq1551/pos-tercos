// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumberInput } from './number-input';

/**
 * Se usa para cantidades de receta (kg, g, ml), umbrales de stock y precios.
 * Mutantes que estos tests matan:
 * - no aplicar min/max → un umbral negativo o una cantidad fuera de rango que
 *   el backend rechaza recién al guardar.
 * - no truncar a los decimales declarados → 0,1 + 0,2 en gramos arrastra basura
 *   flotante hasta el costeo FIFO.
 * - emitir 0 cuando el campo queda vacío (0 ≠ "sin dato" en un umbral).
 */

const input = () => screen.getByLabelText('cantidad') as HTMLInputElement;

describe('NumberInput — enteros', () => {
  it('emite números, no strings', () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} />);
    fireEvent.change(input(), { target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith(42);
  });

  it('vaciar el campo emite null (no 0)', () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={5} onChange={onChange} />);
    fireEvent.change(input(), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('un valor no numérico nunca sale como número (jamás emite NaN)', () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} />);
    // `type=number` descarta lo que no sea numérico antes del handler; lo que
    // llegue igual pasa por el guard de `Number.isFinite`.
    fireEvent.change(input(), { target: { value: 'abc' } });
    for (const [emitido] of onChange.mock.calls) {
      expect(emitido === null || Number.isFinite(emitido)).toBe(true);
    }
  });

  it('acepta negativos cuando no hay mínimo (ajustes de inventario)', () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} />);
    fireEvent.change(input(), { target: { value: '-5' } });
    expect(onChange).toHaveBeenCalledWith(-5);
  });

  it('trunca los decimales cuando decimals=0', () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} />);
    fireEvent.change(input(), { target: { value: '4.9' } });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('value null se renderiza vacío', () => {
    render(<NumberInput aria-label="cantidad" value={null} onChange={() => {}} />);
    expect(input().value).toBe('');
  });

  it('el 0 sí se renderiza', () => {
    render(<NumberInput aria-label="cantidad" value={0} onChange={() => {}} />);
    expect(input().value).toBe('0');
  });
});

describe('NumberInput — decimales', () => {
  it('conserva los decimales declarados', () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} decimals={2} />);
    fireEvent.change(input(), { target: { value: '1.55' } });
    expect(onChange).toHaveBeenCalledWith(1.55);
  });

  it('CORTA lo que exceda los decimales permitidos, no lo redondea', () => {
    // Redondeando, quien escribe "1,559" con dos decimales ve saltar el campo
    // a "1,56" y no entiende qué pasó. El tercer decimal no entra y ya.
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} decimals={2} />);
    fireEvent.change(input(), { target: { value: '1.559' } });
    expect(onChange).toHaveBeenCalledWith(1.55);
  });

  it('acepta la COMA: es el separador del teclado en español', () => {
    // Lo reportó el dueño cargando una factura desde el celular: "6,17"
    // terminaba en 617 porque `type="number"` descarta la coma.
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} decimals={4} />);
    fireEvent.change(input(), { target: { value: '6,17' } });
    expect(onChange).toHaveBeenCalledWith(6.17);
    expect(input().value).toBe('6.17');
  });

  it('deja escribir el separador suelto sin borrarlo', () => {
    // Tecleando "6.17" se pasa por "6.": un input controlado por número lo
    // parseaba a 6 y le borraba el punto a la persona.
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} decimals={2} />);
    fireEvent.change(input(), { target: { value: '6.' } });
    expect(input().value).toBe('6.');
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it('usa teclado decimal en móvil', () => {
    render(<NumberInput aria-label="cantidad" value={null} onChange={() => {}} decimals={3} />);
    expect(input().getAttribute('inputmode')).toBe('decimal');
  });
});

describe('NumberInput — límites', () => {
  it('recorta por debajo del mínimo', () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} min={0} />);
    fireEvent.change(input(), { target: { value: '-5' } });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('recorta por encima del máximo', () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} max={100} />);
    fireEvent.change(input(), { target: { value: '999' } });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('deja pasar lo que está dentro del rango', () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} min={1} max={10} />);
    fireEvent.change(input(), { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

describe('NumberInput — modo agrupado (montos en COP)', () => {
  it('muestra separadores de miles y cambia a input de texto', () => {
    render(<NumberInput aria-label="cantidad" value={100000} onChange={() => {}} grouping />);
    expect(input().value).toBe('100.000');
    expect(input().type).toBe('text');
  });

  it('emite el número limpio pese a los puntos', () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={null} onChange={onChange} grouping />);
    fireEvent.change(input(), { target: { value: '1.450.000' } });
    expect(onChange).toHaveBeenCalledWith(1450000);
  });

  it('vaciar emite null también en modo agrupado', () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="cantidad" value={1000} onChange={onChange} grouping />);
    fireEvent.change(input(), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('el agrupado NO aplica si hay decimales (no se puede mezclar)', () => {
    render(
      <NumberInput aria-label="cantidad" value={1000} onChange={() => {}} grouping decimals={2} />,
    );
    // Sin separadores de miles: "1000", no "1.000". Con decimales el punto ya
    // significa otra cosa y mezclarlos haría ilegible el número.
    expect(input().value).toBe('1000');
  });

  it('respeta min/max también agrupado', () => {
    const onChange = vi.fn();
    render(
      <NumberInput aria-label="cantidad" value={null} onChange={onChange} grouping max={50_000} />,
    );
    fireEvent.change(input(), { target: { value: '99.999' } });
    expect(onChange).toHaveBeenCalledWith(50_000);
  });
});

describe('NumberInput — adornos', () => {
  it('renderiza prefijo y sufijo sin meterlos en el value', () => {
    render(
      <NumberInput aria-label="cantidad" value={500} onChange={() => {}} prefix="$" suffix="g" />,
    );
    expect(screen.getByText('$')).toBeDefined();
    expect(screen.getByText('g')).toBeDefined();
    expect(input().value).toBe('500');
  });
});
