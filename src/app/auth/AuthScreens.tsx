import { LoaderCircle, LogIn, Mail, ShoppingBasket } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Input } from "../../ui/primitives";
import { translateAuthError } from "../account";
import { supabase } from "../config";

export function Card({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background px-4 py-[calc(1.5rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex min-h-[80dvh] max-w-[420px] items-center">
        <section className="w-full rounded-xl bg-card p-5">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            {icon}
          </div>
          <h1 className="mt-4 text-center text-xl font-semibold">{title}</h1>
          <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">{text}</p>
          {children}
        </section>
      </div>
    </div>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Escribe un email válido.");
      return;
    }
    if (mode !== "reset" && password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setBusy(true);
    const auth = supabase().auth;
    const redirectTo = window.location.origin + import.meta.env.BASE_URL;
    try {
      if (mode === "login") {
        const { error: failure } = await auth.signInWithPassword({ email: email.trim(), password });
        if (failure) throw failure;
      } else if (mode === "signup") {
        const { data, error: failure } = await auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (failure) throw failure;
        if (!data.session)
          setMessage("Te hemos enviado un email para confirmar la cuenta. Ábrelo desde este dispositivo.");
      } else {
        const { error: failure } = await auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (failure) throw failure;
        setMessage("Si existe una cuenta con ese email, recibirás un enlace para crear una contraseña nueva.");
      }
    } catch (failure) {
      setError(translateAuthError(failure instanceof Error ? failure.message : String(failure)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      icon={<ShoppingBasket className="size-5" />}
      title={mode === "login" ? "Entra en Cesta" : mode === "signup" ? "Crea tu cuenta" : "Recupera tu contraseña"}
      text={
        mode === "reset"
          ? "Te enviaremos un enlace para elegir una contraseña nueva."
          : "Tu lista, tu almacén y tus tickets, sincronizados con todo tu hogar."
      }
    >
      <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
        <label className="block text-xs font-semibold text-muted-foreground">
          Email
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 h-11 rounded-xl"
          />
        </label>
        {mode !== "reset" && (
          <label className="block text-xs font-semibold text-muted-foreground">
            Contraseña
            <Input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 h-11 rounded-xl"
            />
          </label>
        )}
        {error && (
          <p className="text-xs font-semibold text-danger" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-primary" role="status">
            {message}
          </p>
        )}
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl">
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : mode === "reset" ? (
            <Mail className="size-4" />
          ) : (
            <LogIn className="size-4" />
          )}
          {mode === "login" ? " Entrar" : mode === "signup" ? " Crear cuenta" : " Enviar enlace"}
        </Button>
      </form>
      <div className="mt-4 flex flex-col items-center gap-2 text-xs font-semibold text-primary">
        {mode !== "login" && (
          <button type="button" onClick={() => setMode("login")}>
            Ya tengo cuenta
          </button>
        )}
        {mode !== "signup" && (
          <button type="button" onClick={() => setMode("signup")}>
            Crear una cuenta nueva
          </button>
        )}
        {mode === "login" && (
          <button type="button" onClick={() => setMode("reset")} className="text-muted-foreground">
            He olvidado mi contraseña
          </button>
        )}
      </div>
    </Card>
  );
}

export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Utiliza al menos 8 caracteres.");
      return;
    }
    setBusy(true);
    const { error: failure } = await supabase().auth.updateUser({ password });
    setBusy(false);
    if (failure) setError(translateAuthError(failure.message));
    else onDone();
  }
  return (
    <Card
      icon={<LogIn className="size-5" />}
      title="Elige una contraseña nueva"
      text="La usarás para entrar y para confirmar acciones importantes."
    >
      <form onSubmit={submit} className="mt-5 space-y-3">
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Nueva contraseña"
          className="h-11 rounded-xl"
        />
        {error && (
          <p className="text-xs font-semibold text-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl">
          Guardar contraseña
        </Button>
      </form>
    </Card>
  );
}
