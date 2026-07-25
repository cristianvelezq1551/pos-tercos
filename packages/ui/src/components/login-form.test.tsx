// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

/**
 * Puerta de entrada de las TRES apps (admin/POS, cocina, y el login del dueño).
 * Mutantes que estos tests matan:
 * - el guard de `isLoading` roto → doble submit y dos sesiones/intentos, que
 *   además consumen el rate-limit anti-fuerza-bruta del backend.
 * - el botón habilitado con campos vacíos → request garantizada a fallar.
 * - el error sin `role="alert"` → el lector de pantalla no anuncia el fallo.
 */

const email = () => screen.getByLabelText('Email') as HTMLInputElement;
const password = () => screen.getByLabelText('Contraseña') as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /ingresar/i }) as HTMLButtonElement;

function fill(values = { email: 'dueno@dev.local', password: 'dev12345' }) {
  fireEvent.change(email(), { target: { value: values.email } });
  fireEvent.change(password(), { target: { value: values.password } });
}

describe('LoginForm — envío de credenciales', () => {
  it('manda email y contraseña tal cual', () => {
    const onSubmit = vi.fn();
    render(<LoginForm appLabel="Admin" onSubmit={onSubmit} />);
    fill();
    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'dueno@dev.local',
      password: 'dev12345',
    });
  });

  it('no recarga la página (el submit nativo perdería el estado)', () => {
    const onSubmit = vi.fn();
    render(<LoginForm appLabel="Admin" onSubmit={onSubmit} />);
    fill();
    const form = submit().closest('form')!;
    const evt = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('mientras carga NO vuelve a enviar (evita el doble intento)', () => {
    const onSubmit = vi.fn();
    render(<LoginForm appLabel="Admin" onSubmit={onSubmit} isLoading />);
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('LoginForm — estado del botón', () => {
  it('arranca deshabilitado con los campos vacíos', () => {
    render(<LoginForm appLabel="Admin" onSubmit={vi.fn()} />);
    expect(submit().disabled).toBe(true);
  });

  it('sigue deshabilitado con solo uno de los dos campos', () => {
    render(<LoginForm appLabel="Admin" onSubmit={vi.fn()} />);
    fireEvent.change(email(), { target: { value: 'a@b.co' } });
    expect(submit().disabled).toBe(true);
  });

  it('se habilita con ambos campos', () => {
    render(<LoginForm appLabel="Admin" onSubmit={vi.fn()} />);
    fill();
    expect(submit().disabled).toBe(false);
  });

  it('mientras carga se bloquea y avisa', () => {
    render(<LoginForm appLabel="Admin" onSubmit={vi.fn()} isLoading />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/Ingresando/);
    expect(email().disabled).toBe(true);
    expect(password().disabled).toBe(true);
  });
});

describe('LoginForm — errores', () => {
  it('muestra el error del backend y lo anuncia a lectores de pantalla', () => {
    render(
      <LoginForm appLabel="Admin" onSubmit={vi.fn()} errorMessage="Credenciales inválidas" />,
    );
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toBe('Credenciales inválidas');
    expect(alerta.getAttribute('aria-live')).toBe('polite');
  });

  it('sin error no renderiza la alerta', () => {
    render(<LoginForm appLabel="Admin" onSubmit={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('LoginForm — accesibilidad y personalización', () => {
  it('los campos tienen el tipo y autocomplete correctos', () => {
    render(<LoginForm appLabel="Admin" onSubmit={vi.fn()} />);
    expect(email().type).toBe('email');
    expect(email().getAttribute('autocomplete')).toBe('email');
    expect(password().type).toBe('password');
    expect(password().getAttribute('autocomplete')).toBe('current-password');
  });

  it('muestra la app a la que se entra (evita loguearse en la equivocada)', () => {
    render(<LoginForm appLabel="Cocina Tercos" onSubmit={vi.fn()} />);
    expect(screen.getByText('Cocina Tercos')).toBeDefined();
  });

  it('un header propio reemplaza al default', () => {
    render(
      <LoginForm appLabel="Admin" onSubmit={vi.fn()} header={<h1>Bienvenido a Tercos</h1>} />,
    );
    expect(screen.getByText('Bienvenido a Tercos')).toBeDefined();
    expect(screen.queryByText('Iniciar sesión')).toBeNull();
  });

  it('permite cambiar la etiqueta del botón y agregar un pie', () => {
    render(
      <LoginForm
        appLabel="Admin"
        onSubmit={vi.fn()}
        submitLabel="Entrar al POS"
        footerSlot={<a href="/ayuda">¿Olvidaste tu clave?</a>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Entrar al POS' })).toBeDefined();
    expect(screen.getByText('¿Olvidaste tu clave?')).toBeDefined();
  });
});
