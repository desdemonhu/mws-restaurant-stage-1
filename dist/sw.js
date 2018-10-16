(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

var appName = 'restaurant-app';
var version = appName + '-v2';
var imgVersion = appName + '-images';
var allCaches = [version, imgVersion];
var toCache = ['/', '/restaurant.html', '/css/styles.css', '/css/styles-medium.css', '/css/styles-large.css', '/js/dbhelper.js', '/js/main.js', '/js/restaurant_info.js', '/js/register-sw.js', '/data/restaurants.json'];
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(version).then(function (cache) {
    return cache.addAll(toCache);
  }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (cacheNames) {
    return Promise.all(cacheNames.filter(function (cacheName) {
      return cacheName.startsWith(appName) && !allCaches.includes(cacheName);
    }).map(function (cacheName) {
      return caches.delete(cacheName);
    }));
  }));
});
self.addEventListener('fetch', function (event) {
  event.respondWith(caches.match(event.request).then(function (res) {
    return res || fetch(event.request).then(function (response) {
      return caches.open(version).then(function (cache) {
        cache.put(event.request, response.clone());
        return response;
      });
    });
  }));
});

},{}]},{},[1])

//# sourceMappingURL=sw.js.map
