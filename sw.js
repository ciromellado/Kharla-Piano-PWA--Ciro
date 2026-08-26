const CACHE_NAME = 'kharla-piano-v14';

// Lista de archivos estáticos que componen la PWA para que funcione offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './images/icon-piano192.png'
];

// Evento de Instalación: Se descargan y almacenan en caché los recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Instalando y cacheando recursos');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Evento de Activación: Limpia cachés antiguas si actualizas la versión del SW
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Evento Fetch: Intercepta las peticiones de red y responde con la caché o la red
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Si el recurso está en caché, lo devuelve; si no, lo busca en la red
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // Opcional: Podrías retornar una página offline genérica si falla la red y no está en caché
      });
    })
  );
});
