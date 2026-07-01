// WorkDay Service Worker — cache offline inteligente
const CACHE_NAME = 'workday-cache-v19.10';
const APP_SHELL = [
  './workday.html',
  './manifest.json'
];

// Instala e faz cache do app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch(() => {
        // Se algum arquivo falhar (ex: ainda não publicado), não quebra a instalação
        return Promise.resolve();
      });
    })
  );
});

// Ativa e limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia: Network First para o HTML (sempre busca versão nova se online),
// Cache First para outros recursos estáticos.
// Firebase/Firestore (dados) NUNCA é interceptado — passa direto para a rede,
// pois o Firestore já tem seu próprio cache/persistência offline.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Nunca interceptar chamadas ao Firebase/Firestore/Google APIs ou CDNs externos de dados
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebaseio.com') ||
    url.includes('googleapis.com') ||
    url.includes('callmebot.com') ||
    url.includes('ultramsg.com') ||
    event.request.method !== 'GET'
  ) {
    return; // deixa passar direto pela rede
  }

  // HTML principal: network-first com fallback para cache (permite update + funciona offline)
  if (url.endsWith('.html') || url.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const respClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Demais recursos (manifest, ícones, libs JS de CDN): cache-first com atualização em background
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const respClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
