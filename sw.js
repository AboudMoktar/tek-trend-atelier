// TEK-TREND — Service Worker
// Change ce numéro de version à chaque mise à jour du site pour forcer
// les téléphones déjà installés à récupérer la nouvelle version.
const CACHE_NAME = 'tek-trend-v19';

// Fichiers essentiels de l'application (mêmes dossier que sw.js)
const APP_SHELL = [
  './',
  './index.html',
  './rh-module.js',
  './gadh-module.js',
  './prod-module.js',
  './commandes-module.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './hero-bg.jpg'
];

// --- Installation : on met en cache le strict nécessaire pour que ---
// --- l'application s'ouvre même sans connexion internet.          ---
self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){ return cache.addAll(APP_SHELL); })
      .then(function(){ return self.skipWaiting(); })
      .catch(function(err){ console.error('Erreur mise en cache initiale :', err); })
  );
});

// --- Activation : on supprime les anciennes versions du cache ---
self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

function isAppShellDocument(request){
  // La page principale (index.html / "./") doit toujours être la plus fraîche
  // possible : on la traite différemment des icônes/scripts qui, eux, peuvent
  // rester en cache sans risque.
  if(request.mode === 'navigate') return true;
  const url = new URL(request.url);
  return url.origin === self.location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('index.html'));
}

self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;

  // --- Page principale : RÉSEAU D'ABORD ---
  // Garantit que toute mise à jour publiée s'affiche dès la prochaine ouverture,
  // sans avoir besoin de rouvrir l'app une seconde fois. Le cache ne sert que
  // de secours si l'appareil est hors connexion.
  if(isAppShellDocument(event.request)){
    event.respondWith(
      fetch(event.request).then(function(response){
        if(response && response.ok){
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return response;
      }).catch(function(){
        return caches.match(event.request).then(function(cached){ return cached || caches.match('./index.html'); });
      })
    );
    return;
  }

  // --- Tout le reste (icônes, polices, scripts CDN) : CACHE D'ABORD ---
  // Affichage instantané, mise à jour en arrière-plan pour la prochaine fois.
  event.respondWith(
    caches.match(event.request).then(function(cached){
      const networkFetch = fetch(event.request).then(function(response){
        if(response && (response.ok || response.type === 'opaque')){
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return response;
      }).catch(function(){
        return cached;
      });
      return cached || networkFetch;
    })
  );
});
