// El workflow de despliegue sustituye __BUILD__ por el commit, así que cada
// publicación cambia este archivo, se instala un service worker nuevo y se
// descarta la caché anterior.
const VERSION = '__BUILD__';
const CACHE = 'mi-cesta-' + VERSION;
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putInCache(request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Páginas: primero la red para recibir siempre la última versión;
  // sin conexión, la copia guardada.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => putInCache(request, response))
        .catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Recursos estáticos: primero la caché.
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => putInCache(request, response)))
  );
});
