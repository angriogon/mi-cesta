import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { UpdatePrompt } from "./app/chrome/UpdatePrompt";
import { Root } from "./app/Root";
import "./index.css";
import { followSystemTextSize } from "./lib/dynamic-type";
import { blockZoom } from "./lib/no-zoom";
import { isStaleChunkError, recoverFromStaleChunks, reloadForNewVersion } from "./lib/stale-chunks";
import { applyTheme, storedTheme } from "./lib/theme";

// Claro por defecto; el oscuro se elige desde el menú lateral.
applyTheme(storedTheme());
followSystemTextSize();
blockZoom();
recoverFromStaleChunks();

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Una pantalla de la versión anterior que ya no existe: se recarga con la versión nueva.
    if (isStaleChunkError(error) && reloadForNewVersion()) return;
    console.error("Cesta ha fallado", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
        <h1 className="text-lg font-semibold">Algo no ha ido bien</h1>
        <p className="mt-2 max-w-72 text-sm leading-6 text-muted-foreground">
          Tus datos están a salvo. Vuelve a abrir Cesta para continuar.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Volver a abrir
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
      <UpdatePrompt />
    </ErrorBoundary>
  </StrictMode>,
);
