import {
  Download,
  Euro,
  House,
  Link2,
  KeyRound,
  LogOut,
  Moon,
  PackageCheck,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Sun,
  UserX,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CestaApi } from "../data/api";
import type { Household, PriceMeta } from "../data/types";
import { type Account } from "../app/account";
import { saveTheme, storedTheme, type Theme } from "../lib/theme";
import { LOAD_FAILED, notifyError, reportError } from "../lib/errors";
import { MenuGroup, MenuButton } from "./menu/MenuList";
import { HouseholdPage } from "./menu/HouseholdPage";
import { PricesPage } from "./menu/PricesPage";
import { PasswordPage, ResetPage } from "./menu/AccountPages";
import { DietPage, NewsPage } from "./menu/InfoPages";
import { DeleteAccountPage, ExportPage } from "./menu/PrivacyPages";
import { LegalPage } from "./legal/LegalPage";
import { EquivalencesPage } from "./menu/EquivalencesPage";

type Page =
  | "home"
  | "household"
  | "diet"
  | "news"
  | "password"
  | "reset"
  | "prices"
  | "export"
  | "delete"
  | "legal"
  | "equivalences";

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
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => {
    api.household().then(setHousehold).catch(notifyError("cargar preferencias", LOAD_FAILED));
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
    } catch (error) {
      reportError(error, "menú");
      setMessage("No se han podido actualizar. Comprueba la conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Cerrar menú"
        tabIndex={-1}
        className="absolute inset-0 bg-overlay"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        className="flex h-[100dvh] w-[78%] max-w-[300px] flex-col overflow-y-auto overscroll-contain bg-background px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] relative"
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShoppingBasket className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Cesta</p>
              {household && <p className="truncate text-xs text-muted-foreground">{household.name}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              aria-label={
                theme === "dark" ? "Modo oscuro activado. Cambiar a claro" : "Modo claro activado. Cambiar a oscuro"
              }
              onClick={() => {
                const next: Theme = theme === "dark" ? "light" : "dark";
                saveTheme(next);
                setTheme(next);
              }}
              className="flex size-11 items-center justify-center rounded-full text-primary active:opacity-40"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar menú"
              className="flex size-11 items-center justify-center rounded-full text-muted-foreground active:opacity-40"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        {page !== "home" && (
          <button
            type="button"
            onClick={() => go("home")}
            className="mt-5 self-start py-1 text-xs font-semibold text-primary"
          >
            ← Volver al menú
          </button>
        )}
        <div className="mt-5 flex-1">
          {page === "home" && (
            <div className="space-y-6 [&_button]:whitespace-nowrap">
              <div>
                <MenuGroup>
                  <MenuButton tile="bg-primary" icon={<PackageCheck />} onClick={onOpenQuickInventory}>
                    Inventario rápido
                  </MenuButton>
                  <MenuButton tile="bg-warning" icon={<Utensils />} onClick={onOpenRecipes}>
                    Recetas con mi stock
                  </MenuButton>
                  <MenuButton tile="bg-info" icon={<Euro />} onClick={() => void refreshPrices()} disabled={busy}>
                    Actualizar precios
                  </MenuButton>
                </MenuGroup>
                <p className="mt-1.5 px-4 text-[0.8125rem] leading-[18px] whitespace-normal text-muted-foreground">
                  {priceMeta.lastSuccessfulAt
                    ? `Última actualización: ${new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(priceMeta.lastSuccessfulAt))}`
                    : "Precios aún no actualizados"}
                  {" · "}
                  <button type="button" onClick={() => go("prices")} className="text-primary">
                    {priceMeta.postalCode ? `CP ${priceMeta.postalCode}` : "Indicar código postal"}
                  </button>
                </p>
                {message && (
                  <p
                    className="mt-1 px-4 text-[0.8125rem] leading-[18px] whitespace-normal text-muted-foreground"
                    role="status"
                  >
                    {message}
                  </p>
                )}
              </div>
              <MenuGroup>
                <MenuButton tile="bg-primary" icon={<House />} onClick={() => go("household")}>
                  Mi hogar
                </MenuButton>
                <MenuButton tile="bg-warning" icon={<Link2 />} onClick={() => go("equivalences")}>
                  Equivalencias de tickets
                </MenuButton>
                <MenuButton tile="bg-danger" icon={<ShieldCheck />} onClick={() => go("diet")}>
                  Alimentación especial
                </MenuButton>
                <MenuButton tile="bg-info" icon={<Sparkles />} onClick={() => go("news")}>
                  Novedades
                </MenuButton>
                {account.mode === "supabase" && (
                  <MenuButton tile="bg-muted-foreground" icon={<KeyRound />} onClick={() => go("password")}>
                    Modificar contraseña
                  </MenuButton>
                )}
                <MenuButton tile="bg-muted-foreground" icon={<Download />} onClick={() => go("export")}>
                  Exportar mis datos
                </MenuButton>
                <MenuButton tile="bg-muted-foreground" icon={<ScrollText />} onClick={() => go("legal")}>
                  Privacidad y condiciones
                </MenuButton>
              </MenuGroup>
              <MenuGroup>
                <MenuButton tone="danger" icon={<RotateCcw />} onClick={() => go("reset")}>
                  Restablecer datos del hogar
                </MenuButton>
                {account.mode === "supabase" && (
                  <MenuButton tone="danger" icon={<LogOut />} onClick={() => void account.signOut()}>
                    Cerrar sesión
                  </MenuButton>
                )}
                {account.mode === "supabase" && (
                  <MenuButton tone="danger" icon={<UserX />} onClick={() => go("delete")}>
                    Eliminar cuenta
                  </MenuButton>
                )}
              </MenuGroup>
            </div>
          )}
          {page === "household" && household && (
            <HouseholdPage api={api} account={account} household={household} onChange={setHousehold} />
          )}
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
          {page === "news" && <NewsPage version={version} />}
          {page === "diet" && household && <DietPage api={api} preferences={household.preferences} />}
          {page === "password" && <PasswordPage account={account} />}
          {page === "reset" && <ResetPage api={api} account={account} onReset={onReset} />}
          {page === "export" && <ExportPage api={api} account={account} />}
          {page === "delete" && <DeleteAccountPage account={account} />}
          {page === "legal" && <LegalPage />}
          {page === "equivalences" && <EquivalencesPage api={api} />}
        </div>
        <p className="border-t-[0.5px] border-separator pt-4 text-center text-xs font-semibold uppercase text-muted-foreground">
          Cesta · Versión {version}
          {account.email ? (
            <span className="mt-1 block normal-case tracking-normal">{account.email}</span>
          ) : (
            <span className="mt-1 block normal-case tracking-normal">Modo local · datos en este dispositivo</span>
          )}
        </p>
      </aside>
    </div>
  );
}
