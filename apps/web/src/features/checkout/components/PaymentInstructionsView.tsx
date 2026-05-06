'use client';

import { Receipt } from 'lucide-react';

export function PaymentInstructionsView({ text }: { text: string }) {
  return (
    <section
      aria-label="Instrucciones de pago"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
    >
      <header className="flex items-center gap-2.5">
        <Receipt className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Cómo pagar
        </h3>
      </header>
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
        {text}
      </pre>
    </section>
  );
}
