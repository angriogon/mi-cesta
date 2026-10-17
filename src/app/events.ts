import { useEffect, useRef } from "react";

/**
 * Avisos internos entre pantallas, sin pasar por eventos globales del navegador.
 * Cada canal es una lista de oyentes tipada: quien emite no necesita saber quién escucha.
 */
export interface Channel {
  emit(): void;
  subscribe(listener: () => void): () => void;
}

export function createChannel(): Channel {
  const listeners = new Set<() => void>();
  return {
    emit() {
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Las existencias o los lotes cambiaron desde fuera de la pantalla que los muestra (deshacer, cocinar, caducidades…). */
export const inventoryChanged = createChannel();

/** Escucha un canal mientras el componente está montado, siempre con la última versión de `listener`. */
export function useChannel(channel: Channel, listener: () => void): void {
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => channel.subscribe(() => latest.current()), [channel]);
}
