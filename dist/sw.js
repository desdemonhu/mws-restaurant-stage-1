!function i(a,u,c){function o(e,t){if(!u[e]){if(!a[e]){var n="function"==typeof require&&require;if(!t&&n)return n(e,!0);if(l)return l(e,!0);var r=new Error("Cannot find module '"+e+"'");throw r.code="MODULE_NOT_FOUND",r}var s=u[e]={exports:{}};a[e][0].call(s.exports,function(t){return o(a[e][1][t]||t)},s,s.exports,i,a,u,c)}return u[e].exports}for(var l="function"==typeof require&&require,t=0;t<c.length;t++)o(c[t]);return o}({1:[function(t,e,n){"use strict";var r="restaurant-app",s=r+"-v11",i=r+"-images",a=[s,i],u=["/","index.html","/restaurant.html","/css/styles.css","/css/styles-medium.css","/css/styles-large.css","/js/main.js","/js/restaurant_info.js","manifest.json","https://unpkg.com/leaflet@1.3.1/dist/leaflet.css","https://unpkg.com/leaflet@1.3.1/dist/leaflet.js"];self.addEventListener("install",function(t){t.waitUntil(caches.open(s).then(function(t){return t.addAll(u)}))}),self.addEventListener("activate",function(t){t.waitUntil(caches.keys().then(function(t){return Promise.all(t.filter(function(t){return t.startsWith(r)&&!a.includes(t)}).map(function(t){return caches.delete(t)}))}))}),self.addEventListener("fetch",function(e){var n,r,t=new URL(e.request.url);if(t.origin===location.origin){if(t.pathname.startsWith("/restaurant.html"))return void e.respondWith(caches.match("/restaurant.html"));if(t.pathname.startsWith("/img"))return void e.respondWith((n=e.request,r=(r=n.url).replace(/-small\.\w{3}|-medium\.\w{3}|-large\.\w{3}/i,""),caches.open(i).then(function(e){return e.match(r).then(function(t){return t||fetch(n).then(function(t){return e.put(r,t.clone()),t})})})))}e.respondWith(caches.match(e.request).then(function(t){return t||fetch(e.request)}))})},{}]},{},[1]);
