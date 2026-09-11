// TEK-TREND — Service Worker
// Change ce numéro de version à chaque mise à jour du site pour forcer
// les téléphones déjà installés à récupérer la nouvelle version.
const CACHE_NAME = 'tek-trend-v2';

// Fichiers essentiels de l'application (mêmes dossier que sw.js)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
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

// --- Requêtes réseau : on répond depuis le cache si possible, ---
// --- puis on va chercher sur le réseau et on met à jour le cache. ---
self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function(cached){
      const networkFetch = fetch(event.request).then(function(response){
        // On ne met en cache que les réponses valides (classiques ou opaques CDN)
        if(response && (response.ok || response.type === 'opaque')){
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return response;
      }).catch(function(){
        // Pas de réseau : on retombe sur le cache si on en a un
        return cached;
      });
      // Cache d'abord pour un affichage instantané, sinon on attend le réseau
      return cached || networkFetch;
    })
  );
});
