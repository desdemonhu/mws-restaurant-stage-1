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
    value: function fetchRestaurants(callback) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', "".concat(DBHelper.API_URL, "/restaurants"));

      xhr.onload = function () {
        if (xhr.status === 200) {
          // Got a success response from server!
          var restaurants = JSON.parse(xhr.responseText);

          _dbpromise.default.putRestaurants(restaurants);

          callback(null, restaurants);
        } else {
          _dbpromise.default.getRestaurants().then(function (restaurants) {
            if (restaurants.length > 0) {
              callback(null, restaurants);
            } else {
              var error = "Request failed. Returned status of ".concat(xhr.status);
              callback(error, null);
            }
          });
        }
      };

      xhr.send();
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
        _dbpromise.default.putReviews(id, reviews);

        return callback(null, reviews);
      }).catch(function (error) {
        console.log(error);

        _dbpromise.default.getReviews(id).then(function (reviews) {
          return callback(null, reviews);
        });
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
      if (navigator.onLine) {
        fetch("".concat(DBHelper.API_URL, "/reviews"), {
          method: 'post',
          body: JSON.stringify({
            "restaurant_id": review.restaurant_id,
            "name": review.name,
            "rating": review.rating,
            "comments": review.comments
          })
        }).then(function (response) {
          return response;
        });
      } else {
        _dbpromise.default.getReviews(review.restaurant_id).then(function (reviews) {
          var allReviews = reviews.concat(review);

          _dbpromise.default.putReviews(review.restaurant_id, allReviews);
        });
      }
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
                _this.submitReviewByRestaurant(review);
              }
            });
          }
        });
      });
    } // static updateDatabase(){
    //   //if the id is not in the database already, add it
    //   ///get last updated review from database per restaurant id
    //   dbPromise.getRestaurants().then(restaurants => {
    //     restaurants.forEach(restaurant => {
    //       dbPromise.getReviews(restaurant.id).then((reviews)=>{
    //         fetch(`${this.API_URL}/reviews/?restaurant_id=${restaurant.id}`).then((dbReviews)=>{
    //           ///if a review is later than the last updated dbreview, post it in the database
    //           dbReviews.json().sort(function(a,b) {
    //             if(a.updatedAt < b.updatedAt) return -1;
    //             if (a.updatedAt > b.updatedAt) return 1;
    //             return 0;
    //             })
    //           const lastUpdated = dbReviews[dbReviews.length-1].updatedAt;
    //           reviews.forEach((review) => {
    //             if(review.updatedAt > lastUpdated){
    //               this.submitReviewByRestaurant(review);
    //             }
    //           })
    //           })
    //         })
    //       })
    //     });
    //     console.log('Database Updated'); 
    //   }

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
      var store = db.transaction('restaurants').objectStore('restaurants');
      if (id) return store.get(Number(id));
      return store.getAll();
    });
  },
  getReviews: function getReviews() {
    var id = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;
    return this.db.then(function (db) {
      var store = db.transaction('restaurants').objectStore('restaurants');
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
var version = appName + '-v10';
var imgVersion = appName + '-images';
var allCaches = [version, imgVersion];
var toCache = ['/', 'index.html', '/restaurant.html', '/css/styles.css', '/css/styles-medium.css', '/css/styles-large.css', '/js/main.js', '/js/restaurant_info.js', 'manifest.json', 'https://unpkg.com/leaflet@1.3.1/dist/leaflet.css', 'https://unpkg.com/leaflet@1.3.1/dist/leaflet.js'];
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaWRiL2xpYi9pZGIuanMiLCJzcmMvanMvZGJoZWxwZXIuanMiLCJzcmMvanMvZGJwcm9taXNlLmpzIiwic3JjL3N3LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7O0FDNVRBOzs7Ozs7Ozs7O0FBQ0E7OztJQUdxQixR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LENBQVA7QUFNRCxHQVBNLENBQVA7QUFRRDs7QUFFRCxTQUFTLFVBQVQsQ0FBb0IsS0FBcEIsRUFBMkI7QUFDdkIsb0JBQVMsY0FBVDtBQUNIIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiJ3VzZSBzdHJpY3QnO1xuXG4oZnVuY3Rpb24oKSB7XG4gIGZ1bmN0aW9uIHRvQXJyYXkoYXJyKSB7XG4gICAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFycik7XG4gIH1cblxuICBmdW5jdGlvbiBwcm9taXNpZnlSZXF1ZXN0KHJlcXVlc3QpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXNvbHZlKHJlcXVlc3QucmVzdWx0KTtcbiAgICAgIH07XG5cbiAgICAgIHJlcXVlc3Qub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZWplY3QocmVxdWVzdC5lcnJvcik7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJvbWlzaWZ5UmVxdWVzdENhbGwob2JqLCBtZXRob2QsIGFyZ3MpIHtcbiAgICB2YXIgcmVxdWVzdDtcbiAgICB2YXIgcCA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgcmVxdWVzdCA9IG9ialttZXRob2RdLmFwcGx5KG9iaiwgYXJncyk7XG4gICAgICBwcm9taXNpZnlSZXF1ZXN0KHJlcXVlc3QpLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbiAgICB9KTtcblxuICAgIHAucmVxdWVzdCA9IHJlcXVlc3Q7XG4gICAgcmV0dXJuIHA7XG4gIH1cblxuICBmdW5jdGlvbiBwcm9taXNpZnlDdXJzb3JSZXF1ZXN0Q2FsbChvYmosIG1ldGhvZCwgYXJncykge1xuICAgIHZhciBwID0gcHJvbWlzaWZ5UmVxdWVzdENhbGwob2JqLCBtZXRob2QsIGFyZ3MpO1xuICAgIHJldHVybiBwLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIGlmICghdmFsdWUpIHJldHVybjtcbiAgICAgIHJldHVybiBuZXcgQ3Vyc29yKHZhbHVlLCBwLnJlcXVlc3QpO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlQcm9wZXJ0aWVzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFByb3h5Q2xhc3MucHJvdG90eXBlLCBwcm9wLCB7XG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXNbdGFyZ2V0UHJvcF1bcHJvcF07XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgdGhpc1t0YXJnZXRQcm9wXVtwcm9wXSA9IHZhbDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eVJlcXVlc3RNZXRob2RzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIENvbnN0cnVjdG9yLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIGlmICghKHByb3AgaW4gQ29uc3RydWN0b3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgICAgUHJveHlDbGFzcy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHByb21pc2lmeVJlcXVlc3RDYWxsKHRoaXNbdGFyZ2V0UHJvcF0sIHByb3AsIGFyZ3VtZW50cyk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlNZXRob2RzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIENvbnN0cnVjdG9yLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIGlmICghKHByb3AgaW4gQ29uc3RydWN0b3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgICAgUHJveHlDbGFzcy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXNbdGFyZ2V0UHJvcF1bcHJvcF0uYXBwbHkodGhpc1t0YXJnZXRQcm9wXSwgYXJndW1lbnRzKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eUN1cnNvclJlcXVlc3RNZXRob2RzKFByb3h5Q2xhc3MsIHRhcmdldFByb3AsIENvbnN0cnVjdG9yLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIGlmICghKHByb3AgaW4gQ29uc3RydWN0b3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgICAgUHJveHlDbGFzcy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHByb21pc2lmeUN1cnNvclJlcXVlc3RDYWxsKHRoaXNbdGFyZ2V0UHJvcF0sIHByb3AsIGFyZ3VtZW50cyk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gSW5kZXgoaW5kZXgpIHtcbiAgICB0aGlzLl9pbmRleCA9IGluZGV4O1xuICB9XG5cbiAgcHJveHlQcm9wZXJ0aWVzKEluZGV4LCAnX2luZGV4JywgW1xuICAgICduYW1lJyxcbiAgICAna2V5UGF0aCcsXG4gICAgJ211bHRpRW50cnknLFxuICAgICd1bmlxdWUnXG4gIF0pO1xuXG4gIHByb3h5UmVxdWVzdE1ldGhvZHMoSW5kZXgsICdfaW5kZXgnLCBJREJJbmRleCwgW1xuICAgICdnZXQnLFxuICAgICdnZXRLZXknLFxuICAgICdnZXRBbGwnLFxuICAgICdnZXRBbGxLZXlzJyxcbiAgICAnY291bnQnXG4gIF0pO1xuXG4gIHByb3h5Q3Vyc29yUmVxdWVzdE1ldGhvZHMoSW5kZXgsICdfaW5kZXgnLCBJREJJbmRleCwgW1xuICAgICdvcGVuQ3Vyc29yJyxcbiAgICAnb3BlbktleUN1cnNvcidcbiAgXSk7XG5cbiAgZnVuY3Rpb24gQ3Vyc29yKGN1cnNvciwgcmVxdWVzdCkge1xuICAgIHRoaXMuX2N1cnNvciA9IGN1cnNvcjtcbiAgICB0aGlzLl9yZXF1ZXN0ID0gcmVxdWVzdDtcbiAgfVxuXG4gIHByb3h5UHJvcGVydGllcyhDdXJzb3IsICdfY3Vyc29yJywgW1xuICAgICdkaXJlY3Rpb24nLFxuICAgICdrZXknLFxuICAgICdwcmltYXJ5S2V5JyxcbiAgICAndmFsdWUnXG4gIF0pO1xuXG4gIHByb3h5UmVxdWVzdE1ldGhvZHMoQ3Vyc29yLCAnX2N1cnNvcicsIElEQkN1cnNvciwgW1xuICAgICd1cGRhdGUnLFxuICAgICdkZWxldGUnXG4gIF0pO1xuXG4gIC8vIHByb3h5ICduZXh0JyBtZXRob2RzXG4gIFsnYWR2YW5jZScsICdjb250aW51ZScsICdjb250aW51ZVByaW1hcnlLZXknXS5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZE5hbWUpIHtcbiAgICBpZiAoIShtZXRob2ROYW1lIGluIElEQkN1cnNvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgQ3Vyc29yLnByb3RvdHlwZVttZXRob2ROYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGN1cnNvciA9IHRoaXM7XG4gICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICBjdXJzb3IuX2N1cnNvclttZXRob2ROYW1lXS5hcHBseShjdXJzb3IuX2N1cnNvciwgYXJncyk7XG4gICAgICAgIHJldHVybiBwcm9taXNpZnlSZXF1ZXN0KGN1cnNvci5fcmVxdWVzdCkudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIGlmICghdmFsdWUpIHJldHVybjtcbiAgICAgICAgICByZXR1cm4gbmV3IEN1cnNvcih2YWx1ZSwgY3Vyc29yLl9yZXF1ZXN0KTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9O1xuICB9KTtcblxuICBmdW5jdGlvbiBPYmplY3RTdG9yZShzdG9yZSkge1xuICAgIHRoaXMuX3N0b3JlID0gc3RvcmU7XG4gIH1cblxuICBPYmplY3RTdG9yZS5wcm90b3R5cGUuY3JlYXRlSW5kZXggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IEluZGV4KHRoaXMuX3N0b3JlLmNyZWF0ZUluZGV4LmFwcGx5KHRoaXMuX3N0b3JlLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBPYmplY3RTdG9yZS5wcm90b3R5cGUuaW5kZXggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IEluZGV4KHRoaXMuX3N0b3JlLmluZGV4LmFwcGx5KHRoaXMuX3N0b3JlLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBbXG4gICAgJ25hbWUnLFxuICAgICdrZXlQYXRoJyxcbiAgICAnaW5kZXhOYW1lcycsXG4gICAgJ2F1dG9JbmNyZW1lbnQnXG4gIF0pO1xuXG4gIHByb3h5UmVxdWVzdE1ldGhvZHMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBJREJPYmplY3RTdG9yZSwgW1xuICAgICdwdXQnLFxuICAgICdhZGQnLFxuICAgICdkZWxldGUnLFxuICAgICdjbGVhcicsXG4gICAgJ2dldCcsXG4gICAgJ2dldEFsbCcsXG4gICAgJ2dldEtleScsXG4gICAgJ2dldEFsbEtleXMnLFxuICAgICdjb3VudCdcbiAgXSk7XG5cbiAgcHJveHlDdXJzb3JSZXF1ZXN0TWV0aG9kcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIElEQk9iamVjdFN0b3JlLCBbXG4gICAgJ29wZW5DdXJzb3InLFxuICAgICdvcGVuS2V5Q3Vyc29yJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBJREJPYmplY3RTdG9yZSwgW1xuICAgICdkZWxldGVJbmRleCdcbiAgXSk7XG5cbiAgZnVuY3Rpb24gVHJhbnNhY3Rpb24oaWRiVHJhbnNhY3Rpb24pIHtcbiAgICB0aGlzLl90eCA9IGlkYlRyYW5zYWN0aW9uO1xuICAgIHRoaXMuY29tcGxldGUgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIGlkYlRyYW5zYWN0aW9uLm9uY29tcGxldGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfTtcbiAgICAgIGlkYlRyYW5zYWN0aW9uLm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KGlkYlRyYW5zYWN0aW9uLmVycm9yKTtcbiAgICAgIH07XG4gICAgICBpZGJUcmFuc2FjdGlvbi5vbmFib3J0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlamVjdChpZGJUcmFuc2FjdGlvbi5lcnJvcik7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgVHJhbnNhY3Rpb24ucHJvdG90eXBlLm9iamVjdFN0b3JlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBPYmplY3RTdG9yZSh0aGlzLl90eC5vYmplY3RTdG9yZS5hcHBseSh0aGlzLl90eCwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKFRyYW5zYWN0aW9uLCAnX3R4JywgW1xuICAgICdvYmplY3RTdG9yZU5hbWVzJyxcbiAgICAnbW9kZSdcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKFRyYW5zYWN0aW9uLCAnX3R4JywgSURCVHJhbnNhY3Rpb24sIFtcbiAgICAnYWJvcnQnXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIFVwZ3JhZGVEQihkYiwgb2xkVmVyc2lvbiwgdHJhbnNhY3Rpb24pIHtcbiAgICB0aGlzLl9kYiA9IGRiO1xuICAgIHRoaXMub2xkVmVyc2lvbiA9IG9sZFZlcnNpb247XG4gICAgdGhpcy50cmFuc2FjdGlvbiA9IG5ldyBUcmFuc2FjdGlvbih0cmFuc2FjdGlvbik7XG4gIH1cblxuICBVcGdyYWRlREIucHJvdG90eXBlLmNyZWF0ZU9iamVjdFN0b3JlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBPYmplY3RTdG9yZSh0aGlzLl9kYi5jcmVhdGVPYmplY3RTdG9yZS5hcHBseSh0aGlzLl9kYiwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKFVwZ3JhZGVEQiwgJ19kYicsIFtcbiAgICAnbmFtZScsXG4gICAgJ3ZlcnNpb24nLFxuICAgICdvYmplY3RTdG9yZU5hbWVzJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoVXBncmFkZURCLCAnX2RiJywgSURCRGF0YWJhc2UsIFtcbiAgICAnZGVsZXRlT2JqZWN0U3RvcmUnLFxuICAgICdjbG9zZSdcbiAgXSk7XG5cbiAgZnVuY3Rpb24gREIoZGIpIHtcbiAgICB0aGlzLl9kYiA9IGRiO1xuICB9XG5cbiAgREIucHJvdG90eXBlLnRyYW5zYWN0aW9uID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBUcmFuc2FjdGlvbih0aGlzLl9kYi50cmFuc2FjdGlvbi5hcHBseSh0aGlzLl9kYiwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKERCLCAnX2RiJywgW1xuICAgICduYW1lJyxcbiAgICAndmVyc2lvbicsXG4gICAgJ29iamVjdFN0b3JlTmFtZXMnXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhEQiwgJ19kYicsIElEQkRhdGFiYXNlLCBbXG4gICAgJ2Nsb3NlJ1xuICBdKTtcblxuICAvLyBBZGQgY3Vyc29yIGl0ZXJhdG9yc1xuICAvLyBUT0RPOiByZW1vdmUgdGhpcyBvbmNlIGJyb3dzZXJzIGRvIHRoZSByaWdodCB0aGluZyB3aXRoIHByb21pc2VzXG4gIFsnb3BlbkN1cnNvcicsICdvcGVuS2V5Q3Vyc29yJ10uZm9yRWFjaChmdW5jdGlvbihmdW5jTmFtZSkge1xuICAgIFtPYmplY3RTdG9yZSwgSW5kZXhdLmZvckVhY2goZnVuY3Rpb24oQ29uc3RydWN0b3IpIHtcbiAgICAgIC8vIERvbid0IGNyZWF0ZSBpdGVyYXRlS2V5Q3Vyc29yIGlmIG9wZW5LZXlDdXJzb3IgZG9lc24ndCBleGlzdC5cbiAgICAgIGlmICghKGZ1bmNOYW1lIGluIENvbnN0cnVjdG9yLnByb3RvdHlwZSkpIHJldHVybjtcblxuICAgICAgQ29uc3RydWN0b3IucHJvdG90eXBlW2Z1bmNOYW1lLnJlcGxhY2UoJ29wZW4nLCAnaXRlcmF0ZScpXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IHRvQXJyYXkoYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJnc1thcmdzLmxlbmd0aCAtIDFdO1xuICAgICAgICB2YXIgbmF0aXZlT2JqZWN0ID0gdGhpcy5fc3RvcmUgfHwgdGhpcy5faW5kZXg7XG4gICAgICAgIHZhciByZXF1ZXN0ID0gbmF0aXZlT2JqZWN0W2Z1bmNOYW1lXS5hcHBseShuYXRpdmVPYmplY3QsIGFyZ3Muc2xpY2UoMCwgLTEpKTtcbiAgICAgICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICBjYWxsYmFjayhyZXF1ZXN0LnJlc3VsdCk7XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgIH0pO1xuICB9KTtcblxuICAvLyBwb2x5ZmlsbCBnZXRBbGxcbiAgW0luZGV4LCBPYmplY3RTdG9yZV0uZm9yRWFjaChmdW5jdGlvbihDb25zdHJ1Y3Rvcikge1xuICAgIGlmIChDb25zdHJ1Y3Rvci5wcm90b3R5cGUuZ2V0QWxsKSByZXR1cm47XG4gICAgQ29uc3RydWN0b3IucHJvdG90eXBlLmdldEFsbCA9IGZ1bmN0aW9uKHF1ZXJ5LCBjb3VudCkge1xuICAgICAgdmFyIGluc3RhbmNlID0gdGhpcztcbiAgICAgIHZhciBpdGVtcyA9IFtdO1xuXG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSkge1xuICAgICAgICBpbnN0YW5jZS5pdGVyYXRlQ3Vyc29yKHF1ZXJ5LCBmdW5jdGlvbihjdXJzb3IpIHtcbiAgICAgICAgICBpZiAoIWN1cnNvcikge1xuICAgICAgICAgICAgcmVzb2x2ZShpdGVtcyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGl0ZW1zLnB1c2goY3Vyc29yLnZhbHVlKTtcblxuICAgICAgICAgIGlmIChjb3VudCAhPT0gdW5kZWZpbmVkICYmIGl0ZW1zLmxlbmd0aCA9PSBjb3VudCkge1xuICAgICAgICAgICAgcmVzb2x2ZShpdGVtcyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGN1cnNvci5jb250aW51ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pO1xuXG4gIHZhciBleHAgPSB7XG4gICAgb3BlbjogZnVuY3Rpb24obmFtZSwgdmVyc2lvbiwgdXBncmFkZUNhbGxiYWNrKSB7XG4gICAgICB2YXIgcCA9IHByb21pc2lmeVJlcXVlc3RDYWxsKGluZGV4ZWREQiwgJ29wZW4nLCBbbmFtZSwgdmVyc2lvbl0pO1xuICAgICAgdmFyIHJlcXVlc3QgPSBwLnJlcXVlc3Q7XG5cbiAgICAgIGlmIChyZXF1ZXN0KSB7XG4gICAgICAgIHJlcXVlc3Qub251cGdyYWRlbmVlZGVkID0gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICBpZiAodXBncmFkZUNhbGxiYWNrKSB7XG4gICAgICAgICAgICB1cGdyYWRlQ2FsbGJhY2sobmV3IFVwZ3JhZGVEQihyZXF1ZXN0LnJlc3VsdCwgZXZlbnQub2xkVmVyc2lvbiwgcmVxdWVzdC50cmFuc2FjdGlvbikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHAudGhlbihmdW5jdGlvbihkYikge1xuICAgICAgICByZXR1cm4gbmV3IERCKGRiKTtcbiAgICAgIH0pO1xuICAgIH0sXG4gICAgZGVsZXRlOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgICByZXR1cm4gcHJvbWlzaWZ5UmVxdWVzdENhbGwoaW5kZXhlZERCLCAnZGVsZXRlRGF0YWJhc2UnLCBbbmFtZV0pO1xuICAgIH1cbiAgfTtcblxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGV4cDtcbiAgICBtb2R1bGUuZXhwb3J0cy5kZWZhdWx0ID0gbW9kdWxlLmV4cG9ydHM7XG4gIH1cbiAgZWxzZSB7XG4gICAgc2VsZi5pZGIgPSBleHA7XG4gIH1cbn0oKSk7XG4iLCJpbXBvcnQgZGJQcm9taXNlIGZyb20gJy4vZGJwcm9taXNlJztcclxuLyoqXHJcbiAqIENvbW1vbiBkYXRhYmFzZSBoZWxwZXIgZnVuY3Rpb25zLlxyXG4gKi9cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgREJIZWxwZXIge1xyXG5cclxuICAvKipcclxuICAgKiBEYXRhYmFzZSBVUkwuXHJcbiAgICogQ2hhbmdlIHRoaXMgdG8gcmVzdGF1cmFudHMuanNvbiBmaWxlIGxvY2F0aW9uIG9uIHlvdXIgc2VydmVyLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBnZXQgREFUQUJBU0VfVVJMKCkge1xyXG4gICAgY29uc3QgcG9ydCA9IDgwMDAgLy8gQ2hhbmdlIHRoaXMgdG8geW91ciBzZXJ2ZXIgcG9ydFxyXG4gICAgcmV0dXJuIGBodHRwOi8vbG9jYWxob3N0OiR7cG9ydH0vZGF0YS9yZXN0YXVyYW50cy5qc29uYDtcclxuICB9XHJcblxyXG4gIHN0YXRpYyBnZXQgQVBJX1VSTCgpe1xyXG4gICAgY29uc3QgcG9ydCA9IDEzMzc7XHJcbiAgICByZXR1cm4gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtwb3J0fWBcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIGFsbCByZXN0YXVyYW50cy5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50cyhjYWxsYmFjaykge1xyXG4gICAgbGV0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xyXG4gICAgeGhyLm9wZW4oJ0dFVCcsIGAke0RCSGVscGVyLkFQSV9VUkx9L3Jlc3RhdXJhbnRzYCk7XHJcbiAgICB4aHIub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICBpZiAoeGhyLnN0YXR1cyA9PT0gMjAwKSB7IC8vIEdvdCBhIHN1Y2Nlc3MgcmVzcG9uc2UgZnJvbSBzZXJ2ZXIhXHJcbiAgICAgICAgY29uc3QgcmVzdGF1cmFudHMgPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpO1xyXG4gICAgICAgIGRiUHJvbWlzZS5wdXRSZXN0YXVyYW50cyhyZXN0YXVyYW50cyk7XHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudHMpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgICBkYlByb21pc2UuZ2V0UmVzdGF1cmFudHMoKS50aGVuKHJlc3RhdXJhbnRzID0+e1xyXG4gICAgICAgICAgaWYocmVzdGF1cmFudHMubGVuZ3RoID4gMCl7XHJcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnRzKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gKGBSZXF1ZXN0IGZhaWxlZC4gUmV0dXJuZWQgc3RhdHVzIG9mICR7eGhyLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgY2FsbGJhY2soZXJyb3IsIG51bGwpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pOyBcclxuICAgICAgfVxyXG4gICAgfTtcclxuICAgIHhoci5zZW5kKCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCBhIHJlc3RhdXJhbnQgYnkgaXRzIElELlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaFJlc3RhdXJhbnRCeUlkKGlkLCBjYWxsYmFjaykge1xyXG4gICAgZmV0Y2goYCR7REJIZWxwZXIuQVBJX1VSTH0vcmVzdGF1cmFudHMvJHtpZH1gKS50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgaWYgKCFyZXNwb25zZS5vaykgcmV0dXJuIFByb21pc2UucmVqZWN0KFwiUmVzdGF1cmFudCBjb3VsZG4ndCBiZSBmZXRjaGVkIGZyb20gbmV0d29ya1wiKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxuICAgIH0pXHJcbiAgICAudGhlbigocmVzdGF1cmFudCk9PiB7XHJcbiAgICAgIGRiUHJvbWlzZS5wdXRSZXN0YXVyYW50cyhyZXN0YXVyYW50KVxyXG4gICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudCk7XHJcbiAgICB9KS5jYXRjaCgoZXJyb3IpID0+IHtcclxuICAgICAgY29uc29sZS5sb2coaWQsIGVycm9yKTtcclxuICAgICAgZGJQcm9taXNlLmdldFJlc3RhdXJhbnRzKGlkKS50aGVuKChyZXN0YXVyYW50KT0+e1xyXG4gICAgICAgIHJldHVybiBjYWxsYmFjayhudWxsLCByZXN0YXVyYW50KTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHN0YXRpYyBmZXRjaFJldmlld3NCeVJlc3RhdXJhbnQoaWQsIGNhbGxiYWNrKXtcclxuICAgIGZldGNoKGAke0RCSGVscGVyLkFQSV9VUkx9L3Jldmlld3MvP3Jlc3RhdXJhbnRfaWQ9JHtpZH1gKS50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgaWYgKCFyZXNwb25zZS5vaykgcmV0dXJuIFByb21pc2UucmVqZWN0KFwiUmVzdGF1cmFudCBSZXZpZXdzIGNvdWxkbid0IGJlIGZldGNoZWQgZnJvbSBuZXR3b3JrXCIpO1xyXG4gICAgICByZXR1cm4gcmVzcG9uc2UuanNvbigpO1xyXG4gICAgfSkudGhlbigocmV2aWV3cyk9PiB7XHJcbiAgICAgIGRiUHJvbWlzZS5wdXRSZXZpZXdzKGlkLCByZXZpZXdzKTtcclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKG51bGwsIHJldmlld3MpO1xyXG4gICAgfSkuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGVycm9yKTtcclxuICAgICAgZGJQcm9taXNlLmdldFJldmlld3MoaWQpLnRoZW4oKHJldmlld3MpPT57XHJcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKG51bGwsIHJldmlld3MpO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggcmVzdGF1cmFudHMgYnkgYSBjdWlzaW5lIHR5cGUgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudEJ5Q3Vpc2luZShjdWlzaW5lLCBjYWxsYmFjaykge1xyXG4gICAgLy8gRmV0Y2ggYWxsIHJlc3RhdXJhbnRzICB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZ1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBGaWx0ZXIgcmVzdGF1cmFudHMgdG8gaGF2ZSBvbmx5IGdpdmVuIGN1aXNpbmUgdHlwZVxyXG4gICAgICAgIGNvbnN0IHJlc3VsdHMgPSByZXN0YXVyYW50cy5maWx0ZXIociA9PiByLmN1aXNpbmVfdHlwZSA9PSBjdWlzaW5lKTtcclxuICAgICAgICBjYWxsYmFjayhudWxsLCByZXN1bHRzKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCByZXN0YXVyYW50cyBieSBhIG5laWdoYm9yaG9vZCB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZy5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50QnlOZWlnaGJvcmhvb2QobmVpZ2hib3Job29kLCBjYWxsYmFjaykge1xyXG4gICAgLy8gRmV0Y2ggYWxsIHJlc3RhdXJhbnRzXHJcbiAgICBEQkhlbHBlci5mZXRjaFJlc3RhdXJhbnRzKChlcnJvciwgcmVzdGF1cmFudHMpID0+IHtcclxuICAgICAgaWYgKGVycm9yKSB7XHJcbiAgICAgICAgY2FsbGJhY2soZXJyb3IsIG51bGwpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIEZpbHRlciByZXN0YXVyYW50cyB0byBoYXZlIG9ubHkgZ2l2ZW4gbmVpZ2hib3Job29kXHJcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IHJlc3RhdXJhbnRzLmZpbHRlcihyID0+IHIubmVpZ2hib3Job29kID09IG5laWdoYm9yaG9vZCk7XHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0cyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggcmVzdGF1cmFudHMgYnkgYSBjdWlzaW5lIGFuZCBhIG5laWdoYm9yaG9vZCB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZy5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50QnlDdWlzaW5lQW5kTmVpZ2hib3Job29kKGN1aXNpbmUsIG5laWdoYm9yaG9vZCwgY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50c1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBsZXQgcmVzdWx0cyA9IHJlc3RhdXJhbnRzXHJcbiAgICAgICAgaWYgKGN1aXNpbmUgIT0gJ2FsbCcpIHsgLy8gZmlsdGVyIGJ5IGN1aXNpbmVcclxuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihyID0+IHIuY3Vpc2luZV90eXBlID09IGN1aXNpbmUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobmVpZ2hib3Job29kICE9ICdhbGwnKSB7IC8vIGZpbHRlciBieSBuZWlnaGJvcmhvb2RcclxuICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmZpbHRlcihyID0+IHIubmVpZ2hib3Job29kID09IG5laWdoYm9yaG9vZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdHMpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIGFsbCBuZWlnaGJvcmhvb2RzIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaE5laWdoYm9yaG9vZHMoY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50c1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBHZXQgYWxsIG5laWdoYm9yaG9vZHMgZnJvbSBhbGwgcmVzdGF1cmFudHNcclxuICAgICAgICBjb25zdCBuZWlnaGJvcmhvb2RzID0gcmVzdGF1cmFudHMubWFwKCh2LCBpKSA9PiByZXN0YXVyYW50c1tpXS5uZWlnaGJvcmhvb2QpXHJcbiAgICAgICAgLy8gUmVtb3ZlIGR1cGxpY2F0ZXMgZnJvbSBuZWlnaGJvcmhvb2RzXHJcbiAgICAgICAgY29uc3QgdW5pcXVlTmVpZ2hib3Job29kcyA9IG5laWdoYm9yaG9vZHMuZmlsdGVyKCh2LCBpKSA9PiBuZWlnaGJvcmhvb2RzLmluZGV4T2YodikgPT0gaSlcclxuICAgICAgICBjYWxsYmFjayhudWxsLCB1bmlxdWVOZWlnaGJvcmhvb2RzKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCBhbGwgY3Vpc2luZXMgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoQ3Vpc2luZXMoY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50c1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBHZXQgYWxsIGN1aXNpbmVzIGZyb20gYWxsIHJlc3RhdXJhbnRzXHJcbiAgICAgICAgY29uc3QgY3Vpc2luZXMgPSByZXN0YXVyYW50cy5tYXAoKHYsIGkpID0+IHJlc3RhdXJhbnRzW2ldLmN1aXNpbmVfdHlwZSlcclxuICAgICAgICAvLyBSZW1vdmUgZHVwbGljYXRlcyBmcm9tIGN1aXNpbmVzXHJcbiAgICAgICAgY29uc3QgdW5pcXVlQ3Vpc2luZXMgPSBjdWlzaW5lcy5maWx0ZXIoKHYsIGkpID0+IGN1aXNpbmVzLmluZGV4T2YodikgPT0gaSlcclxuICAgICAgICBjYWxsYmFjayhudWxsLCB1bmlxdWVDdWlzaW5lcyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVzdGF1cmFudCBwYWdlIFVSTC5cclxuICAgKi9cclxuICBzdGF0aWMgdXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KSB7XHJcbiAgICByZXR1cm4gKGAuL3Jlc3RhdXJhbnQuaHRtbD9pZD0ke3Jlc3RhdXJhbnQuaWR9YCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZXN0YXVyYW50IGltYWdlIFVSTC5cclxuICAgKi9cclxuICBzdGF0aWMgaW1hZ2VVcmxGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpIHtcclxuICAgIHJldHVybiAoYC9pbWcvJHtyZXN0YXVyYW50LnBob3RvZ3JhcGggfHwgcmVzdGF1cmFudC5pZH0tbWVkaXVtLmpwZ2ApO1xyXG4gIH1cclxuXHJcbiAgc3RhdGljIGltYWdlU3JjU2V0Rm9yUmVzdGF1cmFudChyZXN0YXVyYW50KXtcclxuICAgIGNvbnN0IGltZ1NyYyA9IGAvaW1nLyR7cmVzdGF1cmFudC5waG90b2dyYXBoIHx8IHJlc3RhdXJhbnQuaWR9YDtcclxuICAgIHJldHVybiBgJHtpbWdTcmN9LXNtYWxsLmpwZyAzMDB3LFxyXG4gICAgICAgICAgICAke2ltZ1NyY30tbWVkaXVtLmpwZyA2MDB3LFxyXG4gICAgICAgICAgICAke2ltZ1NyY30tbGFyZ2UuanBnIDgwMHdgXHJcbiAgfVxyXG5cclxuICBzdGF0aWMgaW1hZ2VTaXplc0ZvclJlc3RhdXJhbnQocmVzdGF1cmFudCkge1xyXG4gICAgcmV0dXJuIGAobWF4LXdpZHRoOiAzNjBweCkgMjgwcHgsXHJcbiAgICAgICAgICAgIChtYXgtd2lkdGg6IDYwMHB4KSA2MDBweCxcclxuICAgICAgICAgICAgNDAwcHhgO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTWFwIG1hcmtlciBmb3IgYSByZXN0YXVyYW50LlxyXG4gICAqL1xyXG4gICBzdGF0aWMgbWFwTWFya2VyRm9yUmVzdGF1cmFudChyZXN0YXVyYW50LCBtYXApIHtcclxuICAgIC8vIGh0dHBzOi8vbGVhZmxldGpzLmNvbS9yZWZlcmVuY2UtMS4zLjAuaHRtbCNtYXJrZXIgIFxyXG4gICAgY29uc3QgbWFya2VyID0gbmV3IEwubWFya2VyKFtyZXN0YXVyYW50LmxhdGxuZy5sYXQsIHJlc3RhdXJhbnQubGF0bG5nLmxuZ10sXHJcbiAgICAgIHt0aXRsZTogcmVzdGF1cmFudC5uYW1lLFxyXG4gICAgICBhbHQ6IHJlc3RhdXJhbnQubmFtZSxcclxuICAgICAgdXJsOiBEQkhlbHBlci51cmxGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpXHJcbiAgICAgIH0pXHJcbiAgICAgIG1hcmtlci5hZGRUbyhtYXApO1xyXG4gICAgcmV0dXJuIG1hcmtlcjtcclxuICB9IFxyXG4gIC8qIHN0YXRpYyBtYXBNYXJrZXJGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQsIG1hcCkge1xyXG4gICAgY29uc3QgbWFya2VyID0gbmV3IGdvb2dsZS5tYXBzLk1hcmtlcih7XHJcbiAgICAgIHBvc2l0aW9uOiByZXN0YXVyYW50LmxhdGxuZyxcclxuICAgICAgdGl0bGU6IHJlc3RhdXJhbnQubmFtZSxcclxuICAgICAgdXJsOiBEQkhlbHBlci51cmxGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpLFxyXG4gICAgICBtYXA6IG1hcCxcclxuICAgICAgYW5pbWF0aW9uOiBnb29nbGUubWFwcy5BbmltYXRpb24uRFJPUH1cclxuICAgICk7XHJcbiAgICByZXR1cm4gbWFya2VyO1xyXG4gIH0gKi9cclxuXHJcbiAgc3RhdGljIHN1Ym1pdFJldmlld0J5UmVzdGF1cmFudChyZXZpZXcpIHtcclxuICBpZihuYXZpZ2F0b3Iub25MaW5lKSB7XHJcbiAgICBmZXRjaChgJHtEQkhlbHBlci5BUElfVVJMfS9yZXZpZXdzYCwge1xyXG4gICAgICBtZXRob2Q6J3Bvc3QnLFxyXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgXCJyZXN0YXVyYW50X2lkXCI6IHJldmlldy5yZXN0YXVyYW50X2lkLFxyXG4gICAgICAgIFwibmFtZVwiOiByZXZpZXcubmFtZSxcclxuICAgICAgICBcInJhdGluZ1wiOiByZXZpZXcucmF0aW5nLFxyXG4gICAgICAgIFwiY29tbWVudHNcIjogcmV2aWV3LmNvbW1lbnRzXHJcbiAgICB9KVxyXG4gICAgfSkudGhlbigocmVzcG9uc2UpID0+IHtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gICAgfSlcclxuICB9IGVsc2Uge1xyXG4gICAgICBkYlByb21pc2UuZ2V0UmV2aWV3cyhyZXZpZXcucmVzdGF1cmFudF9pZCkudGhlbigocmV2aWV3cyk9PntcclxuICAgICAgICBsZXQgYWxsUmV2aWV3cyA9IHJldmlld3MuY29uY2F0KHJldmlldyk7XHJcbiAgICAgICAgZGJQcm9taXNlLnB1dFJldmlld3MocmV2aWV3LnJlc3RhdXJhbnRfaWQsIGFsbFJldmlld3MpO1xyXG4gICAgICB9KVxyXG4gICAgfSAgXHJcbiAgfVxyXG5cclxuICBzdGF0aWMgdXBkYXRlRGF0YWJhc2UoKXtcclxuICAgIGRiUHJvbWlzZS5nZXRSZXN0YXVyYW50cygpLnRoZW4oKHJlc3RhdXJhbnRzKT0+IHtcclxuICAgICAgcmVzdGF1cmFudHMuZm9yRWFjaChyZXN0YXVyYW50ID0+IHtcclxuICAgICAgICBpZihyZXN0YXVyYW50LnJldmlld3Mpe1xyXG4gICAgICAgICAgcmVzdGF1cmFudC5yZXZpZXdzLmZvckVhY2goKHJldmlldykgPT4ge1xyXG4gICAgICAgICAgICBpZighcmV2aWV3LmlkKXtcclxuICAgICAgICAgICAgICB0aGlzLnN1Ym1pdFJldmlld0J5UmVzdGF1cmFudChyZXZpZXcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgLy8gc3RhdGljIHVwZGF0ZURhdGFiYXNlKCl7XHJcbiAgLy8gICAvL2lmIHRoZSBpZCBpcyBub3QgaW4gdGhlIGRhdGFiYXNlIGFscmVhZHksIGFkZCBpdFxyXG4gIC8vICAgLy8vZ2V0IGxhc3QgdXBkYXRlZCByZXZpZXcgZnJvbSBkYXRhYmFzZSBwZXIgcmVzdGF1cmFudCBpZFxyXG4gIC8vICAgZGJQcm9taXNlLmdldFJlc3RhdXJhbnRzKCkudGhlbihyZXN0YXVyYW50cyA9PiB7XHJcbiAgLy8gICAgIHJlc3RhdXJhbnRzLmZvckVhY2gocmVzdGF1cmFudCA9PiB7XHJcbiAgLy8gICAgICAgZGJQcm9taXNlLmdldFJldmlld3MocmVzdGF1cmFudC5pZCkudGhlbigocmV2aWV3cyk9PntcclxuICAvLyAgICAgICAgIGZldGNoKGAke3RoaXMuQVBJX1VSTH0vcmV2aWV3cy8/cmVzdGF1cmFudF9pZD0ke3Jlc3RhdXJhbnQuaWR9YCkudGhlbigoZGJSZXZpZXdzKT0+e1xyXG4gIC8vICAgICAgICAgICAvLy9pZiBhIHJldmlldyBpcyBsYXRlciB0aGFuIHRoZSBsYXN0IHVwZGF0ZWQgZGJyZXZpZXcsIHBvc3QgaXQgaW4gdGhlIGRhdGFiYXNlXHJcblxyXG4gIC8vICAgICAgICAgICBkYlJldmlld3MuanNvbigpLnNvcnQoZnVuY3Rpb24oYSxiKSB7XHJcbiAgLy8gICAgICAgICAgICAgaWYoYS51cGRhdGVkQXQgPCBiLnVwZGF0ZWRBdCkgcmV0dXJuIC0xO1xyXG4gIC8vICAgICAgICAgICAgIGlmIChhLnVwZGF0ZWRBdCA+IGIudXBkYXRlZEF0KSByZXR1cm4gMTtcclxuICAvLyAgICAgICAgICAgICByZXR1cm4gMDtcclxuICAvLyAgICAgICAgICAgICB9KVxyXG4gIC8vICAgICAgICAgICBjb25zdCBsYXN0VXBkYXRlZCA9IGRiUmV2aWV3c1tkYlJldmlld3MubGVuZ3RoLTFdLnVwZGF0ZWRBdDtcclxuICAvLyAgICAgICAgICAgcmV2aWV3cy5mb3JFYWNoKChyZXZpZXcpID0+IHtcclxuICAvLyAgICAgICAgICAgICBpZihyZXZpZXcudXBkYXRlZEF0ID4gbGFzdFVwZGF0ZWQpe1xyXG4gIC8vICAgICAgICAgICAgICAgdGhpcy5zdWJtaXRSZXZpZXdCeVJlc3RhdXJhbnQocmV2aWV3KTtcclxuICAvLyAgICAgICAgICAgICB9XHJcbiAgLy8gICAgICAgICAgIH0pXHJcbiAgLy8gICAgICAgICAgIH0pXHJcbiAgLy8gICAgICAgICB9KVxyXG4gIC8vICAgICAgIH0pXHJcbiAgLy8gICAgIH0pO1xyXG4gIC8vICAgICBjb25zb2xlLmxvZygnRGF0YWJhc2UgVXBkYXRlZCcpOyBcclxuICAvLyAgIH1cclxuXHJcblxyXG4gIH0iLCJpbXBvcnQgSURCIGZyb20gJ2lkYic7XHJcblxyXG5jb25zdCBkYlByb21pc2UgPSB7XHJcbiAgICBkYiA6IElEQi5vcGVuKCdyZXN0YXVyYW50LXJldmlld3MtZGInLCAyLCAodXBncmFkZURCKSA9PntcclxuICAgICAgICBzd2l0Y2godXBncmFkZURCLm9sZFZlcnNpb24pe1xyXG4gICAgICAgICAgICBjYXNlIDA6XHJcbiAgICAgICAgICAgICAgICB1cGdyYWRlREIuY3JlYXRlT2JqZWN0U3RvcmUoJ3Jlc3RhdXJhbnRzJywge2tleVBhdGg6ICdpZCd9KVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9KSxcclxuICAgIHB1dFJlc3RhdXJhbnRzKHJlc3RhdXJhbnRzKSB7XHJcbiAgICAgICAgLy9pZiAoIXJlc3RhdXJhbnRzLnB1c2gpeyByZXN0YXVyYW50cyA9IFtyZXN0YXVyYW50c119O1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRiLnRoZW4oZGIgPT4ge1xyXG4gICAgICAgIGNvbnN0IHN0b3JlID0gZGIudHJhbnNhY3Rpb24oJ3Jlc3RhdXJhbnRzJywgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKCdyZXN0YXVyYW50cycpO1xyXG4gICAgICAgIFByb21pc2UuYWxsKHJlc3RhdXJhbnRzLm1hcChuZXR3b3JrUmVzdGF1cmFudCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBzdG9yZS5nZXQobmV0d29ya1Jlc3RhdXJhbnQuaWQpLnRoZW4oaWRiUmVzdGF1cmFudCA9PiB7XHJcbiAgICAgICAgICAgIGlmICghaWRiUmVzdGF1cmFudCB8fCBuZXR3b3JrUmVzdGF1cmFudC51cGRhdGVkQXQgPiBpZGJSZXN0YXVyYW50LnVwZGF0ZWRBdCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0b3JlLnB1dChuZXR3b3JrUmVzdGF1cmFudCk7ICBcclxuICAgICAgICAgICAgfSBcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSkpLnRoZW4oZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gc3RvcmUuY29tcGxldGU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9LFxyXG4gICAgcHV0UmV2aWV3cyhpZCwgcmV2aWV3cyl7XHJcbiAgICAgICAgaWYoaWQpe1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5kYi50aGVuKGRiID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHN0b3JlID0gZGIudHJhbnNhY3Rpb24oJ3Jlc3RhdXJhbnRzJywgJ3JlYWR3cml0ZScpLm9iamVjdFN0b3JlKCdyZXN0YXVyYW50cycpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RvcmUuZ2V0KE51bWJlcihpZCkpLnRoZW4oKHJlc3RhdXJhbnQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICByZXN0YXVyYW50LnJldmlld3MgPSByZXZpZXdzO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzdG9yZS5wdXQocmVzdGF1cmFudCk7XHJcbiAgICAgICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzdG9yZS5jb21wbGV0ZTtcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgfSxcclxuICAgIGdldFJlc3RhdXJhbnRzKGlkID0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGIudGhlbihkYiA9PiB7XHJcbiAgICAgICAgICBjb25zdCBzdG9yZSA9IGRiLnRyYW5zYWN0aW9uKCdyZXN0YXVyYW50cycpLm9iamVjdFN0b3JlKCdyZXN0YXVyYW50cycpO1xyXG4gICAgICAgICAgaWYgKGlkKSByZXR1cm4gc3RvcmUuZ2V0KE51bWJlcihpZCkpO1xyXG4gICAgICAgICAgcmV0dXJuIHN0b3JlLmdldEFsbCgpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9LFxyXG4gICAgZ2V0UmV2aWV3cyhpZCA9IHVuZGVmaW5lZCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGIudGhlbigoZGIpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgc3RvcmUgPSBkYi50cmFuc2FjdGlvbigncmVzdGF1cmFudHMnKS5vYmplY3RTdG9yZSgncmVzdGF1cmFudHMnKTtcclxuICAgICAgICAgICAgaWYoaWQpIHJldHVybiBzdG9yZS5nZXQoTnVtYmVyKGlkKSkudGhlbihyZXN0YXVyYW50ID0+IHtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN0YXVyYW50LnJldmlld3NcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfSlcclxuICAgIH0sXHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkYlByb21pc2U7IiwiaW1wb3J0IERCSGVscGVyIGZyb20gJy4vanMvZGJoZWxwZXInO1xyXG5jb25zdCBhcHBOYW1lID0gJ3Jlc3RhdXJhbnQtYXBwJztcclxuY29uc3QgdmVyc2lvbiA9IGFwcE5hbWUgKyAnLXYxMCc7XHJcbmNvbnN0IGltZ1ZlcnNpb24gPSBhcHBOYW1lICsgJy1pbWFnZXMnO1xyXG5jb25zdCBhbGxDYWNoZXMgPSBbdmVyc2lvbiwgaW1nVmVyc2lvbl1cclxuY29uc3QgdG9DYWNoZSA9IFtcclxuICAgICcvJyxcclxuICAgICdpbmRleC5odG1sJywgXHJcbiAgICAnL3Jlc3RhdXJhbnQuaHRtbCcsXHJcbiAgICAnL2Nzcy9zdHlsZXMuY3NzJyxcclxuICAgICcvY3NzL3N0eWxlcy1tZWRpdW0uY3NzJyxcclxuICAgICcvY3NzL3N0eWxlcy1sYXJnZS5jc3MnLFxyXG4gICAgJy9qcy9tYWluLmpzJyxcclxuICAgICcvanMvcmVzdGF1cmFudF9pbmZvLmpzJyxcclxuICAgICdtYW5pZmVzdC5qc29uJyxcclxuICAgICdodHRwczovL3VucGtnLmNvbS9sZWFmbGV0QDEuMy4xL2Rpc3QvbGVhZmxldC5jc3MnLFxyXG4gICAgJ2h0dHBzOi8vdW5wa2cuY29tL2xlYWZsZXRAMS4zLjEvZGlzdC9sZWFmbGV0LmpzJ1xyXG5dO1xyXG5cclxuc2VsZi5hZGRFdmVudExpc3RlbmVyKCdpbnN0YWxsJywgZnVuY3Rpb24oZXZlbnQpe1xyXG4gICAgZXZlbnQud2FpdFVudGlsKFxyXG4gICAgICAgIGNhY2hlcy5vcGVuKHZlcnNpb24pLnRoZW4oZnVuY3Rpb24oY2FjaGUpe1xyXG4gICAgICAgICAgICByZXR1cm4gY2FjaGUuYWRkQWxsKHRvQ2FjaGUpO1xyXG4gICAgICAgIH0pXHJcbiAgICApXHJcbn0pXHJcblxyXG5zZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ2FjdGl2YXRlJywgZnVuY3Rpb24oZXZlbnQpe1xyXG4gICAgZXZlbnQud2FpdFVudGlsKFxyXG4gICAgICAgIGNhY2hlcy5rZXlzKCkudGhlbihmdW5jdGlvbihjYWNoZU5hbWVzKXtcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxyXG4gICAgICAgICAgICAgICAgY2FjaGVOYW1lcy5maWx0ZXIoZnVuY3Rpb24oY2FjaGVOYW1lKXtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2FjaGVOYW1lLnN0YXJ0c1dpdGgoYXBwTmFtZSkgJiYgIWFsbENhY2hlcy5pbmNsdWRlcyhjYWNoZU5hbWUpXHJcbiAgICAgICAgICAgICAgICB9KS5tYXAoZnVuY3Rpb24oY2FjaGVOYW1lKXtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2FjaGVzLmRlbGV0ZShjYWNoZU5hbWUpO1xyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgKVxyXG4gICAgICAgIH0pXHJcbiAgICApXHJcbn0pXHJcblxyXG5zZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ2ZldGNoJywgZnVuY3Rpb24oZXZlbnQpe1xyXG4gICAgY29uc3QgcmVxdWVzdFVybCA9IG5ldyBVUkwoZXZlbnQucmVxdWVzdC51cmwpO1xyXG5cclxuICAgIGlmKHJlcXVlc3RVcmwub3JpZ2luID09PSBsb2NhdGlvbi5vcmlnaW4pe1xyXG4gICAgICAgIGlmIChyZXF1ZXN0VXJsLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9yZXN0YXVyYW50Lmh0bWwnKSkge1xyXG4gICAgICAgICAgICBldmVudC5yZXNwb25kV2l0aChjYWNoZXMubWF0Y2goJy9yZXN0YXVyYW50Lmh0bWwnKSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChyZXF1ZXN0VXJsLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9pbWcnKSkge1xyXG4gICAgICAgICAgICBldmVudC5yZXNwb25kV2l0aChzZXJ2ZUltYWdlKGV2ZW50LnJlcXVlc3QpKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICBldmVudC5yZXNwb25kV2l0aChcclxuICAgICAgICBjYWNoZXMubWF0Y2goZXZlbnQucmVxdWVzdCkudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xyXG4gICAgICAgICAgICByZXR1cm4gcmVzcG9uc2UgfHwgZmV0Y2goZXZlbnQucmVxdWVzdCk7XHJcbiAgICAgICAgfSlcclxuICAgIClcclxufSlcclxuXHJcbnNlbGYuYWRkRXZlbnRMaXN0ZW5lcignc3luYycsIGZ1bmN0aW9uIChldmVudCkge1xyXG4gICAgaWYgKGV2ZW50LnRhZyA9PSAndG9kb191cGRhdGVkJykge1xyXG4gICAgICBldmVudC53YWl0VW50aWwoc2VydmVyU3luYyhldmVudCkpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuZnVuY3Rpb24gc2VydmVJbWFnZShyZXF1ZXN0KSB7XHJcbiAgICBsZXQgaW1hZ2VTdG9yYWdlVXJsID0gcmVxdWVzdC51cmw7XHJcbiAgICBpbWFnZVN0b3JhZ2VVcmwgPSBpbWFnZVN0b3JhZ2VVcmwucmVwbGFjZSgvLXNtYWxsXFwuXFx3ezN9fC1tZWRpdW1cXC5cXHd7M318LWxhcmdlXFwuXFx3ezN9L2ksICcnKTtcclxuICBcclxuICAgIHJldHVybiBjYWNoZXMub3BlbihpbWdWZXJzaW9uKS50aGVuKGZ1bmN0aW9uKGNhY2hlKSB7XHJcbiAgICAgIHJldHVybiBjYWNoZS5tYXRjaChpbWFnZVN0b3JhZ2VVcmwpLnRoZW4oZnVuY3Rpb24ocmVzcG9uc2UpIHtcclxuICAgICAgICByZXR1cm4gcmVzcG9uc2UgfHwgZmV0Y2gocmVxdWVzdCkudGhlbihmdW5jdGlvbihuZXR3b3JrUmVzcG9uc2UpIHtcclxuICAgICAgICAgIGNhY2hlLnB1dChpbWFnZVN0b3JhZ2VVcmwsIG5ldHdvcmtSZXNwb25zZS5jbG9uZSgpKTtcclxuICAgICAgICAgIHJldHVybiBuZXR3b3JrUmVzcG9uc2U7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBzZXJ2ZXJTeW5jKGV2ZW50KSB7XHJcbiAgICAgIERCSGVscGVyLnVwZGF0ZURhdGFiYXNlKCk7ICBcclxuICB9Il19
