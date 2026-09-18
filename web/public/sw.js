/**
 * Service worker de la app del cliente.
 *
 * Deliberadamente mínimo: red primero, siempre. Lo único que se guarda es el
 * armazón de la app, para que abra aunque el celular esté sin señal — pero los
 * puntos nunca salen de la caché: un saldo viejo confunde más que un aviso de
 * "sin conexión".
 */
const CACHE = 'puntos-incollege-v1';
const ARMAZON = ['/app', '/icono-192.png', '/icono-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARMAZON)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  // Los datos de la cuenta nunca se sirven de la caché.
  if (url.pathname.startsWith('/api/')) return;

  evento.respondWith(
    fetch(pedido)
      .then((respuesta) => {
        if (respuesta.ok && pedido.mode === 'navigate') {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put('/app', copia));
        }
        return respuesta;
      })
      .catch(async () => (await caches.match(pedido)) ?? (await caches.match('/app')) ?? Response.error()),
  );
});
