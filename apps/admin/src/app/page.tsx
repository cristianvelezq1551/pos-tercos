import { Button } from '@pos-tercos/ui';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-12 text-center">
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
        APP: admin (puerto 3004)
      </span>
      <h1 className="mt-6 text-4xl font-bold tracking-tight">Admin — POS Tercos</h1>
      <p className="mt-4 max-w-md text-gray-600">
        Placeholder. La superficie se construye en multi-fase: gestión de productos, recetas,
        inventario, proveedores, reportes, anti-fraude y RRHH.
      </p>

      <div className="mt-8 flex gap-3">
        <Button>Default</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="ghost">Ghost</Button>
      </div>

      <p className="mt-8 text-sm text-gray-400">
        v0.0.0 · FASE 0 · setup · Buttons importados desde @pos-tercos/ui
      </p>
    </main>
  );
}
