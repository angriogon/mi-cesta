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

/** Novedades: la versión instalada con sus cambios y, debajo, las anteriores plegadas. */
export function NewsPage({ version }: { version: string }) {
  const [current, ...previous] = RELEASES;
  return (
    <section>
      <h2 className="text-lg font-semibold">Novedades</h2>
      <div className="mt-4 rounded-xl bg-card p-4">
        <p className="text-xs font-semibold text-primary">Versión {version}</p>
        <p className="mt-1 text-sm font-semibold">{current.title}</p>
        <UpdateCheck />
        <Changes release={current} />
      </div>
      {previous.map((release) => (
        <details key={release.version} className="mt-3 rounded-xl bg-card p-4">
          <summary className="min-h-6 cursor-pointer text-xs font-semibold">
            Versión {release.version} · {release.title}
            {release.date && <span className="font-normal text-muted-foreground"> · {formatDate(release.date)}</span>}
          </summary>
          <Changes release={release} />
        </details>
      ))}
    </section>
  );
}
