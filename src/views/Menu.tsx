import { Copy, Euro, House, KeyRound, LoaderCircle, LogOut, Moon, PackageCheck, RotateCcw, ShieldCheck, ShoppingBasket, Sparkles, Sun, Utensils, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { CestaApi } from "../data/api";
import type { Household, PriceMeta } from "../data/types";
import { LOCAL_RESET_PHRASE, type Account } from "../app/account";
import { saveTheme, storedTheme, type Theme } from "../lib/theme";
import { Button, Input } from "../ui/primitives";

type Page = "home" | "household" | "diet" | "news" | "password" | "reset" | "prices";

export function Menu({
  api,
  account,
  version,
  priceMeta,
  onOpenRecipes,
  onOpenQuickInventory,
  onRefreshPrices,
  onPostalCodeChange,
  onReset,
  onClose,
}: {
  api: CestaApi;
  account: Account;
  version: string;
  priceMeta: PriceMeta;
  onOpenRecipes: () => void;
  onOpenQuickInventory: () => void;
  onRefreshPrices: () => Promise<{ learned: number; externalUpdated: number; online: boolean }>;
  onPostalCodeChange: (postalCode: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState<Page>("home");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [diet, setDiet] = useState({ enabled: false, allergens: "", avoided: "" });
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => {
    api
      .household()
      .then((data) => {
        setHousehold(data);
        setDiet({
          enabled: data.preferences.specialDietEnabled,
          allergens: data.preferences.allergens.join(", "),
          avoided: data.preferences.avoided.join(", "),
        });
      })
      .catch(() => undefined);
  }, [api]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function go(next: Page) {
    setPage(next);
    setMessage("");
  }

  async function refreshPrices() {
    if (!priceMeta.postalCode) {
      go("prices");
      return;
    }
    setBusy(true);
    setMessage("Actualizando precios…");
    try {
      const result = await onRefreshPrices();
      setMessage(
        result.online
          ? `${result.learned + result.externalUpdated} precios revisados · ${result.learned} desde tickets y ${result.externalUpdated} de Mercadona.`
          : result.learned
            ? `${result.learned} precios actualizados desde tus tickets. Sin conexión con el catálogo externo.`
            : "No hay precios nuevos. Guarda tickets para que Cesta aprenda lo que pagas.",
      );
    } catch {
      setMessage("No se han podido actualizar. Comprueba la conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#17251c]/30 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        className="flex min-h-[100dvh] w-[78%] max-w-[300px] flex-col overflow-y-auto bg-background px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] shadow-[18px_0_50px_rgba(20,35,25,.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShoppingBasket className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold">Cesta</p>
              {household && <p className="truncate text-[10px] text-muted-foreground">{household.name}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              aria-label={theme === "dark" ? "Modo oscuro activado. Cambiar a claro" : "Modo claro activado. Cambiar a oscuro"}
              onClick={() => {
                const next: Theme = theme === "dark" ? "light" : "dark";
                saveTheme(next);
                setTheme(next);
              }}
              className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-primary"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <button type="button" onClick={onClose} aria-label="Cerrar menú" className="flex size-10 items-center justify-center rounded-xl border border-border bg-card">
              <X className="size-4" />
            </button>
          </div>
        </div>
        {page !== "home" && (
          <button type="button" onClick={() => go("home")} className="mt-5 self-start py-1 text-xs font-bold text-primary">
            ← Volver al menú
          </button>
        )}
        <div className="mt-5 flex-1">
          {page === "home" && (
            <div className="space-y-2 [&_button]:whitespace-nowrap">
              <MenuButton tone="primary" icon={<PackageCheck className="size-4 shrink-0" />} onClick={onOpenQuickInventory}>
                Inventario rápido
              </MenuButton>
              <MenuButton icon={<Utensils className="size-4 shrink-0 text-primary" />} onClick={onOpenRecipes}>
                Recetas con mi stock
              </MenuButton>
              <MenuButton icon={<Euro className="size-4 shrink-0 text-primary" />} onClick={() => void refreshPrices()} disabled={busy}>
                Actualizar precios
              </MenuButton>
              <p className="px-1 text-[9px] leading-3 text-muted-foreground">
                {priceMeta.lastSuccessfulAt
                  ? `Última actualización: ${new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(priceMeta.lastSuccessfulAt))}`
                  : "Precios aún no actualizados"}
                {" · "}
                <button type="button" onClick={() => go("prices")} className="font-bold text-primary">
                  {priceMeta.postalCode ? `CP ${priceMeta.postalCode}` : "Indicar código postal"}
                </button>
              </p>
              {message && <p className="rounded-lg bg-muted px-2 py-1.5 text-[10px] font-semibold whitespace-normal text-muted-foreground" role="status">{message}</p>}
              <MenuButton icon={<House className="size-4 shrink-0 text-primary" />} onClick={() => go("household")}>
                Mi hogar
              </MenuButton>
              <MenuButton icon={<ShieldCheck className="size-4 shrink-0 text-primary" />} onClick={() => go("diet")}>
                Alimentación especial
              </MenuButton>
              <MenuButton icon={<Sparkles className="size-4 shrink-0 text-primary" />} onClick={() => go("news")}>
                Novedades
              </MenuButton>
              {account.mode === "supabase" && (
                <MenuButton icon={<KeyRound className="size-4 shrink-0 text-primary" />} onClick={() => go("password")}>
                  Modificar contraseña
                </MenuButton>
              )}
              <button
                type="button"
                onClick={() => go("reset")}
                className="mt-6 flex h-12 w-full items-center gap-2.5 rounded-xl border border-[#edd8d3] bg-[#fbf3f1] px-3 text-left text-xs font-bold text-[#9b3f38] dark:border-border dark:bg-card"
              >
                <RotateCcw className="size-4 shrink-0" /> Restablecer datos del hogar
              </button>
              {account.mode === "supabase" && (
                <MenuButton icon={<LogOut className="size-4 shrink-0 text-muted-foreground" />} onClick={() => void account.signOut()}>
                  Cerrar sesión
                </MenuButton>
              )}
            </div>
          )}
          {page === "household" && household && <HouseholdPage api={api} account={account} household={household} onChange={setHousehold} />}
          {page === "prices" && (
            <PricesPage
              api={api}
              postalCode={priceMeta.postalCode}
              onSaved={(postalCode) => {
                onPostalCodeChange(postalCode);
                go("home");
              }}
            />
          )}
          {page === "news" && (
            <section>
              <h2 className="text-lg font-bold">Novedades</h2>
              <div className="mt-4 rounded-[18px] border border-border bg-card p-4">
                <p className="text-xs font-bold text-primary">Versión {version}</p>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                  <li>• Cuentas y hogares compartidos: toda la familia ve la misma lista al momento.</li>
                  <li>• Funciona sin conexión y se instala en la pantalla de inicio.</li>
                  <li>• Caducidades editables: pon la fecha más tarde o retira lo gastado.</li>
                  <li>• Deshacer al borrar productos y al vaciar la lista.</li>
                  <li>• Los tickets guardan sus líneas y aprenden tus correcciones.</li>
                  <li>• Modo oscuro y mejoras de accesibilidad.</li>
                </ul>
              </div>
              <div className="mt-3 rounded-[18px] border border-border bg-card p-4">
                <p className="text-xs font-bold">Versión 4</p>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                  <li>• Inventario rápido por zonas, voz, tickets, cámara y fotografías.</li>
                  <li>• Memoria de consumo y caducidades estimadas.</li>
                  <li>• Sugerencias silenciosas explicadas y controlables.</li>
                  <li>• Compra provisional conciliada con el ticket para evitar duplicados.</li>
                  <li>• Recetas encadenadas con tiempos e instrucciones realistas.</li>
                </ul>
              </div>
            </section>
          )}
          {page === "diet" && (
            <section>
              <h2 className="text-lg font-bold">Alimentación especial</h2>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                Con el perfil activo, las recetas marcan los ingredientes que coinciden. Desactivado no se muestra ningún aviso.
              </p>
              <form
                onSubmit={async (event: FormEvent) => {
                  event.preventDefault();
                  setBusy(true);
                  const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
                  try {
                    await api.savePreferences({ specialDietEnabled: diet.enabled, allergens: split(diet.allergens), avoided: split(diet.avoided) });
                    setMessage("Perfil alimentario guardado.");
                  } catch {
                    setMessage("No se ha podido guardar.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="mt-4 space-y-3"
              >
                <label className="flex items-center justify-between rounded-xl bg-muted p-3 text-xs font-bold">
                  Activar perfil
                  <input type="checkbox" checked={diet.enabled} onChange={(event) => setDiet({ ...diet, enabled: event.target.checked })} className="size-5 accent-primary" />
                </label>
                <label className="block text-[11px] font-bold text-muted-foreground">
                  Alérgenos
                  <Input value={diet.allergens} onChange={(event) => setDiet({ ...diet, allergens: event.target.value })} placeholder="gluten, leche, frutos secos" className="mt-1 h-11 rounded-xl text-sm" />
                </label>
                <label className="block text-[11px] font-bold text-muted-foreground">
                  Alimentos a evitar
                  <Input value={diet.avoided} onChange={(event) => setDiet({ ...diet, avoided: event.target.value })} placeholder="cerdo, alcohol…" className="mt-1 h-11 rounded-xl text-sm" />
                </label>
                {message && <p className="text-[11px] font-semibold text-muted-foreground" role="status">{message}</p>}
                <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl">
                  Guardar perfil
                </Button>
              </form>
            </section>
          )}
          {page === "password" && <PasswordPage account={account} />}
          {page === "reset" && <ResetPage api={api} account={account} onReset={onReset} />}
        </div>
        <p className="border-t border-border pt-4 text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Cesta · Versión {version}
          {account.email ? <span className="mt-1 block normal-case tracking-normal">{account.email}</span> : <span className="mt-1 block normal-case tracking-normal">Modo local · datos en este dispositivo</span>}
        </p>
      </aside>
    </div>
  );
}

function MenuButton({
  icon,
  children,
  onClick,
  disabled,
  tone,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 w-full items-center gap-2.5 rounded-xl border px-3 text-left text-xs font-bold disabled:opacity-60 ${tone === "primary" ? "border-[#d8e5d9] bg-[#eaf3eb] text-[#20462f] dark:border-border dark:bg-secondary dark:text-secondary-foreground" : "border-border bg-card"}`}
    >
      {disabled ? <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" /> : icon} {children}
    </button>
  );
}

function HouseholdPage({ api, account, household, onChange }: { api: CestaApi; account: Account; household: Household; onChange: (household: Household) => void }) {
  const [name, setName] = useState(household.name);
  const [members, setMembers] = useState<{ email: string; role: string }[]>([]);
  const [message, setMessage] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const inviteUrl = `${window.location.origin}${import.meta.env.BASE_URL}?hogar=${household.inviteCode}`;

  useEffect(() => {
    account.members().then(setMembers).catch(() => undefined);
  }, [account]);

  async function share() {
    const text = `Únete a «${household.name}» en Cesta con el código ${household.inviteCode}: ${inviteUrl}`;
    try {
      if (navigator.share) await navigator.share({ title: "Cesta", text, url: inviteUrl });
      else {
        await navigator.clipboard.writeText(text);
        setMessage("Invitación copiada.");
      }
    } catch {
      // El usuario cerró la hoja de compartir.
    }
  }

  return (
    <section>
      <h2 className="text-lg font-bold">Mi hogar</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await api.renameHousehold(name);
            onChange({ ...household, name: name.trim() });
            setMessage("Nombre guardado.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "No se ha podido guardar.");
          }
        }}
        className="mt-4 grid grid-cols-[1fr_auto] gap-2"
      >
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} aria-label="Nombre del hogar" className="h-11 rounded-xl text-sm" />
        <Button type="submit" variant="outline" disabled={!name.trim() || name.trim() === household.name} className="h-11 rounded-xl">
          Guardar
        </Button>
      </form>
      {account.mode === "supabase" ? (
        <>
          <div className="mt-4 rounded-[18px] border border-border bg-card p-4">
            <p className="text-xs font-bold">Invitar a alguien</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Comparte el código. Al entrar con su cuenta verá la misma lista y almacén.</p>
            <p className="mt-3 text-center font-mono text-2xl font-bold tracking-[.3em] text-primary">{household.inviteCode}</p>
            <Button onClick={() => void share()} className="mt-3 h-11 w-full rounded-xl">
              <Copy className="size-4" /> Compartir invitación
            </Button>
          </div>
          {members.length > 0 && (
            <div className="mt-3 rounded-[18px] border border-border bg-card p-4">
              <p className="text-xs font-bold">Miembros</p>
              <ul className="mt-2 space-y-1 text-[12px]">
                {members.map((member) => (
                  <li key={member.email} className="flex items-center justify-between gap-2">
                    <span className="truncate">{member.email}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{member.role === "owner" ? "Creador" : "Miembro"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={() => (confirmLeave ? void account.leaveHousehold() : setConfirmLeave(true))}
            className="mt-4 w-full rounded-xl border border-[#edd8d3] bg-[#fbf3f1] py-3 text-xs font-bold text-[#9b3f38] dark:border-border dark:bg-card"
          >
            {confirmLeave ? "Toca otra vez para salir del hogar" : "Salir de este hogar"}
          </button>
        </>
      ) : (
        <p className="mt-4 rounded-[18px] border border-border bg-card p-4 text-[11px] leading-5 text-muted-foreground">
          Estás en modo local: los datos se guardan solo en este dispositivo. Para compartir la lista con tu familia, configura Cesta con un servidor Supabase.
        </p>
      )}
      {message && <p className="mt-3 text-[11px] font-semibold text-muted-foreground" role="status">{message}</p>}
    </section>
  );
}

function PricesPage({ api, postalCode, onSaved }: { api: CestaApi; postalCode: string; onSaved: (postalCode: string) => void }) {
  const [value, setValue] = useState(postalCode);
  const [error, setError] = useState("");
  return (
    <section>
      <h2 className="text-lg font-bold">Precios</h2>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        Cesta aprende los precios de tus tickets. Con tu código postal también consulta los precios de fruta y verdura de Mercadona en tu zona.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await api.setPostalCode(value);
            onSaved(value.trim());
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "No se ha podido guardar.");
          }
        }}
        className="mt-4 space-y-3"
      >
        <label className="block text-[11px] font-bold text-muted-foreground">
          Código postal
          <Input
            value={value}
            inputMode="numeric"
            maxLength={5}
            onChange={(event) => setValue(event.target.value.replace(/\D/g, ""))}
            placeholder="41300"
            className="mt-1 h-11 rounded-xl text-sm"
          />
        </label>
        {error && <p className="text-[11px] font-semibold text-[#a34141]" role="alert">{error}</p>}
        <Button type="submit" className="h-11 w-full rounded-xl">
          Guardar
        </Button>
      </form>
    </section>
  );
}

function PasswordPage({ account }: { account: Account }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <h2 className="text-lg font-bold">Modificar contraseña</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setMessage("");
          if (next.length < 8) return setMessage("La nueva contraseña debe tener al menos 8 caracteres.");
          if (next !== repeat) return setMessage("Las contraseñas nuevas no coinciden.");
          setBusy(true);
          try {
            await account.changePassword(current, next);
            setCurrent("");
            setNext("");
            setRepeat("");
            setMessage("Contraseña actualizada.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "No se ha podido cambiar.");
          } finally {
            setBusy(false);
          }
        }}
        className="mt-4 space-y-3"
      >
        <Input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} placeholder="Contraseña actual" className="h-11 rounded-xl" />
        <Input type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} placeholder="Nueva contraseña" className="h-11 rounded-xl" />
        <Input type="password" autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} placeholder="Repetir nueva contraseña" className="h-11 rounded-xl" />
        {message && (
          <p className={`text-xs font-semibold ${message.includes("actualizada") ? "text-primary" : "text-[#a34141]"}`} role="status">
            {message}
          </p>
        )}
        <Button type="submit" disabled={busy || !current} className="h-11 w-full rounded-xl">
          {busy && <LoaderCircle className="size-4 animate-spin" />} Guardar cambio
        </Button>
      </form>
    </section>
  );
}

function ResetPage({ api, account, onReset }: { api: CestaApi; account: Account; onReset: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const local = account.mode === "local";
  return (
    <section>
      <h2 className="text-lg font-bold text-[#943e37]">Restablecer datos del hogar</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Se eliminarán Compra, Lista, almacén, caducidades, tickets, precios y los artículos y avisos de la mascota de todo el hogar. El catálogo base se conserva con existencias a cero. Esta acción no se puede deshacer.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setBusy(true);
          try {
            if (!(await account.verifyPassword(password))) throw new Error(local ? `Escribe ${LOCAL_RESET_PHRASE} para confirmar.` : "La contraseña no es correcta.");
            await api.resetHousehold();
            for (const key of Object.keys(window.localStorage)) {
              if (key.startsWith("cesta-dog-reminder-") || key.startsWith("cesta-category-memory-v1")) window.localStorage.removeItem(key);
            }
            onReset();
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "No se ha podido restablecer.");
            setBusy(false);
          }
        }}
        className="mt-4 space-y-3"
      >
        <Input
          type={local ? "text" : "password"}
          autoComplete={local ? "off" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={local ? `Escribe ${LOCAL_RESET_PHRASE}` : "Contraseña de tu cuenta"}
          className="h-11 rounded-xl"
        />
        {error && (
          <p className="text-xs font-semibold text-[#a34141]" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !password} className="h-11 w-full rounded-xl bg-[#a34141] text-white hover:bg-[#923936]">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Restablecer todo
        </Button>
      </form>
    </section>
  );
}
