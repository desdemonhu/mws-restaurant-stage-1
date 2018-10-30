import DBHelper from './js/dbhelper';
const appName = 'restaurant-app';
const version = appName + '-v11';
const imgVersion = appName + '-images';
const allCaches = [version, imgVersion]
const toCache = [
    '/',
    '/index.html', 
    '/restaurant.html',
    '/css/styles.css',
    '/css/styles-medium.css',
    '/css/styles-large.css',
    '/js/main.js',
    '/js/restaurant_info.js',
    'manifest.json',
    'https://unpkg.com/leaflet@1.3.1/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.3.1/dist/leaflet.js'
];

self.addEventListener('install', function(event){
    event.waitUntil(
        caches.open(version).then(function(cache){
            return cache.addAll(toCache);
        })
    )
})

self.addEventListener('activate', function(event){
    event.waitUntil(
        caches.keys().then(function(cacheNames){
            return Promise.all(
                cacheNames.filter(function(cacheName){
                    return cacheName.startsWith(appName) && !allCaches.includes(cacheName)
                }).map(function(cacheName){
                    return caches.delete(cacheName);
                })
            )
        })
    )
})

self.addEventListener('fetch', function(event){
    const requestUrl = new URL(event.request.url);

    if(requestUrl.origin === location.origin){
        if (requestUrl.pathname.startsWith('/restaurant.html')) {
            event.respondWith(caches.match('/restaurant.html'));
            return;
          }
          if (requestUrl.pathname.startsWith('/img')) {
            event.respondWith(serveImage(event.request));
            return;
          }
        }

    event.respondWith(
        caches.match(event.request).then(function(response) {
            return response || fetch(event.request);
        })
    )
})

self.addEventListener('sync', function (event) {
    if (event.tag == 'todo_updated') {
      event.waitUntil(serverSync(event));
    }
  });

function serveImage(request) {
    let imageStorageUrl = request.url;
    imageStorageUrl = imageStorageUrl.replace(/-small\.\w{3}|-medium\.\w{3}|-large\.\w{3}/i, '');
  
    return caches.open(imgVersion).then(function(cache) {
      return cache.match(imageStorageUrl).then(function(response) {
        return response || fetch(request).then(function(networkResponse) {
          cache.put(imageStorageUrl, networkResponse.clone());
          return networkResponse;
        });
      });
    });
  }

  function serverSync(event) {
      DBHelper.updateDatabase();  
  }