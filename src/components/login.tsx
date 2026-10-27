import { useState, type FormEvent } from "react";
import { Lock, Mountain } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Field, Input, btn } from "./ui-bits";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Email o contraseña incorrectos." : error.message);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card-soft flex w-full max-w-sm flex-col gap-4 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
            <Mountain className="h-6 w-6" strokeWidth={1.6} />
          </span>
          <h1 className="text-lg font-bold">Panel del corralón</h1>
          <p className="text-xs text-muted-foreground">Ingresá con tu usuario para ver las ventas, el stock y la caja.</p>
        </div>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </Field>
        <Field label="Contraseña">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <p className="rounded-2xl bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">{error}</p>}
        <button type="submit" className={`${btn.primary} h-11`} disabled={busy}>
          <Lock className="h-4 w-4" strokeWidth={1.6} /> {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
