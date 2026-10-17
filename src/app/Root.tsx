import type { Session } from "@supabase/supabase-js";
import { ShoppingBasket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CestaApi } from "../data/api";
import { LocalDb } from "../data/local-db";
import { seedIfEmpty } from "../data/seed";
import { SupabaseDb } from "../data/supabase-db";
import { readText, writeText } from "../lib/storage";
import { localAccount, myHouseholds, supabaseAccount, type HouseholdSummary } from "./account";
import { CestaApp } from "./CestaApp";
import { backendMode, externalPrices, supabase } from "./config";
import { AuthScreen, NewPasswordScreen } from "./auth/AuthScreens";
import { HouseholdScreen } from "./auth/HouseholdScreen";

const HOUSEHOLD_KEY = "cesta-household-id";

export function Root() {
  if (backendMode === "local") return <LocalRoot />;
  if (backendMode === "unconfigured") return <Unconfigured />;
  return <SupabaseRoot />;
}

function Unconfigured() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <h1 className="text-lg font-semibold">Cesta no está disponible</h1>
      <p className="mt-2 max-w-72 text-sm leading-6 text-muted-foreground">
        Esta versión no tiene configurado el servidor de cuentas. Vuelve a intentarlo más tarde.
      </p>
    </main>
  );
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
        setHouseholdId((current) =>
          current && list.some((item) => item.id === current) ? current : (list[0]?.id ?? null),
        );
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
    <div
      className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col items-center justify-center bg-card"
      aria-label="Iniciando Cesta"
    >
      <div className="flex size-[76px] items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <ShoppingBasket className="size-8" strokeWidth={1.8} />
      </div>
      <p className="mt-4 text-[1.0625rem] font-semibold text-primary">Cesta</p>
      <p className="absolute bottom-[calc(1.4rem+env(safe-area-inset-bottom))] text-xs font-semibold uppercase text-muted-foreground">
        Powered by AR
      </p>
    </div>
  );
}
