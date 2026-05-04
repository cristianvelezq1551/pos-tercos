'use client';

export function PaymentInstructionsView({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
        Cómo pagar
      </p>
      <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-blue-900">{text}</pre>
    </div>
  );
}
