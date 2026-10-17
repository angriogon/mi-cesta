import { createContext, useContext } from "react";
import type { CestaCore } from "./useCestaCore";
import type { useCestaActions } from "./useCestaActions";

/** Estado y acciones de la app de un hogar, disponibles para todas las pantallas. */
export type CestaStore = CestaCore & ReturnType<typeof useCestaActions>;

export const CestaContext = createContext<CestaStore | null>(null);

export function useCesta(): CestaStore {
  const store = useContext(CestaContext);
  if (!store) throw new Error("useCesta debe usarse dentro de <CestaApp>.");
  return store;
}
