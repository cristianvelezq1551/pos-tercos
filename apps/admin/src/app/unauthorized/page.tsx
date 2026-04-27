import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-center">
      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
        Acceso denegado
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Tu rol no tiene acceso al Admin</h1>
      <p className="mt-3 max-w-md text-gray-600">
        Solo los roles ADMIN_OPERATIVO y DUENO pueden acceder a esta aplicación.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Volver al login
      </Link>
    </main>
  );
}
