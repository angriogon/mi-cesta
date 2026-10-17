import type { Session } from "@supabase/supabase-js";
import { House, LoaderCircle, LogIn, Mail, ShoppingBasket, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CestaApi } from "../data/api";
import { LocalDb } from "../data/local-db";
import { seedIfEmpty } from "../data/seed";
import { SupabaseDb } from "../data/supabase-db";
import { readText, writeText } from "../lib/storage";
import { Button, Input } from "../ui/primitives";
import {
  createHousehold,
  joinHousehold,
  localAccount,
  myHouseholds,
  supabaseAccount,
  translateAuthError,
  type HouseholdSummary,
} from "./account";
import { CestaApp } from "./CestaApp";
import { backendMode, externalPrices, supabase } from "./config";

const HOUSEHOLD_KEY = "cesta-household-id";

export function Root() {
  return backendMode === "local" ? <LocalRoot /> : <SupabaseRoot />;
}

function LocalRoot() {
  const [api, setApi] = useState<CestaApi | null>(null);
  useEffect(() => {
    let id = readText("cesta-local-household");
    if (!id) {
      id = crypto.randomUUID();
      writeText("cesta-local-household", id);
    }
    const db = new LocalDb(id);
    void seedIfEmpty(db).then(() => setApi(new CestaApi(db)));
  }, []);
  const account = useMemo(() => localAccount(), []);
  if (!api) return <Splash />;
  return <CestaApp api={api} account={account} />;
}

function SupabaseRoot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [households, setHouseholds] = useState<HouseholdSummary[] | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(() => readText(HOUSEHOLD_KEY));
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    const auth = supabase().auth;
    void auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setHouseholds(null);
      return;
    }
    void myHouseholds()
      .then((list) => {
        setHouseholds(list);
        setHouseholdId((current) => (current && list.some((item) => item.id === current) ? current : (list[0]?.id ?? null)));
      })
      .catch(() => setHouseholds([]));
  }, [session]);

  useEffect(() => {
    if (householdId) writeText(HOUSEHOLD_KEY, householdId);
  }, [householdId]);

  const api = useMemo(
    () => (session && householdId ? new CestaApi(new SupabaseDb(supabase(), householdId), externalPrices()) : null),
    [session, householdId],
  );
  const account = useMemo(
    () =>
      session && householdId
        ? supabaseAccount(session.user.email ?? "", householdId, () => {
            setHouseholdId(null);
            setHouseholds((list) => list?.filter((item) => item.id !== householdId) ?? null);
          })
        : null,
    [session, householdId],
  );

  if (session === undefined) return <Splash />;
  if (recovering && session) return <NewPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <AuthScreen />;
  if (households === null) return <Splash />;
  if (!householdId || !api || !account)
    return (
      <HouseholdScreen
        onReady={(id) => {
          setHouseholdId(id);
          void myHouseholds().then(setHouseholds);
        }}
      />
    );
  return <CestaApp key={householdId} api={api} account={account} />;
}

export function Splash() {
  return (
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col items-center justify-center bg-[#f6f8f3] dark:bg-background" aria-label="Iniciando Cesta">
      <div className="flex size-[76px] items-center justify-center rounded-[24px] bg-primary text-primary-foreground shadow-[0_18px_44px_rgba(41,91,63,.22)]">
        <ShoppingBasket className="size-8" strokeWidth={1.8} />
      </div>
      <p className="mt-4 text-[17px] font-bold tracking-[-0.02em] text-[#1f2d23] dark:text-foreground">Cesta</p>
      <p className="absolute bottom-[calc(1.4rem+env(safe-area-inset-bottom))] text-[7px] font-semibold uppercase tracking-[0.18em] text-[#7f8a81]">
        Powered by AR
      </p>
    </div>
  );
}

function Card({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background px-4 py-[calc(1.5rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex min-h-[80dvh] max-w-[420px] items-center">
        <section className="w-full rounded-[24px] border border-border bg-card p-5 shadow-[0_18px_50px_rgba(32,47,38,.1)]">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">{icon}</div>
          <h1 className="mt-4 text-center text-xl font-bold">{title}</h1>
          <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">{text}</p>
          {children}
        </section>
      </div>
    </div>
  );
}

function AuthScreen() {
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
        const { data, error: failure } = await auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } });
        if (failure) throw failure;
        if (!data.session) setMessage("Te hemos enviado un email para confirmar la cuenta. Ábrelo desde este dispositivo.");
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
        <label className="block text-xs font-bold text-muted-foreground">
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
          <label className="block text-xs font-bold text-muted-foreground">
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
          <p className="text-xs font-semibold text-[#a34141]" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-xl bg-[#eaf3eb] px-3 py-2 text-xs font-semibold text-primary" role="status">
            {message}
          </p>
        )}
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-2xl">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : mode === "reset" ? <Mail className="size-4" /> : <LogIn className="size-4" />}
          {mode === "login" ? " Entrar" : mode === "signup" ? " Crear cuenta" : " Enviar enlace"}
        </Button>
      </form>
      <div className="mt-4 flex flex-col items-center gap-2 text-xs font-bold text-primary">
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

function NewPasswordScreen({ onDone }: { onDone: () => void }) {
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
    <Card icon={<LogIn className="size-5" />} title="Elige una contraseña nueva" text="La usarás para entrar y para confirmar acciones importantes.">
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
          <p className="text-xs font-semibold text-[#a34141]" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-2xl">
          Guardar contraseña
        </Button>
      </form>
    </Card>
  );
}

function HouseholdScreen({ onReady }: { onReady: (id: string) => void }) {
  const [name, setName] = useState("Mi hogar");
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get("hogar") ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<string>) {
    setError("");
    setBusy(true);
    try {
      const id = await action();
      const url = new URL(window.location.href);
      url.searchParams.delete("hogar");
      window.history.replaceState(null, "", url);
      onReady(id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se ha podido completar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card icon={<House className="size-5" />} title="Tu hogar" text="Crea un hogar nuevo o únete al de tu familia con su código de invitación.">
      {code && (
        <p className="mt-4 rounded-xl bg-[#eaf3eb] px-3 py-2 text-center text-xs font-semibold text-primary">
          Te han invitado a un hogar. Pulsa «Unirme» para entrar.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => joinHousehold(code));
        }}
        className="mt-5 space-y-2"
      >
        <label className="block text-xs font-bold text-muted-foreground">
          Código de invitación
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            placeholder="ABC123"
            autoCapitalize="characters"
            className="mt-1.5 h-11 rounded-xl text-center tracking-[.2em]"
          />
        </label>
        <Button type="submit" disabled={busy || code.length < 6} className="h-11 w-full rounded-xl">
          <Users className="size-4" /> Unirme
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> o <span className="h-px flex-1 bg-border" />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => createHousehold(name));
        }}
        className="space-y-2"
      >
        <label className="block text-xs font-bold text-muted-foreground">
          Nombre del hogar
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} className="mt-1.5 h-11 rounded-xl" />
        </label>
        <Button type="submit" variant="outline" disabled={busy || !name.trim()} className="h-11 w-full rounded-xl">
          <House className="size-4" /> Crear hogar nuevo
        </Button>
      </form>
      {error && (
        <p className="mt-3 text-xs font-semibold text-[#a34141]" role="alert">
          {error}
        </p>
      )}
      <button type="button" onClick={() => void supabase().auth.signOut()} className="mt-5 w-full text-center text-xs font-bold text-muted-foreground">
        Cerrar sesión
      </button>
    </Card>
  );
}
