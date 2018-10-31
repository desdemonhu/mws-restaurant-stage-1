(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

(function() {
  function toArray(arr) {
    return Array.prototype.slice.call(arr);
  }

  function promisifyRequest(request) {
    return new Promise(function(resolve, reject) {
      request.onsuccess = function() {
        resolve(request.result);
      };

      request.onerror = function() {
        reject(request.error);
      };
    });
  }

  function promisifyRequestCall(obj, method, args) {
    var request;
    var p = new Promise(function(resolve, reject) {
      request = obj[method].apply(obj, args);
      promisifyRequest(request).then(resolve, reject);
    });

    p.request = request;
    return p;
  }

  function promisifyCursorRequestCall(obj, method, args) {
    var p = promisifyRequestCall(obj, method, args);
    return p.then(function(value) {
      if (!value) return;
      return new Cursor(value, p.request);
    });
  }

  function proxyProperties(ProxyClass, targetProp, properties) {
    properties.forEach(function(prop) {
      Object.defineProperty(ProxyClass.prototype, prop, {
        get: function() {
          return this[targetProp][prop];
        },
        set: function(val) {
          this[targetProp][prop] = val;
        }
      });
    });
  }

  function proxyRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function proxyMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return this[targetProp][prop].apply(this[targetProp], arguments);
      };
    });
  }

  function proxyCursorRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyCursorRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function Index(index) {
    this._index = index;
  }

  proxyProperties(Index, '_index', [
    'name',
    'keyPath',
    'multiEntry',
    'unique'
  ]);

  proxyRequestMethods(Index, '_index', IDBIndex, [
    'get',
    'getKey',
    'getAll',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(Index, '_index', IDBIndex, [
    'openCursor',
    'openKeyCursor'
  ]);

  function Cursor(cursor, request) {
    this._cursor = cursor;
    this._request = request;
  }

  proxyProperties(Cursor, '_cursor', [
    'direction',
    'key',
    'primaryKey',
    'value'
  ]);

  proxyRequestMethods(Cursor, '_cursor', IDBCursor, [
    'update',
    'delete'
  ]);

  // proxy 'next' methods
  ['advance', 'continue', 'continuePrimaryKey'].forEach(function(methodName) {
    if (!(methodName in IDBCursor.prototype)) return;
    Cursor.prototype[methodName] = function() {
      var cursor = this;
      var args = arguments;
      return Promise.resolve().then(function() {
        cursor._cursor[methodName].apply(cursor._cursor, args);
        return promisifyRequest(cursor._request).then(function(value) {
          if (!value) return;
          return new Cursor(value, cursor._request);
        });
      });
    };
  });

  function ObjectStore(store) {
    this._store = store;
  }

  ObjectStore.prototype.createIndex = function() {
    return new Index(this._store.createIndex.apply(this._store, arguments));
  };

  ObjectStore.prototype.index = function() {
    return new Index(this._store.index.apply(this._store, arguments));
  };

  proxyProperties(ObjectStore, '_store', [
    'name',
    'keyPath',
    'indexNames',
    'autoIncrement'
  ]);

  proxyRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'put',
    'add',
    'delete',
    'clear',
    'get',
    'getAll',
    'getKey',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'openCursor',
    'openKeyCursor'
  ]);

  proxyMethods(ObjectStore, '_store', IDBObjectStore, [
    'deleteIndex'
  ]);

  function Transaction(idbTransaction) {
    this._tx = idbTransaction;
    this.complete = new Promise(function(resolve, reject) {
      idbTransaction.oncomplete = function() {
        resolve();
      };
      idbTransaction.onerror = function() {
        reject(idbTransaction.error);
      };
      idbTransaction.onabort = function() {
        reject(idbTransaction.error);
      };
    });
  }

  Transaction.prototype.objectStore = function() {
    return new ObjectStore(this._tx.objectStore.apply(this._tx, arguments));
  };

  proxyProperties(Transaction, '_tx', [
    'objectStoreNames',
    'mode'
  ]);

  proxyMethods(Transaction, '_tx', IDBTransaction, [
    'abort'
  ]);

  function UpgradeDB(db, oldVersion, transaction) {
    this._db = db;
    this.oldVersion = oldVersion;
    this.transaction = new Transaction(transaction);
  }

  UpgradeDB.prototype.createObjectStore = function() {
    return new ObjectStore(this._db.createObjectStore.apply(this._db, arguments));
  };

  proxyProperties(UpgradeDB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(UpgradeDB, '_db', IDBDatabase, [
    'deleteObjectStore',
    'close'
  ]);

  function DB(db) {
    this._db = db;
  }

  DB.prototype.transaction = function() {
    return new Transaction(this._db.transaction.apply(this._db, arguments));
  };

  proxyProperties(DB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(DB, '_db', IDBDatabase, [
    'close'
  ]);

  // Add cursor iterators
  // TODO: remove this once browsers do the right thing with promises
  ['openCursor', 'openKeyCursor'].forEach(function(funcName) {
    [ObjectStore, Index].forEach(function(Constructor) {
      // Don't create iterateKeyCursor if openKeyCursor doesn't exist.
      if (!(funcName in Constructor.prototype)) return;

      Constructor.prototype[funcName.replace('open', 'iterate')] = function() {
        var args = toArray(arguments);
        var callback = args[args.length - 1];
        var nativeObject = this._store || this._index;
        var request = nativeObject[funcName].apply(nativeObject, args.slice(0, -1));
        request.onsuccess = function() {
          callback(request.result);
        };
      };
    });
  });

  // polyfill getAll
  [Index, ObjectStore].forEach(function(Constructor) {
    if (Constructor.prototype.getAll) return;
    Constructor.prototype.getAll = function(query, count) {
      var instance = this;
      var items = [];

      return new Promise(function(resolve) {
        instance.iterateCursor(query, function(cursor) {
          if (!cursor) {
            resolve(items);
            return;
          }
          items.push(cursor.value);

          if (count !== undefined && items.length == count) {
            resolve(items);
            return;
          }
          cursor.continue();
        });
      });
    };
  });

  var exp = {
    open: function(name, version, upgradeCallback) {
      var p = promisifyRequestCall(indexedDB, 'open', [name, version]);
      var request = p.request;

      if (request) {
        request.onupgradeneeded = function(event) {
          if (upgradeCallback) {
            upgradeCallback(new UpgradeDB(request.result, event.oldVersion, request.transaction));
          }
        };
      }

      return p.then(function(db) {
        return new DB(db);
      });
    },
    delete: function(name) {
      return promisifyRequestCall(indexedDB, 'deleteDatabase', [name]);
    }
  };

  if (typeof module !== 'undefined') {
    module.exports = exp;
    module.exports.default = module.exports;
  }
  else {
    self.idb = exp;
  }
}());

},{}],2:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _dbpromise = _interopRequireDefault(require("./dbpromise"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

/**
 * Common database helper functions.
 */
var DBHelper =
/*#__PURE__*/
function () {
  function DBHelper() {
    _classCallCheck(this, DBHelper);
  }

  _createClass(DBHelper, null, [{
    key: "fetchRestaurants",

    /**
     * Fetch all restaurants.
     */
    // static fetchRestaurants(callback) {
    //   let xhr = new XMLHttpRequest();
    //   xhr.open('GET', `${DBHelper.API_URL}/restaurants`);
    //   xhr.onload = () => {
    //     if (xhr.status === 200) { // Got a success response from server!
    //       const restaurants = JSON.parse(xhr.responseText);
    //       dbPromise.putRestaurants(restaurants);
    //       callback(null, restaurants);
    //     } else {
    //        dbPromise.getRestaurants().then(restaurants =>{
    //         if(restaurants.length > 0){
    //           callback(null, restaurants);
    //         } else {
    //           const error = (`Request failed. Returned status of ${xhr.status}`);
    //           callback(error, null);
    //         }
    //       }); 
    //     }
    //   };
    //   xhr.send();
    // }
    value: function fetchRestaurants(callback) {
      fetch("".concat(DBHelper.API_URL, "/restaurants")).then(function (response) {
        var r = response.json();
        r.then(function (restaurants) {
          _dbpromise.default.putRestaurants(restaurants);

          callback(null, restaurants);
        });
      }).catch(function (error) {
        _dbpromise.default.getRestaurants().then(function (restaurants) {
          if (restaurants.length > 0) {
            callback(null, restaurants);
          } else {
            var errorMessage = 'Unable to get restaurants from IndexDB: ';
            callback(errorMessage, error, null);
          }
        });
      });
    }
    /**
     * Fetch a restaurant by its ID.
     */

  }, {
    key: "fetchRestaurantById",
    value: function fetchRestaurantById(id, callback) {
      fetch("".concat(DBHelper.API_URL, "/restaurants/").concat(id)).then(function (response) {
        if (!response.ok) return Promise.reject("Restaurant couldn't be fetched from network");
        return response.json();
      }).then(function (restaurant) {
        _dbpromise.default.putRestaurants(restaurant);

        return callback(null, restaurant);
      }).catch(function (error) {
        console.log(id, error);

        _dbpromise.default.getRestaurants(id).then(function (restaurant) {
          return callback(null, restaurant);
        });
      });
    }
  }, {
    key: "fetchReviewsByRestaurant",
    value: function fetchReviewsByRestaurant(id, callback) {
      fetch("".concat(DBHelper.API_URL, "/reviews/?restaurant_id=").concat(id)).then(function (response) {
        if (!response.ok) return Promise.reject("Restaurant Reviews couldn't be fetched from network");
        return response.json();
      }).then(function (reviews) {
        _dbpromise.default.getReviews(id).then(function (dbReviews) {
          if (reviews.length >= dbReviews.length) {
            _dbpromise.default.putReviews(id, reviews).then(function () {
              return callback(null, reviews);
            });
          } else {
            _dbpromise.default.getReviews(id).then(function (reviews) {
              return callback(null, reviews);
            });
          }
        });
      }).catch(function (error) {
        console.log(error);
      });
    }
    /**
     * Fetch restaurants by a cuisine type with proper error handling.
     */

  }, {
    key: "fetchRestaurantByCuisine",
    value: function fetchRestaurantByCuisine(cuisine, callback) {
      // Fetch all restaurants  with proper error handling
      DBHelper.fetchRestaurants(function (error, restaurants) {
        if (error) {
          callback(error, null);
        } else {
          // Filter restaurants to have only given cuisine type
          var results = restaurants.filter(function (r) {
            return r.cuisine_type == cuisine;
          });
          callback(null, results);
        }
      });
    }
    /**
     * Fetch restaurants by a neighborhood with proper error handling.
     */

  }, {
    key: "fetchRestaurantByNeighborhood",
    value: function fetchRestaurantByNeighborhood(neighborhood, callback) {
      // Fetch all restaurants
      DBHelper.fetchRestaurants(function (error, restaurants) {
        if (error) {
          callback(error, null);
        } else {
          // Filter restaurants to have only given neighborhood
          var results = restaurants.filter(function (r) {
            return r.neighborhood == neighborhood;
          });
          callback(null, results);
        }
      });
    }
    /**
     * Fetch restaurants by a cuisine and a neighborhood with proper error handling.
     */

  }, {
    key: "fetchRestaurantByCuisineAndNeighborhood",
    value: function fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, callback) {
      // Fetch all restaurants
      DBHelper.fetchRestaurants(function (error, restaurants) {
        if (error) {
          callback(error, null);
        } else {
          var results = restaurants;

          if (cuisine != 'all') {
            // filter by cuisine
            results = results.filter(function (r) {
              return r.cuisine_type == cuisine;
            });
          }

          if (neighborhood != 'all') {
            // filter by neighborhood
            results = results.filter(function (r) {
              return r.neighborhood == neighborhood;
            });
          }

          callback(null, results);
        }
      });
    }
    /**
     * Fetch all neighborhoods with proper error handling.
     */

  }, {
    key: "fetchNeighborhoods",
    value: function fetchNeighborhoods(callback) {
      // Fetch all restaurants
      DBHelper.fetchRestaurants(function (error, restaurants) {
        if (error) {
          callback(error, null);
        } else {
          // Get all neighborhoods from all restaurants
          var neighborhoods = restaurants.map(function (v, i) {
            return restaurants[i].neighborhood;
          }); // Remove duplicates from neighborhoods

          var uniqueNeighborhoods = neighborhoods.filter(function (v, i) {
            return neighborhoods.indexOf(v) == i;
          });
          callback(null, uniqueNeighborhoods);
        }
      });
    }
    /**
     * Fetch all cuisines with proper error handling.
     */

  }, {
    key: "fetchCuisines",
    value: function fetchCuisines(callback) {
      // Fetch all restaurants
      DBHelper.fetchRestaurants(function (error, restaurants) {
        if (error) {
          callback(error, null);
        } else {
          // Get all cuisines from all restaurants
          var cuisines = restaurants.map(function (v, i) {
            return restaurants[i].cuisine_type;
          }); // Remove duplicates from cuisines

          var uniqueCuisines = cuisines.filter(function (v, i) {
            return cuisines.indexOf(v) == i;
          });
          callback(null, uniqueCuisines);
        }
      });
    }
    /**
     * Restaurant page URL.
     */

  }, {
    key: "urlForRestaurant",
    value: function urlForRestaurant(restaurant) {
      return "./restaurant.html?id=".concat(restaurant.id);
    }
    /**
     * Restaurant image URL.
     */

  }, {
    key: "imageUrlForRestaurant",
    value: function imageUrlForRestaurant(restaurant) {
      return "/img/".concat(restaurant.photograph || restaurant.id, "-medium.jpg");
    }
  }, {
    key: "imageSrcSetForRestaurant",
    value: function imageSrcSetForRestaurant(restaurant) {
      var imgSrc = "/img/".concat(restaurant.photograph || restaurant.id);
      return "".concat(imgSrc, "-small.jpg 300w,\n            ").concat(imgSrc, "-medium.jpg 600w,\n            ").concat(imgSrc, "-large.jpg 800w");
    }
  }, {
    key: "imageSizesForRestaurant",
    value: function imageSizesForRestaurant(restaurant) {
      return "(max-width: 360px) 280px,\n            (max-width: 600px) 600px,\n            400px";
    }
    /**
     * Map marker for a restaurant.
     */

  }, {
    key: "mapMarkerForRestaurant",
    value: function mapMarkerForRestaurant(restaurant, map) {
      // https://leafletjs.com/reference-1.3.0.html#marker  
      var marker = new L.marker([restaurant.latlng.lat, restaurant.latlng.lng], {
        title: restaurant.name,
        alt: restaurant.name,
        url: DBHelper.urlForRestaurant(restaurant)
      });
      marker.addTo(map);
      return marker;
    }
    /* static mapMarkerForRestaurant(restaurant, map) {
      const marker = new google.maps.Marker({
        position: restaurant.latlng,
        title: restaurant.name,
        url: DBHelper.urlForRestaurant(restaurant),
        map: map,
        animation: google.maps.Animation.DROP}
      );
      return marker;
    } */

  }, {
    key: "submitReviewByRestaurant",
    value: function submitReviewByRestaurant(review) {
      fetch("".concat(DBHelper.API_URL, "/reviews"), {
        method: 'POST',
        body: JSON.stringify({
          "restaurant_id": review.restaurant_id,
          "name": review.name,
          "rating": review.rating,
          "comments": review.comments
        })
      }).then(function (response) {
        return response;
      }).catch(function (error) {
        _dbpromise.default.getReviews(review.restaurant_id).then(function (reviews) {
          var allReviews = reviews.concat(review);
          console.log(allReviews);

          _dbpromise.default.putReviews(review.restaurant_id, allReviews);
        });
      });
    }
  }, {
    key: "updateDatabase",
    value: function updateDatabase() {
      var _this = this;

      _dbpromise.default.getRestaurants().then(function (restaurants) {
        restaurants.forEach(function (restaurant) {
          if (restaurant.reviews) {
            restaurant.reviews.forEach(function (review) {
              if (!review.id) {
                console.log('in updateDatabase: ', review);

                _this.submitReviewByRestaurant(review);
              }
            });
          }
        });
      });
    }
  }, {
    key: "DATABASE_URL",

    /**
     * Database URL.
     * Change this to restaurants.json file location on your server.
     */
    get: function get() {
      var port = 8000; // Change this to your server port

      return "http://localhost:".concat(port, "/data/restaurants.json");
    }
  }, {
    key: "API_URL",
    get: function get() {
      var port = 1337;
      return "http://localhost:".concat(port);
    }
  }]);

  return DBHelper;
}();

exports.default = DBHelper;

},{"./dbpromise":3}],3:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _idb = _interopRequireDefault(require("idb"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var dbPromise = {
  db: _idb.default.open('restaurant-reviews-db', 2, function (upgradeDB) {
    switch (upgradeDB.oldVersion) {
      case 0:
        upgradeDB.createObjectStore('restaurants', {
          keyPath: 'id'
        });
        break;
    }
  }),
  putRestaurants: function putRestaurants(restaurants) {
    //if (!restaurants.push){ restaurants = [restaurants]};
    return this.db.then(function (db) {
      var store = db.transaction('restaurants', 'readwrite').objectStore('restaurants');
      Promise.all(restaurants.map(function (networkRestaurant) {
        return store.get(networkRestaurant.id).then(function (idbRestaurant) {
          if (!idbRestaurant || networkRestaurant.updatedAt > idbRestaurant.updatedAt) {
            return store.put(networkRestaurant);
          }
        });
      })).then(function () {
        return store.complete;
      });
    });
  },
  putReviews: function putReviews(id, reviews) {
    if (id) {
      return this.db.then(function (db) {
        var store = db.transaction('restaurants', 'readwrite').objectStore('restaurants');
        return store.get(Number(id)).then(function (restaurant) {
          restaurant.reviews = reviews;
          return store.put(restaurant);
        }).then(function () {
          return store.complete;
        });
      });
    }
  },
  getRestaurants: function getRestaurants() {
    var id = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;
    return this.db.then(function (db) {
      var store = db.transaction('restaurants', 'readonly').objectStore('restaurants');
      if (id) return store.get(Number(id));
      return store.getAll();
    });
  },
  getReviews: function getReviews() {
    var id = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;
    return this.db.then(function (db) {
      var store = db.transaction('restaurants', 'readonly').objectStore('restaurants');
      if (id) return store.get(Number(id)).then(function (restaurant) {
        return restaurant.reviews;
      });
      return null;
    });
  }
};
var _default = dbPromise;
exports.default = _default;

},{"idb":1}],4:[function(require,module,exports){
"use strict";

var _dbhelper = _interopRequireDefault(require("./js/dbhelper"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var appName = 'restaurant-app';
var version = appName + '-v13';
var imgVersion = appName + '-images';
var allCaches = [version, imgVersion];
var toCache = ['/', '/index.html', '/restaurant.html', '/css/styles.css', '/css/styles-medium.css', '/css/styles-large.css', '/js/main.js', '/js/restaurant_info.js', 'manifest.json', 'https://unpkg.com/leaflet@1.3.1/dist/leaflet.css', 'https://unpkg.com/leaflet@1.3.1/dist/leaflet.js'];
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
  var requestUrl = new URL(event.request.url);

  if (requestUrl.origin === location.origin) {
    if (requestUrl.pathname.startsWith('/restaurant.html')) {
      event.respondWith(caches.match('/restaurant.html'));
      return;
    }

    if (requestUrl.pathname.startsWith('/img')) {
      event.respondWith(serveImage(event.request));
      return;
    }
  }

  event.respondWith(caches.match(event.request).then(function (response) {
    return response || fetch(event.request);
  }));
});
self.addEventListener('sync', function (event) {
  if (event.tag == 'todo_updated') {
    event.waitUntil(serverSync(event));
  }
});

function serveImage(request) {
  var imageStorageUrl = request.url;
  imageStorageUrl = imageStorageUrl.replace(/-small\.\w{3}|-medium\.\w{3}|-large\.\w{3}/i, '');
  return caches.open(imgVersion).then(function (cache) {
    return cache.match(imageStorageUrl).then(function (response) {
      return response || fetch(request).then(function (networkResponse) {
        cache.put(imageStorageUrl, networkResponse.clone());
        return networkResponse;
      });
    });
  });
}

function serverSync(event) {
  _dbhelper.default.updateDatabase();
}

},{"./js/dbhelper":2}]},{},[4])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaWRiL2xpYi9pZGIuanMiLCJzcmMvanMvZGJoZWxwZXIuanMiLCJzcmMvanMvZGJwcm9taXNlLmpzIiwic3JjL3N3LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7O0FDNVRBOzs7Ozs7Ozs7O0FBQ0E7OztJQUdxQixR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QjtBQUMxRCxhQUFPLFFBQVEsSUFBSSxLQUFLLENBQUMsT0FBRCxDQUFMLENBQWUsSUFBZixDQUFvQixVQUFTLGVBQVQsRUFBMEI7QUFDL0QsUUFBQSxLQUFLLENBQUMsR0FBTixDQUFVLGVBQVYsRUFBMkIsZUFBZSxDQUFDLEtBQWhCLEVBQTNCO0FBQ0EsZUFBTyxlQUFQO0FBQ0QsT0FIa0IsQ0FBbkI7QUFJRCxLQUxNLENBQVA7QUFNRCxHQVBNLENBQVA7QUFRRDs7QUFFRCxTQUFTLFVBQVQsQ0FBb0IsS0FBcEIsRUFBMkI7QUFDdkIsb0JBQVMsY0FBVDtBQUNIIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiJ3VzZSBzdHJpY3QnO1xuXG4oZnVuY3Rpb24oKSB7XG4gIGZ1bmN0aW9uIHRvQXJyYXkoYXJyKSB7XG4gICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFycik7XG4gIH1cblxuICBmdW5jdGlvbiBwcm9taXNpZnlSZXF1ZXN0KHJlcXVlc3QpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXNvbHZlKHJlcXVlc3QucmVzdWx0KTtcbiAgICAgIH07XG5cbiAgICAgIHJlcXVlc3Qub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZWplY3QocmVxdWVzdC5lcnJvcik7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJvbWlzaWZ5UmVxdWVzdENhbGwob2JqLCBtZXRob2QsIGFyZ3MpIHtcbiAgICB2YXIgcmVxdWVzdDtcbiAgICB2YXIgcCA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgcmVxdWVzdCA9IG9ialttZXRob2RdLmFwcGx5KG9iaiwgYXJncyk7XG4gICAgICBwcm9taXNpZnlSZXF1ZXN0KHJlcXVlc3QpLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbiAgICB9KTtcblxuICAgIHAucmVxdWVzdCA9IHJlcXVlc3Q7XG4gICAgcmV0dXJuIHA7XG4gIH1cblxuICBmdW5jdGlvbiBwcm9taXNpZnlDdXJzb3JSZXF1ZXN0Q2FsbChvYmosIG1ldGhvZCwgYXJncykge1xuICAgIHZhciBwID0gcHJvbWlzaWZ5UmVxdWVzdENhbGwob2JqLCBtZXRob2QsIGFyZ3MpO1xuICAgIHJldHVybiBwLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIGlmICghdmFsdWUpIHJldHVybjtcbiAgICAgIHJldHVybiBuZXcgQ3Vyc29yKHZhbHVlLCBwLnJlcXVlc3QpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlQcm9wZXJ0aWVzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFByb3h5Q2xhc3MucHJvdG90eXBlLCBwcm9wLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXNbdGFyZ2V0UHJvcF1bcHJvcF07XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgdGhpc1t0YXJnZXRQcm9wXVtwcm9wXSA9IHZhbDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eVJlcXVlc3RNZXRob2RzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIENvbnN0cnVjdG9yLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIGlmICghKHByb3AgaW4gQ29uc3RydWN0b3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgICAgUHJveHlDbGFzcy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHByb21pc2lmeVJlcXVlc3RDYWxsKHRoaXNbdGFyZ2V0UHJvcF0sIHByb3AsIGFyZ3VtZW50cyk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlNZXRob2RzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIENvbnN0cnVjdG9yLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIGlmICghKHByb3AgaW4gQ29uc3RydWN0b3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgICAgUHJveHlDbGFzcy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXNbdGFyZ2V0UHJvcF1bcHJvcF0uYXBwbHkodGhpc1t0YXJnZXRQcm9wXSwgYXJndW1lbnRzKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eUN1cnNvclJlcXVlc3RNZXRob2RzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIENvbnN0cnVjdG9yLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIGlmICghKHByb3AgaW4gQ29uc3RydWN0b3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgICAgUHJveHlDbGFzcy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHByb21pc2lmeUN1cnNvclJlcXVlc3RDYWxsKHRoaXNbdGFyZ2V0UHJvcF0sIHByb3AsIGFyZ3VtZW50cyk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gSW5kZXgoaW5kZXgpIHtcbiAgICB0aGlzLl9pbmRleCA9IGluZGV4O1xuICB9XG5cbiAgcHJveHlQcm9wZXJ0aWVzKEluZGV4LCAnX2luZGV4JywgW1xuICAgICduYW1lJyxcbiAgICAna2V5UGF0aCcsXG4gICAgJ211bHRpRW50cnknLFxuICAgICd1bmlxdWUnXG4gIF0pO1xuXG4gIHByb3h5UmVxdWVzdE1ldGhvZHMoSW5kZXgsICdfaW5kZXgnLCBJREJJbmRleCwgW1xuICAgICdnZXQnLFxuICAgICdnZXRLZXknLFxuICAgICdnZXRBbGwnLFxuICAgICdnZXRBbGxLZXlzJyxcbiAgICAnY291bnQnXG4gIF0pO1xuXG4gIHByb3h5Q3Vyc29yUmVxdWVzdE1ldGhvZHMoSW5kZXgsICdfaW5kZXgnLCBJREJJbmRleCwgW1xuICAgICdvcGVuQ3Vyc29yJyxcbiAgICAnb3BlbktleUN1cnNvcidcbiAgXSk7XG5cbiAgZnVuY3Rpb24gQ3Vyc29yKGN1cnNvciwgcmVxdWVzdCkge1xuICAgIHRoaXMuX2N1cnNvciA9IGN1cnNvcjtcbiAgICB0aGlzLl9yZXF1ZXN0ID0gcmVxdWVzdDtcbiAgfVxuXG4gIHByb3h5UHJvcGVydGllcyhDdXJzb3IsICdfY3Vyc29yJywgW1xuICAgICdkaXJlY3Rpb24nLFxuICAgICdrZXknLFxuICAgICdwcmltYXJ5S2V5JyxcbiAgICAndmFsdWUnXG4gIF0pO1xuXG4gIHByb3h5UmVxdWVzdE1ldGhvZHMoQ3Vyc29yLCAnX2N1cnNvcicsIElEQkN1cnNvciwgW1xuICAgICd1cGRhdGUnLFxuICAgICdkZWxldGUnXG4gIF0pO1xuXG4gIC8vIHByb3h5ICduZXh0JyBtZXRob2RzXG4gIFsnYWR2YW5jZScsICdjb250aW51ZScsICdjb250aW51ZVByaW1hcnlLZXknXS5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZE5hbWUpIHtcbiAgICBpZiAoIShtZXRob2ROYW1lIGluIElEQkN1cnNvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgQ3Vyc29yLnByb3RvdHlwZVttZXRob2ROYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGN1cnNvciA9IHRoaXM7XG4gICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICBjdXJzb3IuX2N1cnNvclttZXRob2ROYW1lXS5hcHBseShjdXJzb3IuX2N1cnNvciwgYXJncyk7XG4gICAgICAgIHJldHVybiBwcm9taXNpZnlSZXF1ZXN0KGN1cnNvci5fcmVxdWVzdCkudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIGlmICghdmFsdWUpIHJldHVybjtcbiAgICAgICAgICByZXR1cm4gbmV3IEN1cnNvcih2YWx1ZSwgY3Vyc29yLl9yZXF1ZXN0KTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9O1xuICB9KTtcblxuICBmdW5jdGlvbiBPYmplY3RTdG9yZShzdG9yZSkge1xuICAgIHRoaXMuX3N0b3JlID0gc3RvcmU7XG4gIH1cblxuICBPYmplY3RTdG9yZS5wcm90b3R5cGUuY3JlYXRlSW5kZXggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IEluZGV4KHRoaXMuX3N0b3JlLmNyZWF0ZUluZGV4LmFwcGx5KHRoaXMuX3N0b3JlLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBPYmplY3RTdG9yZS5wcm90b3R5cGUuaW5kZXggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IEluZGV4KHRoaXMuX3N0b3JlLmluZGV4LmFwcGx5KHRoaXMuX3N0b3JlLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBbXG4gICAgJ25hbWUnLFxuICAgICdrZXlQYXRoJyxcbiAgICAnaW5kZXhOYW1lcycsXG4gICAgJ2F1dG9JbmNyZW1lbnQnXG4gIF0pO1xuXG4gIHByb3h5UmVxdWVzdE1ldGhvZHMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBJREJPYmplY3RTdG9yZSwgW1xuICAgICdwdXQnLFxuICAgICdhZGQnLFxuICAgICdkZWxldGUnLFxuICAgICdjbGVhcicsXG4gICAgJ2dldCcsXG4gICAgJ2dldEFsbCcsXG4gICAgJ2dldEtleScsXG4gICAgJ2dldEFsbEtleXMnLFxuICAgICdjb3VudCdcbiAgXSk7XG5cbiAgcHJveHlDdXJzb3JSZXF1ZXN0TWV0aG9kcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIElEQk9iamVjdFN0b3JlLCBbXG4gICAgJ29wZW5DdXJzb3InLFxuICAgICdvcGVuS2V5Q3Vyc29yJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBJREJPYmplY3RTdG9yZSwgW1xuICAgICdkZWxldGVJbmRleCdcbiAgXSk7XG5cbiAgZnVuY3Rpb24gVHJhbnNhY3Rpb24oaWRiVHJhbnNhY3Rpb24pIHtcbiAgICB0aGlzLl90eCA9IGlkYlRyYW5zYWN0aW9uO1xuICAgIHRoaXMuY29tcGxldGUgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIGlkYlRyYW5zYWN0aW9uLm9uY29tcGxldGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfTtcbiAgICAgIGlkYlRyYW5zYWN0aW9uLm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KGlkYlRyYW5zYWN0aW9uLmVycm9yKTtcbiAgICAgIH07XG4gICAgICBpZGJUcmFuc2FjdGlvbi5vbmFib3J0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlamVjdChpZGJUcmFuc2FjdGlvbi5lcnJvcik7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgVHJhbnNhY3Rpb24ucHJvdG90eXBlLm9iamVjdFN0b3JlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBPYmplY3RTdG9yZSh0aGlzLl90eC5vYmplY3RTdG9yZS5hcHBseSh0aGlzLl90eCwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKFRyYW5zYWN0aW9uLCAnX3R4JywgW1xuICAgICdvYmplY3RTdG9yZU5hbWVzJyxcbiAgICAnbW9kZSdcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKFRyYW5zYWN0aW9uLCAnX3R4JywgSURCVHJhbnNhY3Rpb24sIFtcbiAgICAnYWJvcnQnXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIFVwZ3JhZGVEQihkYiwgb2xkVmVyc2lvbiwgdHJhbnNhY3Rpb24pIHtcbiAgICB0aGlzLl9kYiA9IGRiO1xuICAgIHRoaXMub2xkVmVyc2lvbiA9IG9sZFZlcnNpb247XG4gICAgdGhpcy50cmFuc2FjdGlvbiA9IG5ldyBUcmFuc2FjdGlvbih0cmFuc2FjdGlvbik7XG4gIH1cblxuICBVcGdyYWRlREIucHJvdG90eXBlLmNyZWF0ZU9iamVjdFN0b3JlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBPYmplY3RTdG9yZSh0aGlzLl9kYi5jcmVhdGVPYmplY3RTdG9yZS5hcHBseSh0aGlzLl9kYiwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKFVwZ3JhZGVEQiwgJ19kYicsIFtcbiAgICAnbmFtZScsXG4gICAgJ3ZlcnNpb24nLFxuICAgICdvYmplY3RTdG9yZU5hbWVzJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoVXBncmFkZURCLCAnX2RiJywgSURCRGF0YWJhc2UsIFtcbiAgICAnZGVsZXRlT2JqZWN0U3RvcmUnLFxuICAgICdjbG9zZSdcbiAgXSk7XG5cbiAgZnVuY3Rpb24gREIoZGIpIHtcbiAgICB0aGlzLl9kYiA9IGRiO1xuICB9XG5cbiAgREIucHJvdG90eXBlLnRyYW5zYWN0aW9uID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBUcmFuc2FjdGlvbih0aGlzLl9kYi50cmFuc2FjdGlvbi5hcHBseSh0aGlzLl9kYiwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKERCLCAnX2RiJywgW1xuICAgICduYW1lJyxcbiAgICAndmVyc2lvbicsXG4gICAgJ29iamVjdFN0b3JlTmFtZXMnXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhEQiwgJ19kYicsIElEQkRhdGFiYXNlLCBbXG4gICAgJ2Nsb3NlJ1xuICBdKTtcblxuICAvLyBBZGQgY3Vyc29yIGl0ZXJhdG9yc1xuICAvLyBUT0RPOiByZW1vdmUgdGhpcyBvbmNlIGJyb3dzZXJzIGRvIHRoZSByaWdodCB0aGluZyB3aXRoIHByb21pc2VzXG4gIFsnb3BlbkN1cnNvcicsICdvcGVuS2V5Q3Vyc29yJ10uZm9yRWFjaChmdW5jdGlvbihmdW5jTmFtZSkge1xuICAgIFtPYmplY3RTdG9yZSwgSW5kZXhdLmZvckVhY2goZnVuY3Rpb24oQ29uc3RydWN0b3IpIHtcbiAgICAgIC8vIERvbid0IGNyZWF0ZSBpdGVyYXRlS2V5Q3Vyc29yIGlmIG9wZW5LZXlDdXJzb3IgZG9lc24ndCBleGlzdC5cbiAgICAgIGlmICghKGZ1bmNOYW1lIGluIENvbnN0cnVjdG9yLnByb3RvdHlwZSkpIHJldHVybjtcblxuICAgICAgQ29uc3RydWN0b3IucHJvdG90eXBlW2Z1bmNOYW1lLnJlcGxhY2UoJ29wZW4nLCAnaXRlcmF0ZScpXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IHRvQXJyYXkoYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJnc1thcmdzLmxlbmd0aCAtIDFdO1xuICAgICAgICB2YXIgbmF0aXZlT2JqZWN0ID0gdGhpcy5fc3RvcmUgfHwgdGhpcy5faW5kZXg7XG4gICAgICAgIHZhciByZXF1ZXN0ID0gbmF0aXZlT2JqZWN0W2Z1bmNOYW1lXS5hcHBseShuYXRpdmVPYmplY3QsIGFyZ3Muc2xpY2UoMCwgLTEpKTtcbiAgICAgICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICBjYWxsYmFjayhyZXF1ZXN0LnJlc3VsdCk7XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH0pO1xuICB9KTtcblxuICAvLyBwb2x5ZmlsbCBnZXRBbGxcbiAgW0luZGV4LCBPYmplY3RTdG9yZV0uZm9yRWFjaChmdW5jdGlvbihDb25zdHJ1Y3Rvcikge1xuICAgIGlmIChDb25zdHJ1Y3Rvci5wcm90b3R5cGUuZ2V0QWxsKSByZXR1cm47XG4gICAgQ29uc3RydWN0b3IucHJvdG90eXBlLmdldEFsbCA9IGZ1bmN0aW9uKHF1ZXJ5LCBjb3VudCkge1xuICAgICAgdmFyIGluc3RhbmNlID0gdGhpcztcbiAgICAgIHZhciBpdGVtcyA9IFtdO1xuXG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSkge1xuICAgICAgICBpbnN0YW5jZS5pdGVyYXRlQ3Vyc29yKHF1ZXJ5LCBmdW5jdGlvbihjdXJzb3IpIHtcbiAgICAgICAgICBpZiAoIWN1cnNvcikge1xuICAgICAgICAgICAgcmVzb2x2ZShpdGVtcyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGl0ZW1zLnB1c2goY3Vyc29yLnZhbHVlKTtcblxuICAgICAgICAgIGlmIChjb3VudCAhPT0gdW5kZWZpbmVkICYmIGl0ZW1zLmxlbmd0aCA9PSBjb3VudCkge1xuICAgICAgICAgICAgcmVzb2x2ZShpdGVtcyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGN1cnNvci5jb250aW51ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pO1xuXG4gIHZhciBleHAgPSB7XG4gICAgb3BlbjogZnVuY3Rpb24obmFtZSwgdmVyc2lvbiwgdXBncmFkZUNhbGxiYWNrKSB7XG4gICAgICB2YXIgcCA9IHByb21pc2lmeVJlcXVlc3RDYWxsKGluZGV4ZWREQiwgJ29wZW4nLCBbbmFtZSwgdmVyc2lvbl0pO1xuICAgICAgdmFyIHJlcXVlc3QgPSBwLnJlcXVlc3Q7XG5cbiAgICAgIGlmIChyZXF1ZXN0KSB7XG4gICAgICAgIHJlcXVlc3Qub251cGdyYWRlbmVlZGVkID0gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICBpZiAodXBncmFkZUNhbGxiYWNrKSB7XG4gICAgICAgICAgICB1cGdyYWRlQ2FsbGJhY2sobmV3IFVwZ3JhZGVEQihyZXF1ZXN0LnJlc3VsdCwgZXZlbnQub2xkVmVyc2lvbiwgcmVxdWVzdC50cmFuc2FjdGlvbikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHAudGhlbihmdW5jdGlvbihkYikge1xuICAgICAgICByZXR1cm4gbmV3IERCKGRiKTtcbiAgICAgIH0pO1xuICAgIH0sXG4gICAgZGVsZXRlOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgICByZXR1cm4gcHJvbWlzaWZ5UmVxdWVzdENhbGwoaW5kZXhlZERCLCAnZGVsZXRlRGF0YWJhc2UnLCBbbmFtZV0pO1xuICAgIH1cbiAgfTtcblxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGV4cDtcbiAgICBtb2R1bGUuZXhwb3J0cy5kZWZhdWx0ID0gbW9kdWxlLmV4cG9ydHM7XG4gIH1cbiAgZWxzZSB7XG4gICAgc2VsZi5pZGIgPSBleHA7XG4gIH1cbn0oKSk7XG4iLCJpbXBvcnQgZGJQcm9taXNlIGZyb20gJy4vZGJwcm9taXNlJztcclxuLyoqXHJcbiAqIENvbW1vbiBkYXRhYmFzZSBoZWxwZXIgZnVuY3Rpb25zLlxyXG4gKi9cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgREJIZWxwZXIge1xyXG5cclxuICAvKipcclxuICAgKiBEYXRhYmFzZSBVUkwuXHJcbiAgICogQ2hhbmdlIHRoaXMgdG8gcmVzdGF1cmFudHMuanNvbiBmaWxlIGxvY2F0aW9uIG9uIHlvdXIgc2VydmVyLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBnZXQgREFUQUJBU0VfVVJMKCkge1xyXG4gICAgY29uc3QgcG9ydCA9IDgwMDAgLy8gQ2hhbmdlIHRoaXMgdG8geW91ciBzZXJ2ZXIgcG9ydFxyXG4gICAgcmV0dXJuIGBodHRwOi8vbG9jYWxob3N0OiR7cG9ydH0vZGF0YS9yZXN0YXVyYW50cy5qc29uYDtcclxuICB9XHJcblxyXG4gIHN0YXRpYyBnZXQgQVBJX1VSTCgpe1xyXG4gICAgY29uc3QgcG9ydCA9IDEzMzc7XHJcbiAgICByZXR1cm4gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtwb3J0fWBcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIGFsbCByZXN0YXVyYW50cy5cclxuICAgKi9cclxuICAvLyBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50cyhjYWxsYmFjaykge1xyXG4gIC8vICAgbGV0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xyXG4gIC8vICAgeGhyLm9wZW4oJ0dFVCcsIGAke0RCSGVscGVyLkFQSV9VUkx9L3Jlc3RhdXJhbnRzYCk7XHJcbiAgLy8gICB4aHIub25sb2FkID0gKCkgPT4ge1xyXG4gIC8vICAgICBpZiAoeGhyLnN0YXR1cyA9PT0gMjAwKSB7IC8vIEdvdCBhIHN1Y2Nlc3MgcmVzcG9uc2UgZnJvbSBzZXJ2ZXIhXHJcbiAgLy8gICAgICAgY29uc3QgcmVzdGF1cmFudHMgPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpO1xyXG4gIC8vICAgICAgIGRiUHJvbWlzZS5wdXRSZXN0YXVyYW50cyhyZXN0YXVyYW50cyk7XHJcbiAgLy8gICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudHMpO1xyXG4gIC8vICAgICB9IGVsc2Uge1xyXG4gIC8vICAgICAgICBkYlByb21pc2UuZ2V0UmVzdGF1cmFudHMoKS50aGVuKHJlc3RhdXJhbnRzID0+e1xyXG4gIC8vICAgICAgICAgaWYocmVzdGF1cmFudHMubGVuZ3RoID4gMCl7XHJcbiAgLy8gICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnRzKTtcclxuICAvLyAgICAgICAgIH0gZWxzZSB7XHJcbiAgLy8gICAgICAgICAgIGNvbnN0IGVycm9yID0gKGBSZXF1ZXN0IGZhaWxlZC4gUmV0dXJuZWQgc3RhdHVzIG9mICR7eGhyLnN0YXR1c31gKTtcclxuICAvLyAgICAgICAgICAgY2FsbGJhY2soZXJyb3IsIG51bGwpO1xyXG4gIC8vICAgICAgICAgfVxyXG4gIC8vICAgICAgIH0pOyBcclxuICAvLyAgICAgfVxyXG4gIC8vICAgfTtcclxuICAvLyAgIHhoci5zZW5kKCk7XHJcbiAgLy8gfVxyXG4gIHN0YXRpYyBmZXRjaFJlc3RhdXJhbnRzKGNhbGxiYWNrKXtcclxuICAgIGZldGNoKGAke0RCSGVscGVyLkFQSV9VUkx9L3Jlc3RhdXJhbnRzYCkudGhlbigocmVzcG9uc2UpPT4ge1xyXG4gICAgICAgIGNvbnN0IHIgPSByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgci50aGVuKChyZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICAgICAgZGJQcm9taXNlLnB1dFJlc3RhdXJhbnRzKHJlc3RhdXJhbnRzKTtcclxuICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnRzKTtcclxuICAgICAgICB9KVxyXG4gICAgfSkuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgIGRiUHJvbWlzZS5nZXRSZXN0YXVyYW50cygpLnRoZW4oKHJlc3RhdXJhbnRzKT0+e1xyXG4gICAgICAgIGlmKHJlc3RhdXJhbnRzLmxlbmd0aCA+IDApe1xyXG4gICAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudHMpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSAnVW5hYmxlIHRvIGdldCByZXN0YXVyYW50cyBmcm9tIEluZGV4REI6ICdcclxuICAgICAgICAgIGNhbGxiYWNrKGVycm9yTWVzc2FnZSwgZXJyb3IsIG51bGwpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgIH0pXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCBhIHJlc3RhdXJhbnQgYnkgaXRzIElELlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaFJlc3RhdXJhbnRCeUlkKGlkLCBjYWxsYmFjaykge1xyXG4gICAgZmV0Y2goYCR7REJIZWxwZXIuQVBJX1VSTH0vcmVzdGF1cmFudHMvJHtpZH1gKS50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgaWYgKCFyZXNwb25zZS5vaykgcmV0dXJuIFByb21pc2UucmVqZWN0KFwiUmVzdGF1cmFudCBjb3VsZG4ndCBiZSBmZXRjaGVkIGZyb20gbmV0d29ya1wiKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxuICAgIH0pXHJcbiAgICAudGhlbigocmVzdGF1cmFudCk9PiB7XHJcbiAgICAgIGRiUHJvbWlzZS5wdXRSZXN0YXVyYW50cyhyZXN0YXVyYW50KVxyXG4gICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudCk7XHJcbiAgICB9KS5jYXRjaCgoZXJyb3IpID0+IHtcclxuICAgICAgY29uc29sZS5sb2coaWQsIGVycm9yKTtcclxuICAgICAgZGJQcm9taXNlLmdldFJlc3RhdXJhbnRzKGlkKS50aGVuKChyZXN0YXVyYW50KT0+e1xyXG4gICAgICAgIHJldHVybiBjYWxsYmFjayhudWxsLCByZXN0YXVyYW50KTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHN0YXRpYyBmZXRjaFJldmlld3NCeVJlc3RhdXJhbnQoaWQsIGNhbGxiYWNrKXtcclxuICAgIGZldGNoKGAke0RCSGVscGVyLkFQSV9VUkx9L3Jldmlld3MvP3Jlc3RhdXJhbnRfaWQ9JHtpZH1gKS50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgaWYgKCFyZXNwb25zZS5vaykgcmV0dXJuIFByb21pc2UucmVqZWN0KFwiUmVzdGF1cmFudCBSZXZpZXdzIGNvdWxkbid0IGJlIGZldGNoZWQgZnJvbSBuZXR3b3JrXCIpO1xyXG4gICAgICByZXR1cm4gcmVzcG9uc2UuanNvbigpO1xyXG4gICAgfSkudGhlbigocmV2aWV3cyk9PiB7XHJcbiAgICAgIGRiUHJvbWlzZS5nZXRSZXZpZXdzKGlkKS50aGVuKChkYlJldmlld3MpPT57XHJcbiAgICAgICAgaWYocmV2aWV3cy5sZW5ndGggPj0gZGJSZXZpZXdzLmxlbmd0aCl7XHJcbiAgICAgICAgICBkYlByb21pc2UucHV0UmV2aWV3cyhpZCwgcmV2aWV3cykudGhlbigoKSA9PntcclxuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKG51bGwsIHJldmlld3MpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgICB9ZWxzZSB7XHJcbiAgICAgICAgICBkYlByb21pc2UuZ2V0UmV2aWV3cyhpZCkudGhlbigocmV2aWV3cyk9PntcclxuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKG51bGwsIHJldmlld3MpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KVxyXG4gICAgfSkuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGVycm9yKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggcmVzdGF1cmFudHMgYnkgYSBjdWlzaW5lIHR5cGUgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudEJ5Q3Vpc2luZShjdWlzaW5lLCBjYWxsYmFjaykge1xyXG4gICAgLy8gRmV0Y2ggYWxsIHJlc3RhdXJhbnRzICB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZ1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBGaWx0ZXIgcmVzdGF1cmFudHMgdG8gaGF2ZSBvbmx5IGdpdmVuIGN1aXNpbmUgdHlwZVxyXG4gICAgICAgIGNvbnN0IHJlc3VsdHMgPSByZXN0YXVyYW50cy5maWx0ZXIociA9PiByLmN1aXNpbmVfdHlwZSA9PSBjdWlzaW5lKTtcclxuICAgICAgICBjYWxsYmFjayhudWxsLCByZXN1bHRzKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCByZXN0YXVyYW50cyBieSBhIG5laWdoYm9yaG9vZCB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZy5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50QnlOZWlnaGJvcmhvb2QobmVpZ2hib3Job29kLCBjYWxsYmFjaykge1xyXG4gICAgLy8gRmV0Y2ggYWxsIHJlc3RhdXJhbnRzXHJcbiAgICBEQkhlbHBlci5mZXRjaFJlc3RhdXJhbnRzKChlcnJvciwgcmVzdGF1cmFudHMpID0+IHtcclxuICAgICAgaWYgKGVycm9yKSB7XHJcbiAgICAgICAgY2FsbGJhY2soZXJyb3IsIG51bGwpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIEZpbHRlciByZXN0YXVyYW50cyB0byBoYXZlIG9ubHkgZ2l2ZW4gbmVpZ2hib3Job29kXHJcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IHJlc3RhdXJhbnRzLmZpbHRlcihyID0+IHIubmVpZ2hib3Job29kID09IG5laWdoYm9yaG9vZCk7XHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0cyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggcmVzdGF1cmFudHMgYnkgYSBjdWlzaW5lIGFuZCBhIG5laWdoYm9yaG9vZCB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZy5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50QnlDdWlzaW5lQW5kTmVpZ2hib3Job29kKGN1aXNpbmUsIG5laWdoYm9yaG9vZCwgY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50c1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBsZXQgcmVzdWx0cyA9IHJlc3RhdXJhbnRzXHJcbiAgICAgICAgaWYgKGN1aXNpbmUgIT0gJ2FsbCcpIHsgLy8gZmlsdGVyIGJ5IGN1aXNpbmVcclxuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihyID0+IHIuY3Vpc2luZV90eXBlID09IGN1aXNpbmUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobmVpZ2hib3Job29kICE9ICdhbGwnKSB7IC8vIGZpbHRlciBieSBuZWlnaGJvcmhvb2RcclxuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihyID0+IHIubmVpZ2hib3Job29kID09IG5laWdoYm9yaG9vZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdHMpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIGFsbCBuZWlnaGJvcmhvb2RzIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaE5laWdoYm9yaG9vZHMoY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50c1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBHZXQgYWxsIG5laWdoYm9yaG9vZHMgZnJvbSBhbGwgcmVzdGF1cmFudHNcclxuICAgICAgICBjb25zdCBuZWlnaGJvcmhvb2RzID0gcmVzdGF1cmFudHMubWFwKCh2LCBpKSA9PiByZXN0YXVyYW50c1tpXS5uZWlnaGJvcmhvb2QpXHJcbiAgICAgICAgLy8gUmVtb3ZlIGR1cGxpY2F0ZXMgZnJvbSBuZWlnaGJvcmhvb2RzXHJcbiAgICAgICAgY29uc3QgdW5pcXVlTmVpZ2hib3Job29kcyA9IG5laWdoYm9yaG9vZHMuZmlsdGVyKCh2LCBpKSA9PiBuZWlnaGJvcmhvb2RzLmluZGV4T2YodikgPT0gaSlcclxuICAgICAgICBjYWxsYmFjayhudWxsLCB1bmlxdWVOZWlnaGJvcmhvb2RzKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCBhbGwgY3Vpc2luZXMgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoQ3Vpc2luZXMoY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50c1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBHZXQgYWxsIGN1aXNpbmVzIGZyb20gYWxsIHJlc3RhdXJhbnRzXHJcbiAgICAgICAgY29uc3QgY3Vpc2luZXMgPSByZXN0YXVyYW50cy5tYXAoKHYsIGkpID0+IHJlc3RhdXJhbnRzW2ldLmN1aXNpbmVfdHlwZSlcclxuICAgICAgICAvLyBSZW1vdmUgZHVwbGljYXRlcyBmcm9tIGN1aXNpbmVzXHJcbiAgICAgICAgY29uc3QgdW5pcXVlQ3Vpc2luZXMgPSBjdWlzaW5lcy5maWx0ZXIoKHYsIGkpID0+IGN1aXNpbmVzLmluZGV4T2YodikgPT0gaSlcclxuICAgICAgICBjYWxsYmFjayhudWxsLCB1bmlxdWVDdWlzaW5lcyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVzdGF1cmFudCBwYWdlIFVSTC5cclxuICAgKi9cclxuICBzdGF0aWMgdXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KSB7XHJcbiAgICByZXR1cm4gKGAuL3Jlc3RhdXJhbnQuaHRtbD9pZD0ke3Jlc3RhdXJhbnQuaWR9YCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZXN0YXVyYW50IGltYWdlIFVSTC5cclxuICAgKi9cclxuICBzdGF0aWMgaW1hZ2VVcmxGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpIHtcclxuICAgIHJldHVybiAoYC9pbWcvJHtyZXN0YXVyYW50LnBob3RvZ3JhcGggfHwgcmVzdGF1cmFudC5pZH0tbWVkaXVtLmpwZ2ApO1xyXG4gIH1cclxuXHJcbiAgc3RhdGljIGltYWdlU3JjU2V0Rm9yUmVzdGF1cmFudChyZXN0YXVyYW50KXtcclxuICAgIGNvbnN0IGltZ1NyYyA9IGAvaW1nLyR7cmVzdGF1cmFudC5waG90b2dyYXBoIHx8IHJlc3RhdXJhbnQuaWR9YDtcclxuICAgIHJldHVybiBgJHtpbWdTcmN9LXNtYWxsLmpwZyAzMDB3LFxyXG4gICAgICAgICAgICAke2ltZ1NyY30tbWVkaXVtLmpwZyA2MDB3LFxyXG4gICAgICAgICAgICAke2ltZ1NyY30tbGFyZ2UuanBnIDgwMHdgXHJcbiAgfVxyXG5cclxuICBzdGF0aWMgaW1hZ2VTaXplc0ZvclJlc3RhdXJhbnQocmVzdGF1cmFudCkge1xyXG4gICAgcmV0dXJuIGAobWF4LXdpZHRoOiAzNjBweCkgMjgwcHgsXHJcbiAgICAgICAgICAgIChtYXgtd2lkdGg6IDYwMHB4KSA2MDBweCxcclxuICAgICAgICAgICAgNDAwcHhgO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTWFwIG1hcmtlciBmb3IgYSByZXN0YXVyYW50LlxyXG4gICAqL1xyXG4gICBzdGF0aWMgbWFwTWFya2VyRm9yUmVzdGF1cmFudChyZXN0YXVyYW50LCBtYXApIHtcclxuICAgIC8vIGh0dHBzOi8vbGVhZmxldGpzLmNvbS9yZWZlcmVuY2UtMS4zLjAuaHRtbCNtYXJrZXIgIFxyXG4gICAgY29uc3QgbWFya2VyID0gbmV3IEwubWFya2VyKFtyZXN0YXVyYW50LmxhdGxuZy5sYXQsIHJlc3RhdXJhbnQubGF0bG5nLmxuZ10sXHJcbiAgICAgIHt0aXRsZTogcmVzdGF1cmFudC5uYW1lLFxyXG4gICAgICBhbHQ6IHJlc3RhdXJhbnQubmFtZSxcclxuICAgICAgdXJsOiBEQkhlbHBlci51cmxGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpXHJcbiAgICAgIH0pXHJcbiAgICAgIG1hcmtlci5hZGRUbyhtYXApO1xyXG4gICAgcmV0dXJuIG1hcmtlcjtcclxuICB9IFxyXG4gIC8qIHN0YXRpYyBtYXBNYXJrZXJGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQsIG1hcCkge1xyXG4gICAgY29uc3QgbWFya2VyID0gbmV3IGdvb2dsZS5tYXBzLk1hcmtlcih7XHJcbiAgICAgIHBvc2l0aW9uOiByZXN0YXVyYW50LmxhdGxuZyxcclxuICAgICAgdGl0bGU6IHJlc3RhdXJhbnQubmFtZSxcclxuICAgICAgdXJsOiBEQkhlbHBlci51cmxGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpLFxyXG4gICAgICBtYXA6IG1hcCxcclxuICAgICAgYW5pbWF0aW9uOiBnb29nbGUubWFwcy5BbmltYXRpb24uRFJPUH1cclxuICAgICk7XHJcbiAgICByZXR1cm4gbWFya2VyO1xyXG4gIH0gKi9cclxuXHJcbiAgc3RhdGljIHN1Ym1pdFJldmlld0J5UmVzdGF1cmFudChyZXZpZXcpIHtcclxuICAgIGZldGNoKGAke0RCSGVscGVyLkFQSV9VUkx9L3Jldmlld3NgLCB7XHJcbiAgICAgIG1ldGhvZDonUE9TVCcsXHJcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICBcInJlc3RhdXJhbnRfaWRcIjogcmV2aWV3LnJlc3RhdXJhbnRfaWQsXHJcbiAgICAgICAgXCJuYW1lXCI6IHJldmlldy5uYW1lLFxyXG4gICAgICAgIFwicmF0aW5nXCI6IHJldmlldy5yYXRpbmcsXHJcbiAgICAgICAgXCJjb21tZW50c1wiOiByZXZpZXcuY29tbWVudHNcclxuICAgIH0pXHJcbiAgICB9KS50aGVuKChyZXNwb25zZSkgPT4ge1xyXG4gICAgICByZXR1cm4gcmVzcG9uc2U7XHJcbiAgICB9KS5jYXRjaCgoZXJyb3IpID0+IHtcclxuICAgICAgZGJQcm9taXNlLmdldFJldmlld3MocmV2aWV3LnJlc3RhdXJhbnRfaWQpLnRoZW4oKHJldmlld3MpPT57XHJcbiAgICAgICAgbGV0IGFsbFJldmlld3MgPSByZXZpZXdzLmNvbmNhdChyZXZpZXcpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGFsbFJldmlld3MpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGRiUHJvbWlzZS5wdXRSZXZpZXdzKHJldmlldy5yZXN0YXVyYW50X2lkLCBhbGxSZXZpZXdzKTtcclxuICAgICAgfSlcclxuICAgIH0pIFxyXG4gIH1cclxuXHJcbiAgc3RhdGljIHVwZGF0ZURhdGFiYXNlKCl7XHJcbiAgICBkYlByb21pc2UuZ2V0UmVzdGF1cmFudHMoKS50aGVuKChyZXN0YXVyYW50cyk9PiB7XHJcbiAgICAgIHJlc3RhdXJhbnRzLmZvckVhY2gocmVzdGF1cmFudCA9PiB7XHJcbiAgICAgICAgaWYocmVzdGF1cmFudC5yZXZpZXdzKXtcclxuICAgICAgICAgIHJlc3RhdXJhbnQucmV2aWV3cy5mb3JFYWNoKChyZXZpZXcpID0+IHtcclxuICAgICAgICAgICAgaWYoIXJldmlldy5pZCl7XHJcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ2luIHVwZGF0ZURhdGFiYXNlOiAnLHJldmlldyk7XHJcbiAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgdGhpcy5zdWJtaXRSZXZpZXdCeVJlc3RhdXJhbnQocmV2aWV3KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfSlcclxuICB9XHJcblxyXG59IiwiaW1wb3J0IElEQiBmcm9tICdpZGInO1xyXG5cclxuY29uc3QgZGJQcm9taXNlID0ge1xyXG4gICAgZGIgOiBJREIub3BlbigncmVzdGF1cmFudC1yZXZpZXdzLWRiJywgMiwgKHVwZ3JhZGVEQikgPT57XHJcbiAgICAgICAgc3dpdGNoKHVwZ3JhZGVEQi5vbGRWZXJzaW9uKXtcclxuICAgICAgICAgICAgY2FzZSAwOlxyXG4gICAgICAgICAgICAgICAgdXBncmFkZURCLmNyZWF0ZU9iamVjdFN0b3JlKCdyZXN0YXVyYW50cycsIHtrZXlQYXRoOiAnaWQnfSlcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfSksXHJcbiAgICBwdXRSZXN0YXVyYW50cyhyZXN0YXVyYW50cykge1xyXG4gICAgICAgIC8vaWYgKCFyZXN0YXVyYW50cy5wdXNoKXsgcmVzdGF1cmFudHMgPSBbcmVzdGF1cmFudHNdfTtcclxuICAgICAgICByZXR1cm4gdGhpcy5kYi50aGVuKGRiID0+IHtcclxuICAgICAgICBjb25zdCBzdG9yZSA9IGRiLnRyYW5zYWN0aW9uKCdyZXN0YXVyYW50cycsICdyZWFkd3JpdGUnKS5vYmplY3RTdG9yZSgncmVzdGF1cmFudHMnKTtcclxuICAgICAgICBQcm9taXNlLmFsbChyZXN0YXVyYW50cy5tYXAobmV0d29ya1Jlc3RhdXJhbnQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gc3RvcmUuZ2V0KG5ldHdvcmtSZXN0YXVyYW50LmlkKS50aGVuKGlkYlJlc3RhdXJhbnQgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWlkYlJlc3RhdXJhbnQgfHwgbmV0d29ya1Jlc3RhdXJhbnQudXBkYXRlZEF0ID4gaWRiUmVzdGF1cmFudC51cGRhdGVkQXQpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBzdG9yZS5wdXQobmV0d29ya1Jlc3RhdXJhbnQpOyAgXHJcbiAgICAgICAgICAgIH0gXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pKS50aGVuKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHN0b3JlLmNvbXBsZXRlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSxcclxuICAgIHB1dFJldmlld3MoaWQsIHJldmlld3Mpe1xyXG4gICAgICAgIGlmKGlkKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGIudGhlbihkYiA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzdG9yZSA9IGRiLnRyYW5zYWN0aW9uKCdyZXN0YXVyYW50cycsICdyZWFkd3JpdGUnKS5vYmplY3RTdG9yZSgncmVzdGF1cmFudHMnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0b3JlLmdldChOdW1iZXIoaWQpKS50aGVuKChyZXN0YXVyYW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdGF1cmFudC5yZXZpZXdzID0gcmV2aWV3cztcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RvcmUucHV0KHJlc3RhdXJhbnQpO1xyXG4gICAgICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RvcmUuY29tcGxldGU7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgIH0sXHJcbiAgICBnZXRSZXN0YXVyYW50cyhpZCA9IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRiLnRoZW4oZGIgPT4ge1xyXG4gICAgICAgICAgY29uc3Qgc3RvcmUgPSBkYi50cmFuc2FjdGlvbigncmVzdGF1cmFudHMnLCAncmVhZG9ubHknKS5vYmplY3RTdG9yZSgncmVzdGF1cmFudHMnKTtcclxuICAgICAgICAgIGlmIChpZCkgcmV0dXJuIHN0b3JlLmdldChOdW1iZXIoaWQpKTtcclxuICAgICAgICAgIHJldHVybiBzdG9yZS5nZXRBbGwoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSxcclxuICAgIGdldFJldmlld3MoaWQgPSB1bmRlZmluZWQpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRiLnRoZW4oKGRiKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHN0b3JlID0gZGIudHJhbnNhY3Rpb24oJ3Jlc3RhdXJhbnRzJywgJ3JlYWRvbmx5Jykub2JqZWN0U3RvcmUoJ3Jlc3RhdXJhbnRzJyk7XHJcbiAgICAgICAgICAgIGlmKGlkKSByZXR1cm4gc3RvcmUuZ2V0KE51bWJlcihpZCkpLnRoZW4ocmVzdGF1cmFudCA9PiB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdGF1cmFudC5yZXZpZXdzXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH0pXHJcbiAgICB9LFxyXG59O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGJQcm9taXNlOyIsImltcG9ydCBEQkhlbHBlciBmcm9tICcuL2pzL2RiaGVscGVyJztcclxuY29uc3QgYXBwTmFtZSA9ICdyZXN0YXVyYW50LWFwcCc7XHJcbmNvbnN0IHZlcnNpb24gPSBhcHBOYW1lICsgJy12MTMnO1xyXG5jb25zdCBpbWdWZXJzaW9uID0gYXBwTmFtZSArICctaW1hZ2VzJztcclxuY29uc3QgYWxsQ2FjaGVzID0gW3ZlcnNpb24sIGltZ1ZlcnNpb25dXHJcbmNvbnN0IHRvQ2FjaGUgPSBbXHJcbiAgICAnLycsXHJcbiAgICAnL2luZGV4Lmh0bWwnLCBcclxuICAgICcvcmVzdGF1cmFudC5odG1sJyxcclxuICAgICcvY3NzL3N0eWxlcy5jc3MnLFxyXG4gICAgJy9jc3Mvc3R5bGVzLW1lZGl1bS5jc3MnLFxyXG4gICAgJy9jc3Mvc3R5bGVzLWxhcmdlLmNzcycsXHJcbiAgICAnL2pzL21haW4uanMnLFxyXG4gICAgJy9qcy9yZXN0YXVyYW50X2luZm8uanMnLFxyXG4gICAgJ21hbmlmZXN0Lmpzb24nLFxyXG4gICAgJ2h0dHBzOi8vdW5wa2cuY29tL2xlYWZsZXRAMS4zLjEvZGlzdC9sZWFmbGV0LmNzcycsXHJcbiAgICAnaHR0cHM6Ly91bnBrZy5jb20vbGVhZmxldEAxLjMuMS9kaXN0L2xlYWZsZXQuanMnXHJcbl07XHJcblxyXG5zZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ2luc3RhbGwnLCBmdW5jdGlvbihldmVudCl7XHJcbiAgICBldmVudC53YWl0VW50aWwoXHJcbiAgICAgICAgY2FjaGVzLm9wZW4odmVyc2lvbikudGhlbihmdW5jdGlvbihjYWNoZSl7XHJcbiAgICAgICAgICAgIHJldHVybiBjYWNoZS5hZGRBbGwodG9DYWNoZSk7XHJcbiAgICAgICAgfSlcclxuICAgIClcclxufSlcclxuXHJcbnNlbGYuYWRkRXZlbnRMaXN0ZW5lcignYWN0aXZhdGUnLCBmdW5jdGlvbihldmVudCl7XHJcbiAgICBldmVudC53YWl0VW50aWwoXHJcbiAgICAgICAgY2FjaGVzLmtleXMoKS50aGVuKGZ1bmN0aW9uKGNhY2hlTmFtZXMpe1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXHJcbiAgICAgICAgICAgICAgICBjYWNoZU5hbWVzLmZpbHRlcihmdW5jdGlvbihjYWNoZU5hbWUpe1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWNoZU5hbWUuc3RhcnRzV2l0aChhcHBOYW1lKSAmJiAhYWxsQ2FjaGVzLmluY2x1ZGVzKGNhY2hlTmFtZSlcclxuICAgICAgICAgICAgICAgIH0pLm1hcChmdW5jdGlvbihjYWNoZU5hbWUpe1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWNoZXMuZGVsZXRlKGNhY2hlTmFtZSk7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgfSlcclxuICAgIClcclxufSlcclxuXHJcbnNlbGYuYWRkRXZlbnRMaXN0ZW5lcignZmV0Y2gnLCBmdW5jdGlvbihldmVudCl7XHJcbiAgICBjb25zdCByZXF1ZXN0VXJsID0gbmV3IFVSTChldmVudC5yZXF1ZXN0LnVybCk7XHJcblxyXG4gICAgaWYocmVxdWVzdFVybC5vcmlnaW4gPT09IGxvY2F0aW9uLm9yaWdpbil7XHJcbiAgICAgICAgaWYgKHJlcXVlc3RVcmwucGF0aG5hbWUuc3RhcnRzV2l0aCgnL3Jlc3RhdXJhbnQuaHRtbCcpKSB7XHJcbiAgICAgICAgICAgIGV2ZW50LnJlc3BvbmRXaXRoKGNhY2hlcy5tYXRjaCgnL3Jlc3RhdXJhbnQuaHRtbCcpKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKHJlcXVlc3RVcmwucGF0aG5hbWUuc3RhcnRzV2l0aCgnL2ltZycpKSB7XHJcbiAgICAgICAgICAgIGV2ZW50LnJlc3BvbmRXaXRoKHNlcnZlSW1hZ2UoZXZlbnQucmVxdWVzdCkpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgIGV2ZW50LnJlc3BvbmRXaXRoKFxyXG4gICAgICAgIGNhY2hlcy5tYXRjaChldmVudC5yZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiByZXNwb25zZSB8fCBmZXRjaChldmVudC5yZXF1ZXN0KTtcclxuICAgICAgICB9KVxyXG4gICAgKVxyXG59KVxyXG5cclxuc2VsZi5hZGRFdmVudExpc3RlbmVyKCdzeW5jJywgZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICBpZiAoZXZlbnQudGFnID09ICd0b2RvX3VwZGF0ZWQnKSB7XHJcbiAgICAgIGV2ZW50LndhaXRVbnRpbChzZXJ2ZXJTeW5jKGV2ZW50KSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG5mdW5jdGlvbiBzZXJ2ZUltYWdlKHJlcXVlc3QpIHtcclxuICAgIGxldCBpbWFnZVN0b3JhZ2VVcmwgPSByZXF1ZXN0LnVybDtcclxuICAgIGltYWdlU3RvcmFnZVVybCA9IGltYWdlU3RvcmFnZVVybC5yZXBsYWNlKC8tc21hbGxcXC5cXHd7M318LW1lZGl1bVxcLlxcd3szfXwtbGFyZ2VcXC5cXHd7M30vaSwgJycpO1xyXG4gIFxyXG4gICAgcmV0dXJuIGNhY2hlcy5vcGVuKGltZ1ZlcnNpb24pLnRoZW4oZnVuY3Rpb24oY2FjaGUpIHtcclxuICAgICAgcmV0dXJuIGNhY2hlLm1hdGNoKGltYWdlU3RvcmFnZVVybCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xyXG4gICAgICAgIHJldHVybiByZXNwb25zZSB8fCBmZXRjaChyZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKG5ldHdvcmtSZXNwb25zZSkge1xyXG4gICAgICAgICAgY2FjaGUucHV0KGltYWdlU3RvcmFnZVVybCwgbmV0d29ya1Jlc3BvbnNlLmNsb25lKCkpO1xyXG4gICAgICAgICAgcmV0dXJuIG5ldHdvcmtSZXNwb25zZTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHNlcnZlclN5bmMoZXZlbnQpIHtcclxuICAgICAgREJIZWxwZXIudXBkYXRlRGF0YWJhc2UoKTsgIFxyXG4gIH0iXX0=
