// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { isValidPin, PinField } from './pin-field';

/**
 * El PIN autoriza acciones sensibles (anulaciones, nómina). Este campo NO
 * verifica el PIN — eso es del backend — pero sí normaliza la entrada. Mutantes
 * que estos tests matan:
 * - dejar pasar más de 6 dígitos → el backend rechaza y el cajero no entiende
 *   por qué, en medio de una anulación con el cliente esperando.
 * - aceptar letras → el PIN viaja sucio.
 */

describe('isValidPin', () => {
  it('acepta exactamente 6 dígitos', () => {
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('000000')).toBe(true);
  });

  it.each([
    ['5 dígitos', '12345'],
    ['7 dígitos', '1234567'],
    ['vacío', ''],
    ['con letras', '12345a'],
    ['con espacios', '12 456'],
    ['con signo', '+12345'],
  ])('rechaza %s', (_label, pin) => {
    expect(isValidPin(pin)).toBe(false);
  });
});

function Controlled({ onPin }: { onPin?: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <PinField
      value={value}
      onChange={(v) => {
        setValue(v);
        onPin?.(v);
      }}
    />
  );
}

const pinInput = () => screen.getByPlaceholderText('● ● ● ● ● ●') as HTMLInputElement;

describe('PinField — normalización de la entrada', () => {
  it('descarta todo lo que no sea dígito', () => {
    const onPin = vi.fn();
    render(<Controlled onPin={onPin} />);
    fireEvent.change(pinInput(), { target: { value: '12a3-4b' } });
    expect(onPin).toHaveBeenCalledWith('1234');
  });

  it('corta en 6 dígitos aunque el usuario pegue más', () => {
    const onPin = vi.fn();
    render(<Controlled onPin={onPin} />);
    fireEvent.change(pinInput(), { target: { value: '123456789' } });
    expect(onPin).toHaveBeenCalledWith('123456');
  });

  it('usa teclado numérico y no autocompleta (es un secreto)', () => {
    render(<Controlled />);
    expect(pinInput().getAttribute('inputmode')).toBe('numeric');
    expect(pinInput().getAttribute('autocomplete')).toBe('off');
  });
});

describe('PinField — feedback de error', () => {
  it('no marca error mientras el campo está vacío', () => {
    render(<PinField value="" onChange={() => {}} />);
    expect(screen.queryByText('6 dígitos')).toBeNull();
  });

  it('avisa mientras el PIN está incompleto', () => {
    render(<PinField value="123" onChange={() => {}} />);
    expect(screen.getByText('6 dígitos')).toBeDefined();
  });

  it('el aviso desaparece al completar los 6', () => {
    render(<PinField value="123456" onChange={() => {}} />);
    expect(screen.queryByText('6 dígitos')).toBeNull();
  });

  it('permite personalizar la etiqueta (se reusa en varias acciones)', () => {
    render(<PinField value="" onChange={() => {}} label="PIN para anular" />);
    expect(screen.getByText(/PIN para anular/)).toBeDefined();
  });

  it('respeta `disabled`', () => {
    render(<PinField value="" onChange={() => {}} disabled />);
    expect(pinInput().disabled).toBe(true);
  });
});
