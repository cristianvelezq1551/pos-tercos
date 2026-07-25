// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoneyInput } from './money-input';

/**
 * Este input es por donde entra el efectivo recibido y el fondo de caja. El
 * contrato es que el USUARIO ve "100.000" pero el ESTADO guarda "100000".
 * Mutantes que estos tests matan:
 * - emitir el valor con puntos → `Number("100.000")` da 100, y el cajero
 *   cobraría mil veces menos.
 * - no agrupar al mostrar → el cajero cuenta ceros a ojo y se equivoca.
 */

/** Wrapper controlado, como lo usan los formularios reales. */
function Controlled({ initial = '', onDigits }: { initial?: string; onDigits?: (d: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <MoneyInput
      aria-label="monto"
      value={value}
      onChange={(d) => {
        setValue(d);
        onDigits?.(d);
      }}
    />
  );
}

const input = () => screen.getByLabelText('monto') as HTMLInputElement;

describe('MoneyInput — lo que ve el usuario', () => {
  it('muestra el valor agrupado con puntos de miles', () => {
    render(<MoneyInput aria-label="monto" value="1450000" onChange={() => {}} />);
    expect(input().value).toBe('1.450.000');
  });

  it('vacío se muestra vacío (no "0")', () => {
    render(<MoneyInput aria-label="monto" value="" onChange={() => {}} />);
    expect(input().value).toBe('');
  });

  it('muestra el prefijo $ por defecto y lo oculta con prefix={null}', () => {
    const { unmount } = render(<MoneyInput aria-label="monto" value="1000" onChange={() => {}} />);
    expect(screen.getByText('$')).toBeDefined();
    unmount();
    render(<MoneyInput aria-label="monto" value="1000" onChange={() => {}} prefix={null} />);
    expect(screen.queryByText('$')).toBeNull();
  });

  it('usa teclado numérico en móvil', () => {
    render(<MoneyInput aria-label="monto" value="" onChange={() => {}} />);
    expect(input().getAttribute('inputmode')).toBe('numeric');
  });
});

describe('MoneyInput — lo que se guarda en el estado', () => {
  it('emite SOLO dígitos, sin los separadores que ve el usuario', () => {
    const onDigits = vi.fn();
    render(<Controlled onDigits={onDigits} />);
    fireEvent.change(input(), { target: { value: '100.000' } });
    expect(onDigits).toHaveBeenCalledWith('100000');
  });

  it('descarta lo que el usuario pegue de más ($, espacios, letras)', () => {
    const onDigits = vi.fn();
    render(<Controlled onDigits={onDigits} />);
    fireEvent.change(input(), { target: { value: '$ 20.000 COP' } });
    expect(onDigits).toHaveBeenCalledWith('20000');
  });

  it('borrar todo deja el estado vacío, no "0"', () => {
    const onDigits = vi.fn();
    render(<Controlled initial="20000" onDigits={onDigits} />);
    fireEvent.change(input(), { target: { value: '' } });
    expect(onDigits).toHaveBeenCalledWith('');
  });

  it('tipear dígito a dígito reagrupa en vivo', () => {
    render(<Controlled />);
    fireEvent.change(input(), { target: { value: '1' } });
    expect(input().value).toBe('1');
    fireEvent.change(input(), { target: { value: '1000' } });
    expect(input().value).toBe('1.000');
    fireEvent.change(input(), { target: { value: '1.0000' } });
    expect(input().value).toBe('10.000');
  });

  it('no deja escribir decimales (COP es entero)', () => {
    const onDigits = vi.fn();
    render(<Controlled onDigits={onDigits} />);
    fireEvent.change(input(), { target: { value: '1500,75' } });
    expect(onDigits).toHaveBeenCalledWith('150075');
  });

  it('respeta `disabled`', () => {
    render(<MoneyInput aria-label="monto" value="1000" onChange={() => {}} disabled />);
    expect(input().disabled).toBe(true);
  });
});
