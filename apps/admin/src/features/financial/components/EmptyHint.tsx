export function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
      {text}
    </p>
  );
}
