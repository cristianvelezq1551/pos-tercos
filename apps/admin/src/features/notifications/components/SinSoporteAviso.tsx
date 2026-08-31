import { Card } from '@pos-tercos/ui';

const TEXTOS = {
  'sin-instalar-ios':
    'En iPhone y iPad los avisos solo funcionan si abres el admin desde un icono de la pantalla de inicio. Abre esta página en Safari, toca el botón de compartir, elige "Agregar a pantalla de inicio", y después entra por ese icono y actívalos acá. Desde el navegador, aunque sea Chrome, no van a funcionar.',
  'sin-https':
    'Los avisos necesitan una conexión segura (https). Abre la página por su dirección normal y vuelve a intentar.',
  'sin-soporte':
    'Este navegador no puede recibir avisos. Chrome, Edge y Firefox sí pueden, tanto en el celular como en el computador.',
} as const;

export function SinSoporteAviso({ motivo }: { motivo: keyof typeof TEXTOS }) {
  return (
    <Card className="border-amber-500/40 bg-amber-500/10 p-5 text-sm">
      <h2 className="font-medium">Este dispositivo no puede recibir avisos</h2>
      <p className="mt-2 text-ink-300">{TEXTOS[motivo]}</p>
    </Card>
  );
}
