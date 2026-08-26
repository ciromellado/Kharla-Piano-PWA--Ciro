const CACHE_NAME = 'kharla-piano-v11'; // ⭐ IMPORTANTE: Cambiado a v10 para forzar actualización
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './images/icon-piano192.png',
  './images/icon-piano512.png'
];

// 1. Instalar el Service Worker y cachear los archivos base
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Forza la activación inmediata
});

// 2. Activar y limpiar cachés antiguas (v9, v8, etc.)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('Borrando caché vieja:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim(); // Toma el control de todas las pestañas abiertas inmediatamente
});

// 3. Estrategia de Fetch CORREGIDA
self.addEventListener('fetch', (event) => {
  // Si la petición es para un documento HTML (como index.html)
  if (event.request.mode === 'navigate' || (event.request.method === 'GET' && event.request.headers.get('accept').includes('text/html'))) {
    
    event.respondWith(
      fetch(event.request) // ⭐ INTENTAR RED PRIMERO
        .then((networkResponse) => {
          // Si la red funciona, guardamos la nueva versión en el caché para la próxima
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          // ⭐ Si no hay internet (offline), usamos el caché como respaldo
          return caches.match(event.request);
        })
    );
    
  } else {
    // Para imágenes, CSS, JS, iconos: Usamos Cache First (es más rápido y no cambia tanto)
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
