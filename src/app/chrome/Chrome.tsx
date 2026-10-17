import { Archive, Bell, Dog, House, LoaderCircle, PackageCheck, ReceiptText, ShoppingBasket, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCesta } from "../CestaContext";

/** Pantalla de bienvenida mientras se cargan las listas y la despensa. */
export function Splash() {
  const { splash } = useCesta();
  if (!splash.splash) return null;
  return (
    <div
      className={`fixed inset-0 z-[100] flex min-h-[100dvh] flex-col items-center justify-center bg-card transition-opacity duration-300 ${splash.fading ? "opacity-0" : "opacity-100"}`}
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

const SECTION_TITLES: Partial<Record<string, string>> = {
  stock: "Necesidades",
  tickets: "Tickets",
  recipes: "Recetas",
};

/** Barra superior sólida al estilo iOS: botón de menú y título centrado. */
export function TopBar() {
  const { ready, view, pet, setMenuOpen } = useCesta();
  const title = view === "dog" ? pet.petName : SECTION_TITLES[view];
  return (
    <>
      {/* Franja opaca detrás de la cabecera: el contenido no se transparenta al desplazarse. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[19] h-[calc(3.6rem+env(safe-area-inset-top))] border-b-[0.5px] border-separator bg-background"
      />
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        disabled={!ready}
        aria-label="Abrir menú"
        className="fixed left-2 top-[calc(.7rem+env(safe-area-inset-top))] z-20 flex size-11 items-center justify-center rounded-full text-primary active:opacity-40 disabled:opacity-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="size-4.5"
          aria-hidden="true"
        >
          <path d="M4 5h16M4 12h16M4 19h16" />
        </svg>
      </button>
      {title && (
        <div className="pointer-events-none fixed inset-x-16 top-[calc(.7rem+env(safe-area-inset-top))] z-20 flex h-11 items-center justify-center truncate text-[1.0625rem] font-semibold text-foreground">
          {title}
        </div>
      )}
    </>
  );
}

export function PullIndicator({ pull }: { pull: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-30 mx-auto flex max-w-[470px] items-end justify-center overflow-hidden text-primary transition-[height]"
      style={{ height: `${pull}px` }}
    >
      <div className="mb-2 flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-float">
        <LoaderCircle className={`size-3.5 ${pull >= 58 ? "animate-spin" : ""}`} />
        {pull >= 58 ? "Suelta para actualizar" : "Desliza para actualizar"}
      </div>
    </div>
  );
}

function Notice({
  label,
  tone,
  title,
  text,
  onOpen,
  onClose,
}: {
  label: string;
  tone: "primary" | "warning";
  title: string;
  text: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <aside
      className={`mb-5 flex items-start gap-3 rounded-xl p-3.5 ${tone === "primary" ? "bg-primary-soft text-primary" : "bg-warning-soft text-warning"}`}
      aria-label={label}
    >
      <div
        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${tone === "primary" ? "bg-primary text-primary-foreground" : "bg-warning text-white"}`}
      >
        <Bell className="size-4" />
      </div>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5">{text}</span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar aviso"
        className="flex size-9 items-center justify-center rounded-lg active:bg-fill"
      >
        <X className="size-4" />
      </button>
    </aside>
  );
}

/** Avisos encima de la pantalla: reposición, mascota y «guardado en el almacén». */
export function Notices() {
  const { ready, view, setView, needs, needsNotice, setNeedsNotice, petAlert, pet, savedCount, setSavedCount } =
    useCesta();
  return (
    <>
      {needsNotice && ready && needs.length > 0 && (view === "purchase" || view === "stock") && (
        <Notice
          label="Aviso de reposición"
          tone="primary"
          title={`Hay ${needs.length} ${needs.length === 1 ? "producto" : "productos"} por reponer`}
          text="Toca para ver lo que falta en casa."
          onOpen={() => {
            setView("stock");
            setNeedsNotice(false);
          }}
          onClose={() => setNeedsNotice(false)}
        />
      )}
      {petAlert.alert && (
        <Notice
          label={`Aviso de ${pet.petName}`}
          tone="warning"
          title={`Aviso de ${pet.petName}`}
          text={petAlert.alert.title}
          onOpen={() => {
            setView("dog");
            petAlert.setAlert(null);
          }}
          onClose={() => petAlert.setAlert(null)}
        />
      )}
      {savedCount > 0 && view === "purchase" && (
        <output className="mb-5 flex items-center gap-3 rounded-xl bg-card p-3.5 text-sm font-semibold">
          <PackageCheck className="size-5 text-primary" />{" "}
          {savedCount === 1 ? "Producto guardado" : `${savedCount} productos guardados`} en el almacén
          <button
            type="button"
            className="ml-auto text-muted-foreground"
            onClick={() => setSavedCount(0)}
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </output>
      )}
    </>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label,
  badge = 0,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col items-center justify-center gap-0.5 pt-0.5 text-[11px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}
    >
      {icon}
      <span className="max-w-full truncate px-0.5">{label}</span>
      {badge > 0 && (
        <span
          className="absolute left-1/2 top-0.5 ml-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-xs font-medium text-white tabular-nums"
          aria-label={`${badge} pendientes`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/** Barra de pestañas de iOS, pegada abajo. */
export function TabBar() {
  const { view, setView, preparing, storeUnits, needs, pet } = useCesta();
  if (view === "inventory-quick") return null;
  const icon = { className: "size-6", strokeWidth: 1.8 };
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t-[0.5px] border-separator bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto grid h-[3.25rem] w-full max-w-[520px] grid-cols-5">
        <NavButton active={view === "home"} onClick={() => setView("home")} icon={<House {...icon} />} label="Inicio" />
        <NavButton
          active={view === "purchase"}
          onClick={() => setView("purchase")}
          icon={<ShoppingBasket {...icon} />}
          label="Compra"
          badge={preparing + storeUnits}
        />
        <NavButton
          active={view === "stock"}
          onClick={() => setView("stock")}
          icon={<Archive {...icon} />}
          label="Necesidades"
          badge={needs.length}
        />
        <NavButton
          active={view === "dog"}
          onClick={() => setView("dog")}
          icon={<Dog {...icon} />}
          label={pet.petName}
        />
        <NavButton
          active={view === "tickets"}
          onClick={() => setView("tickets")}
          icon={<ReceiptText {...icon} />}
          label="Tickets"
        />
      </div>
    </nav>
  );
}

export function Loading() {
  return (
    <div className="flex min-h-48 items-center justify-center text-primary" role="status" aria-label="Cargando sección">
      <LoaderCircle className="size-5 animate-spin" />
    </div>
  );
}
