import { ChevronLeft, MapPin } from "lucide-react";
import type { QuickSession } from "../../data/types";
import { LOCATIONS } from "../../domain/quick";

/** Primer paso del inventario rápido: continuar una zona guardada o empezar una nueva. */
export function ZonePicker({
  sessions,
  location,
  onResume,
  onPick,
}: {
  sessions: QuickSession[];
  location: string;
  onResume: (session: QuickSession) => void;
  onPick: (zone: string) => void;
}) {
  return (
    <section className="mt-5">
      <p className="text-xs leading-5 text-muted-foreground">
        Trabaja por zonas: cuenta lo que hay en cada una y se suma a tus existencias. Puedes guardar el progreso y
        continuar en otro momento.
      </p>
      {sessions.length > 0 && (
        <div className="mt-3 space-y-2">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => onResume(session)}
              className="flex w-full items-center justify-between rounded-lg border border-primary/20 bg-muted px-3 py-2.5 text-left"
            >
              <span>
                <b className="block text-[0.75rem] text-primary">Continuar {session.location}</b>
                <small className="text-xs text-muted-foreground">{session.items.length} productos guardados</small>
              </span>
              <ChevronLeft className="size-4 rotate-180 text-primary" />
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {LOCATIONS.map((zone) => (
          <button
            key={zone}
            type="button"
            onClick={() => onPick(zone)}
            className={`min-h-20 rounded-xl border p-3 text-left ${zone === location ? "border-primary bg-muted text-primary " : " bg-card"}`}
          >
            <MapPin className="size-4" />
            <span className="mt-2 block text-[0.75rem] font-semibold leading-4">{zone}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
