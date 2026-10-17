// Avisos push de Cesta (se carga dentro del service worker generado por vite-plugin-pwa).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const scope = self.registration.scope;
  event.waitUntil(
    self.registration.showNotification(data.title || "Cesta", {
      body: data.body || "",
      tag: data.tag,
      icon: new URL("apple-touch-icon.png", scope).href,
      badge: new URL("icon-192.png", scope).href,
      data: { url: new URL(data.url || "./", scope).href },
    }),
  );
});

// Al tocar el aviso: se trae al frente Cesta si ya está abierta o se abre en la pantalla indicada.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          client.postMessage({ type: "cesta-open", url });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
