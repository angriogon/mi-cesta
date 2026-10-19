import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RELEASES, type Release } from "../../copy/novedades";
import { UpdateCheck } from "./UpdateCheck";

const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });
const formatDate = (date: string) => (date ? dateFormat.format(new Date(`${date}T12:00:00`)) : "");

function Changes({ release }: { release: Release }) {
  return (
    <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
      {release.changes.map((change) => (
        <li key={change}>• {change}</li>
      ))}
    </ul>
  );
}

/** Cabecera plegable de una versión: al abrir una se pliega la que estuviera abierta. */
function Toggle({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
    >
      <span className="min-w-0">{children}</span>
      <ChevronDown
        className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}

/**
 * Novedades: la versión instalada (abierta al entrar) y las anteriores plegadas. Solo hay una
 * abierta a la vez, para no tener que cerrar a mano la anterior.
 */
export function NewsPage({ version }: { version: string }) {
  const [current, ...previous] = RELEASES;
  const [open, setOpen] = useState<string | null>(current.version);
  const toggle = (release: Release) => setOpen((now) => (now === release.version ? null : release.version));
  return (
    <section>
      <h2 className="text-lg font-semibold">Novedades</h2>
      <div className="mt-4 rounded-xl bg-card p-4">
        <p className="text-xs font-semibold text-primary">Versión {version}</p>
        <UpdateCheck />
        <Toggle open={open === current.version} onToggle={() => toggle(current)}>
          <span className="text-sm font-semibold">{current.title}</span>
        </Toggle>
        {open === current.version && <Changes release={current} />}
      </div>
      {previous.map((release) => (
        <div key={release.version} className="mt-3 rounded-xl bg-card px-4 py-2">
          <Toggle open={open === release.version} onToggle={() => toggle(release)}>
            <span className="text-xs font-semibold">
              Versión {release.version} · {release.title}
              {release.date && <span className="font-normal text-muted-foreground"> · {formatDate(release.date)}</span>}
            </span>
          </Toggle>
          {open === release.version && (
            <div className="pb-2">
              <Changes release={release} />
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
