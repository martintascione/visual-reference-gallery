export function EmptyPage({ title }: { title: string }) {
  return (
    <div className="card-soft flex min-h-[60vh] flex-col items-center justify-center p-10 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Esta sección todavía está en construcción.</p>
    </div>
  );
}
