import type { CestaApi } from "../data/api";
import { Toast } from "../ui/Toast";
import type { Account } from "./account";
import { CestaContext, type CestaStore } from "./CestaContext";
import { Notices, PullIndicator, Splash, TabBar, TopBar } from "./chrome/Chrome";
import { CurrentScreen, Overlays } from "./screens/Screens";
import { usePullToRefresh } from "./useAppEffects";
import { useCestaActions } from "./useCestaActions";
import { useCestaCore } from "./useCestaCore";

export type { View } from "./useCestaCore";

/**
 * La app de un hogar: compone el estado (`useCestaCore`), las acciones (`useCestaActions`) y el
 * marco de iOS (cabecera, avisos, pantalla actual y pestañas). Cada pantalla lee lo suyo con `useCesta()`.
 */
export function CestaApp({ api, account }: { api: CestaApi; account: Account }) {
  const core = useCestaCore(api, account);
  const actions = useCestaActions(core);
  const store: CestaStore = { ...core, ...actions };
  const { pull, handlers } = usePullToRefresh(!core.menuOpen && !core.scanner, actions.refreshAll);

  return (
    <CestaContext.Provider value={store}>
      <main className="min-h-[100dvh] bg-background text-foreground" {...handlers}>
        <Splash />
        <TopBar />
        <PullIndicator pull={pull} />
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-2.5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[calc(3.8rem+env(safe-area-inset-top))] sm:px-3">
          <Notices />
          <CurrentScreen />
          <Overlays />
          <TabBar />
        </div>
        <Toast state={core.toast.state} onDismiss={core.toast.hide} />
      </main>
    </CestaContext.Provider>
  );
}
