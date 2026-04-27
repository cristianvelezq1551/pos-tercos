import { LogoutButton } from '../features/auth/components/LogoutButton';
import { getCurrentUserServer } from '../features/auth/server';

export default async function Home() {
  const user = await getCurrentUserServer();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-12 text-center">
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
        APP: admin (puerto 3004) · FASE 1 · auth wired
      </span>
      <h1 className="mt-6 text-4xl font-bold tracking-tight">Admin — POS Tercos</h1>

      {user ? (
        <section className="mt-8 w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-left shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Sesión actual</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div>
              <dt className="inline font-medium text-gray-700">Nombre: </dt>
              <dd className="inline text-gray-900">{user.fullName}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-gray-700">Email: </dt>
              <dd className="inline text-gray-900">{user.email}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-gray-700">Rol: </dt>
              <dd className="inline text-gray-900">{user.role}</dd>
            </div>
          </dl>
          <div className="mt-4 flex justify-end">
            <LogoutButton />
          </div>
        </section>
      ) : (
        <p className="mt-6 text-sm text-gray-500">No se pudo cargar la sesión.</p>
      )}

      <p className="mt-8 text-sm text-gray-400">
        v0.0.1 · FASE 1 · auth + middleware · roles permitidos: ADMIN_OPERATIVO, DUENO
      </p>
    </main>
  );
}
