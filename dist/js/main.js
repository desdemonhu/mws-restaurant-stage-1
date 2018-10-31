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

var _dbhelper = _interopRequireDefault(require("./dbhelper"));

var _secret = _interopRequireDefault(require("./secret"));

require("./register-sw");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var restaurants, neighborhoods, cuisines;
var newMap;
var markers = [];
/**
 * Fetch neighborhoods and cuisines as soon as the page is loaded.
 */

document.addEventListener('DOMContentLoaded', function (event) {
  initMap(); // added 

  fetchNeighborhoods();
  fetchCuisines();
});
/**
 * Fetch all neighborhoods and set their HTML.
 */

var fetchNeighborhoods = function fetchNeighborhoods() {
  _dbhelper.default.fetchNeighborhoods(function (error, neighborhoods) {
    if (error) {
      // Got an error
      console.error(error);
    } else {
      self.neighborhoods = neighborhoods;
      fillNeighborhoodsHTML();
    }
  });
};
/**
 * Set neighborhoods HTML.
 */


var fillNeighborhoodsHTML = function fillNeighborhoodsHTML() {
  var neighborhoods = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.neighborhoods;
  var select = document.getElementById('neighborhoods-select');
  neighborhoods.forEach(function (neighborhood) {
    var option = document.createElement('option');
    option.innerHTML = neighborhood;
    option.value = neighborhood;
    select.append(option);
  });
};
/**
 * Fetch all cuisines and set their HTML.
 */


var fetchCuisines = function fetchCuisines() {
  _dbhelper.default.fetchCuisines(function (error, cuisines) {
    if (error) {
      // Got an error!
      console.error(error);
    } else {
      self.cuisines = cuisines;
      fillCuisinesHTML();
    }
  });
};
/**
 * Set cuisines HTML.
 */


var fillCuisinesHTML = function fillCuisinesHTML() {
  var cuisines = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.cuisines;
  var select = document.getElementById('cuisines-select');
  cuisines.forEach(function (cuisine) {
    var option = document.createElement('option');
    option.innerHTML = cuisine;
    option.value = cuisine;
    select.append(option);
  });
};
/**
 * Initialize leaflet map, called from HTML.
 */


var initMap = function initMap() {
  if (!_secret.default.mapbox_key) {
    console.log('Please see secret-example.js for instructions on how to add your mapbox key');
  } else if (navigator.onLine) {
    try {
      newMap = L.map('map', {
        center: [40.722216, -73.987501],
        zoom: 12,
        scrollWheelZoom: false
      });
      L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.jpg70?access_token={mapboxToken}', {
        mapboxToken: _secret.default.mapbox_key,
        maxZoom: 18,
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' + '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' + 'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        id: 'mapbox.streets'
      }).addTo(newMap);
    } catch (error) {
      console.log('Offline mode: ', error);
    }
  }

  updateRestaurants();
};
/**
 * Update page and map for current restaurants.
 */


var updateRestaurants = function updateRestaurants() {
  var cSelect = document.getElementById('cuisines-select');
  var nSelect = document.getElementById('neighborhoods-select');
  var cIndex = cSelect.selectedIndex;
  var nIndex = nSelect.selectedIndex;
  var cuisine = cSelect[cIndex].value;
  var neighborhood = nSelect[nIndex].value;

  _dbhelper.default.fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, function (error, restaurants) {
    if (error) {
      // Got an error!
      console.error('Trouble fetching restaurants by cuisine and neighborhood: ', error);
    } else {
      resetRestaurants(restaurants);
      fillRestaurantsHTML();
    }
  });
};
/**
 * Clear current restaurants, their HTML and remove their map markers.
 */


var resetRestaurants = function resetRestaurants(restaurants) {
  // Remove all restaurants
  self.restaurants = [];
  var ul = document.getElementById('restaurants-list');
  ul.innerHTML = ''; // Remove all map markers

  if (self.markers) {
    self.markers.forEach(function (marker) {
      return marker.remove();
    });
  }

  self.markers = [];
  self.restaurants = restaurants;
};
/**
 * Create all restaurants HTML and add them to the webpage.
 */


var fillRestaurantsHTML = function fillRestaurantsHTML() {
  var restaurants = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.restaurants;
  var ul = document.getElementById('restaurants-list');
  restaurants.forEach(function (restaurant) {
    ul.append(createRestaurantHTML(restaurant));
  });
  addMarkersToMap();
};
/**
 * Create restaurant HTML.
 */


var createRestaurantHTML = function createRestaurantHTML(restaurant) {
  var li = document.createElement('li');
  var image = document.createElement('img');
  image.className = 'restaurant-img';
  image.alt = "Picture of ".concat(restaurant.name);
  image.src = _dbhelper.default.imageUrlForRestaurant(restaurant);
  image.srcset = _dbhelper.default.imageSrcSetForRestaurant(restaurant);
  image.sizes = _dbhelper.default.imageSizesForRestaurant(restaurant);
  li.append(image);
  var name = document.createElement('h2');
  name.innerHTML = restaurant.name;
  li.append(name);
  var neighborhood = document.createElement('p');
  neighborhood.innerHTML = restaurant.neighborhood;
  li.append(neighborhood);
  var address = document.createElement('p');
  address.innerHTML = restaurant.address;
  li.append(address);
  var more = document.createElement('a');
  more.innerHTML = 'View Details';
  more.href = _dbhelper.default.urlForRestaurant(restaurant);
  li.append(more);
  return li;
};
/**
 * Add markers for current restaurants to the map.
 */


var addMarkersToMap = function addMarkersToMap() {
  var restaurants = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.restaurants;
  if (!newMap || !L) return;
  restaurants.forEach(function (restaurant) {
    // Add marker to the map
    var marker = _dbhelper.default.mapMarkerForRestaurant(restaurant, newMap);

    marker.on("click", onClick);

    function onClick() {
      window.location.href = marker.options.url;
    }

    self.markers.push(marker);
  });
};

},{"./dbhelper":2,"./register-sw":5,"./secret":6}],5:[function(require,module,exports){
"use strict";

//Install service worker
if (navigator.serviceWorker) {
  navigator.serviceWorker.register('/sw.js').then(function (registration) {
    // Registration was successful
    console.log('ServiceWorker registration successful with scope: ', registration.scope);
  }).catch(function (err) {
    console.log('ServiceWorker registration failed: ', err);
  });
}

navigator.serviceWorker.ready.then(function (swRegistration) {
  return swRegistration.sync.register('todo_updated');
});

},{}],6:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var SECRET =
/*#__PURE__*/
function () {
  function SECRET() {
    _classCallCheck(this, SECRET);
  }

  _createClass(SECRET, null, [{
    key: "mapbox_key",
    get: function get() {
      return 'pk.eyJ1IjoiZGVzZGVtb25odSIsImEiOiJjam1tZmZ6MXowaW5rM3FwNWl2cHNncDg0In0.KO9UTey7-Ad7N0qlP91Cgg';
    }
  }]);

  return SECRET;
}();

exports.default = SECRET;

},{}]},{},[4])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaWRiL2xpYi9pZGIuanMiLCJzcmMvanMvZGJoZWxwZXIuanMiLCJzcmMvanMvZGJwcm9taXNlLmpzIiwic3JjL2pzL21haW4uanMiLCJzcmMvanMvcmVnaXN0ZXItc3cuanMiLCJzcmMvanMvc2VjcmV0LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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QUFVLEVBQUk7QUFDaEM7QUFDQSxRQUFNLE1BQU0sR0FBRyxrQkFBUyxzQkFBVCxDQUFnQyxVQUFoQyxFQUE0QyxNQUE1QyxDQUFmOztBQUNBLElBQUEsTUFBTSxDQUFDLEVBQVAsQ0FBVSxPQUFWLEVBQW1CLE9BQW5COztBQUNBLGFBQVMsT0FBVCxHQUFtQjtBQUNqQixNQUFBLE1BQU0sQ0FBQyxRQUFQLENBQWdCLElBQWhCLEdBQXVCLE1BQU0sQ0FBQyxPQUFQLENBQWUsR0FBdEM7QUFDRDs7QUFDRCxJQUFBLElBQUksQ0FBQyxPQUFMLENBQWEsSUFBYixDQUFrQixNQUFsQjtBQUNELEdBUkQ7QUFVRCxDQVpEOzs7OztBQy9MQTtBQUNBLElBQUksU0FBUyxDQUFDLGFBQWQsRUFBNkI7QUFDdkIsRUFBQSxTQUFTLENBQUMsYUFBVixDQUF3QixRQUF4QixDQUFpQyxRQUFqQyxFQUEyQyxJQUEzQyxDQUFnRCxVQUFTLFlBQVQsRUFBdUI7QUFDckU7QUFDQSxJQUFBLE9BQU8sQ0FBQyxHQUFSLENBQVksb0RBQVosRUFBa0UsWUFBWSxDQUFDLEtBQS9FO0FBQ0QsR0FIRCxFQUdHLEtBSEgsQ0FHUyxVQUFDLEdBQUQsRUFBUztBQUN0QixJQUFBLE9BQU8sQ0FBQyxHQUFSLENBQVkscUNBQVosRUFBbUQsR0FBbkQ7QUFDRCxHQUxLO0FBTUw7O0FBRUQsU0FBUyxDQUFDLGFBQVYsQ0FBd0IsS0FBeEIsQ0FBOEIsSUFBOUIsQ0FBbUMsVUFBQSxjQUFjO0FBQUEsU0FBSSxjQUFjLENBQUMsSUFBZixDQUFvQixRQUFwQixDQUE2QixjQUE3QixDQUFKO0FBQUEsQ0FBakQ7Ozs7Ozs7Ozs7Ozs7Ozs7SUNWcUIsTTs7Ozs7Ozs7O3dCQUNNO0FBQ25CLGFBQU8sK0ZBQVA7QUFDSCIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIid1c2Ugc3RyaWN0JztcblxuKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiB0b0FycmF5KGFycikge1xuICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnIpO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJvbWlzaWZ5UmVxdWVzdChyZXF1ZXN0KSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVzb2x2ZShyZXF1ZXN0LnJlc3VsdCk7XG4gICAgICB9O1xuXG4gICAgICByZXF1ZXN0Lm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb21pc2lmeVJlcXVlc3RDYWxsKG9iaiwgbWV0aG9kLCBhcmdzKSB7XG4gICAgdmFyIHJlcXVlc3Q7XG4gICAgdmFyIHAgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIHJlcXVlc3QgPSBvYmpbbWV0aG9kXS5hcHBseShvYmosIGFyZ3MpO1xuICAgICAgcHJvbWlzaWZ5UmVxdWVzdChyZXF1ZXN0KS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgfSk7XG5cbiAgICBwLnJlcXVlc3QgPSByZXF1ZXN0O1xuICAgIHJldHVybiBwO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJvbWlzaWZ5Q3Vyc29yUmVxdWVzdENhbGwob2JqLCBtZXRob2QsIGFyZ3MpIHtcbiAgICB2YXIgcCA9IHByb21pc2lmeVJlcXVlc3RDYWxsKG9iaiwgbWV0aG9kLCBhcmdzKTtcbiAgICByZXR1cm4gcC50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICBpZiAoIXZhbHVlKSByZXR1cm47XG4gICAgICByZXR1cm4gbmV3IEN1cnNvcih2YWx1ZSwgcC5yZXF1ZXN0KTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5UHJvcGVydGllcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShQcm94eUNsYXNzLnByb3RvdHlwZSwgcHJvcCwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHJldHVybiB0aGlzW3RhcmdldFByb3BdW3Byb3BdO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgIHRoaXNbdGFyZ2V0UHJvcF1bcHJvcF0gPSB2YWw7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlSZXF1ZXN0TWV0aG9kcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBDb25zdHJ1Y3RvciwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBpZiAoIShwcm9wIGluIENvbnN0cnVjdG9yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICAgIFByb3h5Q2xhc3MucHJvdG90eXBlW3Byb3BdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBwcm9taXNpZnlSZXF1ZXN0Q2FsbCh0aGlzW3RhcmdldFByb3BdLCBwcm9wLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5TWV0aG9kcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBDb25zdHJ1Y3RvciwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBpZiAoIShwcm9wIGluIENvbnN0cnVjdG9yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICAgIFByb3h5Q2xhc3MucHJvdG90eXBlW3Byb3BdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzW3RhcmdldFByb3BdW3Byb3BdLmFwcGx5KHRoaXNbdGFyZ2V0UHJvcF0sIGFyZ3VtZW50cyk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlDdXJzb3JSZXF1ZXN0TWV0aG9kcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBDb25zdHJ1Y3RvciwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBpZiAoIShwcm9wIGluIENvbnN0cnVjdG9yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICAgIFByb3h5Q2xhc3MucHJvdG90eXBlW3Byb3BdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBwcm9taXNpZnlDdXJzb3JSZXF1ZXN0Q2FsbCh0aGlzW3RhcmdldFByb3BdLCBwcm9wLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIEluZGV4KGluZGV4KSB7XG4gICAgdGhpcy5faW5kZXggPSBpbmRleDtcbiAgfVxuXG4gIHByb3h5UHJvcGVydGllcyhJbmRleCwgJ19pbmRleCcsIFtcbiAgICAnbmFtZScsXG4gICAgJ2tleVBhdGgnLFxuICAgICdtdWx0aUVudHJ5JyxcbiAgICAndW5pcXVlJ1xuICBdKTtcblxuICBwcm94eVJlcXVlc3RNZXRob2RzKEluZGV4LCAnX2luZGV4JywgSURCSW5kZXgsIFtcbiAgICAnZ2V0JyxcbiAgICAnZ2V0S2V5JyxcbiAgICAnZ2V0QWxsJyxcbiAgICAnZ2V0QWxsS2V5cycsXG4gICAgJ2NvdW50J1xuICBdKTtcblxuICBwcm94eUN1cnNvclJlcXVlc3RNZXRob2RzKEluZGV4LCAnX2luZGV4JywgSURCSW5kZXgsIFtcbiAgICAnb3BlbkN1cnNvcicsXG4gICAgJ29wZW5LZXlDdXJzb3InXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIEN1cnNvcihjdXJzb3IsIHJlcXVlc3QpIHtcbiAgICB0aGlzLl9jdXJzb3IgPSBjdXJzb3I7XG4gICAgdGhpcy5fcmVxdWVzdCA9IHJlcXVlc3Q7XG4gIH1cblxuICBwcm94eVByb3BlcnRpZXMoQ3Vyc29yLCAnX2N1cnNvcicsIFtcbiAgICAnZGlyZWN0aW9uJyxcbiAgICAna2V5JyxcbiAgICAncHJpbWFyeUtleScsXG4gICAgJ3ZhbHVlJ1xuICBdKTtcblxuICBwcm94eVJlcXVlc3RNZXRob2RzKEN1cnNvciwgJ19jdXJzb3InLCBJREJDdXJzb3IsIFtcbiAgICAndXBkYXRlJyxcbiAgICAnZGVsZXRlJ1xuICBdKTtcblxuICAvLyBwcm94eSAnbmV4dCcgbWV0aG9kc1xuICBbJ2FkdmFuY2UnLCAnY29udGludWUnLCAnY29udGludWVQcmltYXJ5S2V5J10uZm9yRWFjaChmdW5jdGlvbihtZXRob2ROYW1lKSB7XG4gICAgaWYgKCEobWV0aG9kTmFtZSBpbiBJREJDdXJzb3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgIEN1cnNvci5wcm90b3R5cGVbbWV0aG9kTmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBjdXJzb3IgPSB0aGlzO1xuICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgY3Vyc29yLl9jdXJzb3JbbWV0aG9kTmFtZV0uYXBwbHkoY3Vyc29yLl9jdXJzb3IsIGFyZ3MpO1xuICAgICAgICByZXR1cm4gcHJvbWlzaWZ5UmVxdWVzdChjdXJzb3IuX3JlcXVlc3QpLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICBpZiAoIXZhbHVlKSByZXR1cm47XG4gICAgICAgICAgcmV0dXJuIG5ldyBDdXJzb3IodmFsdWUsIGN1cnNvci5fcmVxdWVzdCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgZnVuY3Rpb24gT2JqZWN0U3RvcmUoc3RvcmUpIHtcbiAgICB0aGlzLl9zdG9yZSA9IHN0b3JlO1xuICB9XG5cbiAgT2JqZWN0U3RvcmUucHJvdG90eXBlLmNyZWF0ZUluZGV4ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBJbmRleCh0aGlzLl9zdG9yZS5jcmVhdGVJbmRleC5hcHBseSh0aGlzLl9zdG9yZSwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgT2JqZWN0U3RvcmUucHJvdG90eXBlLmluZGV4ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBJbmRleCh0aGlzLl9zdG9yZS5pbmRleC5hcHBseSh0aGlzLl9zdG9yZSwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgW1xuICAgICduYW1lJyxcbiAgICAna2V5UGF0aCcsXG4gICAgJ2luZGV4TmFtZXMnLFxuICAgICdhdXRvSW5jcmVtZW50J1xuICBdKTtcblxuICBwcm94eVJlcXVlc3RNZXRob2RzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgSURCT2JqZWN0U3RvcmUsIFtcbiAgICAncHV0JyxcbiAgICAnYWRkJyxcbiAgICAnZGVsZXRlJyxcbiAgICAnY2xlYXInLFxuICAgICdnZXQnLFxuICAgICdnZXRBbGwnLFxuICAgICdnZXRLZXknLFxuICAgICdnZXRBbGxLZXlzJyxcbiAgICAnY291bnQnXG4gIF0pO1xuXG4gIHByb3h5Q3Vyc29yUmVxdWVzdE1ldGhvZHMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBJREJPYmplY3RTdG9yZSwgW1xuICAgICdvcGVuQ3Vyc29yJyxcbiAgICAnb3BlbktleUN1cnNvcidcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgSURCT2JqZWN0U3RvcmUsIFtcbiAgICAnZGVsZXRlSW5kZXgnXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIFRyYW5zYWN0aW9uKGlkYlRyYW5zYWN0aW9uKSB7XG4gICAgdGhpcy5fdHggPSBpZGJUcmFuc2FjdGlvbjtcbiAgICB0aGlzLmNvbXBsZXRlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICBpZGJUcmFuc2FjdGlvbi5vbmNvbXBsZXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgIH07XG4gICAgICBpZGJUcmFuc2FjdGlvbi5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlamVjdChpZGJUcmFuc2FjdGlvbi5lcnJvcik7XG4gICAgICB9O1xuICAgICAgaWRiVHJhbnNhY3Rpb24ub25hYm9ydCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZWplY3QoaWRiVHJhbnNhY3Rpb24uZXJyb3IpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIFRyYW5zYWN0aW9uLnByb3RvdHlwZS5vYmplY3RTdG9yZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgT2JqZWN0U3RvcmUodGhpcy5fdHgub2JqZWN0U3RvcmUuYXBwbHkodGhpcy5fdHgsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhUcmFuc2FjdGlvbiwgJ190eCcsIFtcbiAgICAnb2JqZWN0U3RvcmVOYW1lcycsXG4gICAgJ21vZGUnXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhUcmFuc2FjdGlvbiwgJ190eCcsIElEQlRyYW5zYWN0aW9uLCBbXG4gICAgJ2Fib3J0J1xuICBdKTtcblxuICBmdW5jdGlvbiBVcGdyYWRlREIoZGIsIG9sZFZlcnNpb24sIHRyYW5zYWN0aW9uKSB7XG4gICAgdGhpcy5fZGIgPSBkYjtcbiAgICB0aGlzLm9sZFZlcnNpb24gPSBvbGRWZXJzaW9uO1xuICAgIHRoaXMudHJhbnNhY3Rpb24gPSBuZXcgVHJhbnNhY3Rpb24odHJhbnNhY3Rpb24pO1xuICB9XG5cbiAgVXBncmFkZURCLnByb3RvdHlwZS5jcmVhdGVPYmplY3RTdG9yZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgT2JqZWN0U3RvcmUodGhpcy5fZGIuY3JlYXRlT2JqZWN0U3RvcmUuYXBwbHkodGhpcy5fZGIsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhVcGdyYWRlREIsICdfZGInLCBbXG4gICAgJ25hbWUnLFxuICAgICd2ZXJzaW9uJyxcbiAgICAnb2JqZWN0U3RvcmVOYW1lcydcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKFVwZ3JhZGVEQiwgJ19kYicsIElEQkRhdGFiYXNlLCBbXG4gICAgJ2RlbGV0ZU9iamVjdFN0b3JlJyxcbiAgICAnY2xvc2UnXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIERCKGRiKSB7XG4gICAgdGhpcy5fZGIgPSBkYjtcbiAgfVxuXG4gIERCLnByb3RvdHlwZS50cmFuc2FjdGlvbiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgVHJhbnNhY3Rpb24odGhpcy5fZGIudHJhbnNhY3Rpb24uYXBwbHkodGhpcy5fZGIsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhEQiwgJ19kYicsIFtcbiAgICAnbmFtZScsXG4gICAgJ3ZlcnNpb24nLFxuICAgICdvYmplY3RTdG9yZU5hbWVzJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoREIsICdfZGInLCBJREJEYXRhYmFzZSwgW1xuICAgICdjbG9zZSdcbiAgXSk7XG5cbiAgLy8gQWRkIGN1cnNvciBpdGVyYXRvcnNcbiAgLy8gVE9ETzogcmVtb3ZlIHRoaXMgb25jZSBicm93c2VycyBkbyB0aGUgcmlnaHQgdGhpbmcgd2l0aCBwcm9taXNlc1xuICBbJ29wZW5DdXJzb3InLCAnb3BlbktleUN1cnNvciddLmZvckVhY2goZnVuY3Rpb24oZnVuY05hbWUpIHtcbiAgICBbT2JqZWN0U3RvcmUsIEluZGV4XS5mb3JFYWNoKGZ1bmN0aW9uKENvbnN0cnVjdG9yKSB7XG4gICAgICAvLyBEb24ndCBjcmVhdGUgaXRlcmF0ZUtleUN1cnNvciBpZiBvcGVuS2V5Q3Vyc29yIGRvZXNuJ3QgZXhpc3QuXG4gICAgICBpZiAoIShmdW5jTmFtZSBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG5cbiAgICAgIENvbnN0cnVjdG9yLnByb3RvdHlwZVtmdW5jTmFtZS5yZXBsYWNlKCdvcGVuJywgJ2l0ZXJhdGUnKV0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSB0b0FycmF5KGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3NbYXJncy5sZW5ndGggLSAxXTtcbiAgICAgICAgdmFyIG5hdGl2ZU9iamVjdCA9IHRoaXMuX3N0b3JlIHx8IHRoaXMuX2luZGV4O1xuICAgICAgICB2YXIgcmVxdWVzdCA9IG5hdGl2ZU9iamVjdFtmdW5jTmFtZV0uYXBwbHkobmF0aXZlT2JqZWN0LCBhcmdzLnNsaWNlKDAsIC0xKSk7XG4gICAgICAgIHJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgY2FsbGJhY2socmVxdWVzdC5yZXN1bHQpO1xuICAgICAgICB9O1xuICAgICAgfTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gcG9seWZpbGwgZ2V0QWxsXG4gIFtJbmRleCwgT2JqZWN0U3RvcmVdLmZvckVhY2goZnVuY3Rpb24oQ29uc3RydWN0b3IpIHtcbiAgICBpZiAoQ29uc3RydWN0b3IucHJvdG90eXBlLmdldEFsbCkgcmV0dXJuO1xuICAgIENvbnN0cnVjdG9yLnByb3RvdHlwZS5nZXRBbGwgPSBmdW5jdGlvbihxdWVyeSwgY291bnQpIHtcbiAgICAgIHZhciBpbnN0YW5jZSA9IHRoaXM7XG4gICAgICB2YXIgaXRlbXMgPSBbXTtcblxuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUpIHtcbiAgICAgICAgaW5zdGFuY2UuaXRlcmF0ZUN1cnNvcihxdWVyeSwgZnVuY3Rpb24oY3Vyc29yKSB7XG4gICAgICAgICAgaWYgKCFjdXJzb3IpIHtcbiAgICAgICAgICAgIHJlc29sdmUoaXRlbXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpdGVtcy5wdXNoKGN1cnNvci52YWx1ZSk7XG5cbiAgICAgICAgICBpZiAoY291bnQgIT09IHVuZGVmaW5lZCAmJiBpdGVtcy5sZW5ndGggPT0gY291bnQpIHtcbiAgICAgICAgICAgIHJlc29sdmUoaXRlbXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjdXJzb3IuY29udGludWUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9O1xuICB9KTtcblxuICB2YXIgZXhwID0ge1xuICAgIG9wZW46IGZ1bmN0aW9uKG5hbWUsIHZlcnNpb24sIHVwZ3JhZGVDYWxsYmFjaykge1xuICAgICAgdmFyIHAgPSBwcm9taXNpZnlSZXF1ZXN0Q2FsbChpbmRleGVkREIsICdvcGVuJywgW25hbWUsIHZlcnNpb25dKTtcbiAgICAgIHZhciByZXF1ZXN0ID0gcC5yZXF1ZXN0O1xuXG4gICAgICBpZiAocmVxdWVzdCkge1xuICAgICAgICByZXF1ZXN0Lm9udXBncmFkZW5lZWRlZCA9IGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgaWYgKHVwZ3JhZGVDYWxsYmFjaykge1xuICAgICAgICAgICAgdXBncmFkZUNhbGxiYWNrKG5ldyBVcGdyYWRlREIocmVxdWVzdC5yZXN1bHQsIGV2ZW50Lm9sZFZlcnNpb24sIHJlcXVlc3QudHJhbnNhY3Rpb24pKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwLnRoZW4oZnVuY3Rpb24oZGIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEQihkYik7XG4gICAgICB9KTtcbiAgICB9LFxuICAgIGRlbGV0ZTogZnVuY3Rpb24obmFtZSkge1xuICAgICAgcmV0dXJuIHByb21pc2lmeVJlcXVlc3RDYWxsKGluZGV4ZWREQiwgJ2RlbGV0ZURhdGFiYXNlJywgW25hbWVdKTtcbiAgICB9XG4gIH07XG5cbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBleHA7XG4gICAgbW9kdWxlLmV4cG9ydHMuZGVmYXVsdCA9IG1vZHVsZS5leHBvcnRzO1xuICB9XG4gIGVsc2Uge1xuICAgIHNlbGYuaWRiID0gZXhwO1xuICB9XG59KCkpO1xuIiwiaW1wb3J0IGRiUHJvbWlzZSBmcm9tICcuL2RicHJvbWlzZSc7XHJcbi8qKlxyXG4gKiBDb21tb24gZGF0YWJhc2UgaGVscGVyIGZ1bmN0aW9ucy5cclxuICovXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERCSGVscGVyIHtcclxuXHJcbiAgLyoqXHJcbiAgICogRGF0YWJhc2UgVVJMLlxyXG4gICAqIENoYW5nZSB0aGlzIHRvIHJlc3RhdXJhbnRzLmpzb24gZmlsZSBsb2NhdGlvbiBvbiB5b3VyIHNlcnZlci5cclxuICAgKi9cclxuICBzdGF0aWMgZ2V0IERBVEFCQVNFX1VSTCgpIHtcclxuICAgIGNvbnN0IHBvcnQgPSA4MDAwIC8vIENoYW5nZSB0aGlzIHRvIHlvdXIgc2VydmVyIHBvcnRcclxuICAgIHJldHVybiBgaHR0cDovL2xvY2FsaG9zdDoke3BvcnR9L2RhdGEvcmVzdGF1cmFudHMuanNvbmA7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgZ2V0IEFQSV9VUkwoKXtcclxuICAgIGNvbnN0IHBvcnQgPSAxMzM3O1xyXG4gICAgcmV0dXJuIGBodHRwOi8vbG9jYWxob3N0OiR7cG9ydH1gXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCBhbGwgcmVzdGF1cmFudHMuXHJcbiAgICovXHJcbiAgLy8gc3RhdGljIGZldGNoUmVzdGF1cmFudHMoY2FsbGJhY2spIHtcclxuICAvLyAgIGxldCB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcclxuICAvLyAgIHhoci5vcGVuKCdHRVQnLCBgJHtEQkhlbHBlci5BUElfVVJMfS9yZXN0YXVyYW50c2ApO1xyXG4gIC8vICAgeGhyLm9ubG9hZCA9ICgpID0+IHtcclxuICAvLyAgICAgaWYgKHhoci5zdGF0dXMgPT09IDIwMCkgeyAvLyBHb3QgYSBzdWNjZXNzIHJlc3BvbnNlIGZyb20gc2VydmVyIVxyXG4gIC8vICAgICAgIGNvbnN0IHJlc3RhdXJhbnRzID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KTtcclxuICAvLyAgICAgICBkYlByb21pc2UucHV0UmVzdGF1cmFudHMocmVzdGF1cmFudHMpO1xyXG4gIC8vICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnRzKTtcclxuICAvLyAgICAgfSBlbHNlIHtcclxuICAvLyAgICAgICAgZGJQcm9taXNlLmdldFJlc3RhdXJhbnRzKCkudGhlbihyZXN0YXVyYW50cyA9PntcclxuICAvLyAgICAgICAgIGlmKHJlc3RhdXJhbnRzLmxlbmd0aCA+IDApe1xyXG4gIC8vICAgICAgICAgICBjYWxsYmFjayhudWxsLCByZXN0YXVyYW50cyk7XHJcbiAgLy8gICAgICAgICB9IGVsc2Uge1xyXG4gIC8vICAgICAgICAgICBjb25zdCBlcnJvciA9IChgUmVxdWVzdCBmYWlsZWQuIFJldHVybmVkIHN0YXR1cyBvZiAke3hoci5zdGF0dXN9YCk7XHJcbiAgLy8gICAgICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAvLyAgICAgICAgIH1cclxuICAvLyAgICAgICB9KTsgXHJcbiAgLy8gICAgIH1cclxuICAvLyAgIH07XHJcbiAgLy8gICB4aHIuc2VuZCgpO1xyXG4gIC8vIH1cclxuICBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50cyhjYWxsYmFjayl7XHJcbiAgICBmZXRjaChgJHtEQkhlbHBlci5BUElfVVJMfS9yZXN0YXVyYW50c2ApLnRoZW4oKHJlc3BvbnNlKT0+IHtcclxuICAgICAgICBjb25zdCByID0gcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgIHIudGhlbigocmVzdGF1cmFudHMpID0+IHtcclxuICAgICAgICAgIGRiUHJvbWlzZS5wdXRSZXN0YXVyYW50cyhyZXN0YXVyYW50cyk7XHJcbiAgICAgICAgICBjYWxsYmFjayhudWxsLCByZXN0YXVyYW50cyk7XHJcbiAgICAgICAgfSlcclxuICAgIH0pLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICBkYlByb21pc2UuZ2V0UmVzdGF1cmFudHMoKS50aGVuKChyZXN0YXVyYW50cyk9PntcclxuICAgICAgICBpZihyZXN0YXVyYW50cy5sZW5ndGggPiAwKXtcclxuICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnRzKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gJ1VuYWJsZSB0byBnZXQgcmVzdGF1cmFudHMgZnJvbSBJbmRleERCOiAnXHJcbiAgICAgICAgICBjYWxsYmFjayhlcnJvck1lc3NhZ2UsIGVycm9yLCBudWxsKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pXHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggYSByZXN0YXVyYW50IGJ5IGl0cyBJRC5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50QnlJZChpZCwgY2FsbGJhY2spIHtcclxuICAgIGZldGNoKGAke0RCSGVscGVyLkFQSV9VUkx9L3Jlc3RhdXJhbnRzLyR7aWR9YCkudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHJldHVybiBQcm9taXNlLnJlamVjdChcIlJlc3RhdXJhbnQgY291bGRuJ3QgYmUgZmV0Y2hlZCBmcm9tIG5ldHdvcmtcIik7XHJcbiAgICAgIHJldHVybiByZXNwb25zZS5qc29uKCk7XHJcbiAgICB9KVxyXG4gICAgLnRoZW4oKHJlc3RhdXJhbnQpPT4ge1xyXG4gICAgICBkYlByb21pc2UucHV0UmVzdGF1cmFudHMocmVzdGF1cmFudClcclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnQpO1xyXG4gICAgfSkuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGlkLCBlcnJvcik7XHJcbiAgICAgIGRiUHJvbWlzZS5nZXRSZXN0YXVyYW50cyhpZCkudGhlbigocmVzdGF1cmFudCk9PntcclxuICAgICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgZmV0Y2hSZXZpZXdzQnlSZXN0YXVyYW50KGlkLCBjYWxsYmFjayl7XHJcbiAgICBmZXRjaChgJHtEQkhlbHBlci5BUElfVVJMfS9yZXZpZXdzLz9yZXN0YXVyYW50X2lkPSR7aWR9YCkudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHJldHVybiBQcm9taXNlLnJlamVjdChcIlJlc3RhdXJhbnQgUmV2aWV3cyBjb3VsZG4ndCBiZSBmZXRjaGVkIGZyb20gbmV0d29ya1wiKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxuICAgIH0pLnRoZW4oKHJldmlld3MpPT4ge1xyXG4gICAgICBkYlByb21pc2UuZ2V0UmV2aWV3cyhpZCkudGhlbigoZGJSZXZpZXdzKT0+e1xyXG4gICAgICAgIGlmKHJldmlld3MubGVuZ3RoID49IGRiUmV2aWV3cy5sZW5ndGgpe1xyXG4gICAgICAgICAgZGJQcm9taXNlLnB1dFJldmlld3MoaWQsIHJldmlld3MpLnRoZW4oKCkgPT57XHJcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhudWxsLCByZXZpZXdzKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfWVsc2Uge1xyXG4gICAgICAgICAgZGJQcm9taXNlLmdldFJldmlld3MoaWQpLnRoZW4oKHJldmlld3MpPT57XHJcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhudWxsLCByZXZpZXdzKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgIH0pLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICBjb25zb2xlLmxvZyhlcnJvcik7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIHJlc3RhdXJhbnRzIGJ5IGEgY3Vpc2luZSB0eXBlIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaFJlc3RhdXJhbnRCeUN1aXNpbmUoY3Vpc2luZSwgY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50cyAgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmdcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRmlsdGVyIHJlc3RhdXJhbnRzIHRvIGhhdmUgb25seSBnaXZlbiBjdWlzaW5lIHR5cGVcclxuICAgICAgICBjb25zdCByZXN1bHRzID0gcmVzdGF1cmFudHMuZmlsdGVyKHIgPT4gci5jdWlzaW5lX3R5cGUgPT0gY3Vpc2luZSk7XHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0cyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggcmVzdGF1cmFudHMgYnkgYSBuZWlnaGJvcmhvb2Qgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudEJ5TmVpZ2hib3Job29kKG5laWdoYm9yaG9vZCwgY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50c1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBGaWx0ZXIgcmVzdGF1cmFudHMgdG8gaGF2ZSBvbmx5IGdpdmVuIG5laWdoYm9yaG9vZFxyXG4gICAgICAgIGNvbnN0IHJlc3VsdHMgPSByZXN0YXVyYW50cy5maWx0ZXIociA9PiByLm5laWdoYm9yaG9vZCA9PSBuZWlnaGJvcmhvb2QpO1xyXG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdHMpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIHJlc3RhdXJhbnRzIGJ5IGEgY3Vpc2luZSBhbmQgYSBuZWlnaGJvcmhvb2Qgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudEJ5Q3Vpc2luZUFuZE5laWdoYm9yaG9vZChjdWlzaW5lLCBuZWlnaGJvcmhvb2QsIGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbGV0IHJlc3VsdHMgPSByZXN0YXVyYW50c1xyXG4gICAgICAgIGlmIChjdWlzaW5lICE9ICdhbGwnKSB7IC8vIGZpbHRlciBieSBjdWlzaW5lXHJcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIociA9PiByLmN1aXNpbmVfdHlwZSA9PSBjdWlzaW5lKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKG5laWdoYm9yaG9vZCAhPSAnYWxsJykgeyAvLyBmaWx0ZXIgYnkgbmVpZ2hib3Job29kXHJcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIociA9PiByLm5laWdoYm9yaG9vZCA9PSBuZWlnaGJvcmhvb2QpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYWxsYmFjayhudWxsLCByZXN1bHRzKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCBhbGwgbmVpZ2hib3Job29kcyB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZy5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hOZWlnaGJvcmhvb2RzKGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gR2V0IGFsbCBuZWlnaGJvcmhvb2RzIGZyb20gYWxsIHJlc3RhdXJhbnRzXHJcbiAgICAgICAgY29uc3QgbmVpZ2hib3Job29kcyA9IHJlc3RhdXJhbnRzLm1hcCgodiwgaSkgPT4gcmVzdGF1cmFudHNbaV0ubmVpZ2hib3Job29kKVxyXG4gICAgICAgIC8vIFJlbW92ZSBkdXBsaWNhdGVzIGZyb20gbmVpZ2hib3Job29kc1xyXG4gICAgICAgIGNvbnN0IHVuaXF1ZU5laWdoYm9yaG9vZHMgPSBuZWlnaGJvcmhvb2RzLmZpbHRlcigodiwgaSkgPT4gbmVpZ2hib3Job29kcy5pbmRleE9mKHYpID09IGkpXHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgdW5pcXVlTmVpZ2hib3Job29kcyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggYWxsIGN1aXNpbmVzIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaEN1aXNpbmVzKGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gR2V0IGFsbCBjdWlzaW5lcyBmcm9tIGFsbCByZXN0YXVyYW50c1xyXG4gICAgICAgIGNvbnN0IGN1aXNpbmVzID0gcmVzdGF1cmFudHMubWFwKCh2LCBpKSA9PiByZXN0YXVyYW50c1tpXS5jdWlzaW5lX3R5cGUpXHJcbiAgICAgICAgLy8gUmVtb3ZlIGR1cGxpY2F0ZXMgZnJvbSBjdWlzaW5lc1xyXG4gICAgICAgIGNvbnN0IHVuaXF1ZUN1aXNpbmVzID0gY3Vpc2luZXMuZmlsdGVyKCh2LCBpKSA9PiBjdWlzaW5lcy5pbmRleE9mKHYpID09IGkpXHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgdW5pcXVlQ3Vpc2luZXMpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJlc3RhdXJhbnQgcGFnZSBVUkwuXHJcbiAgICovXHJcbiAgc3RhdGljIHVybEZvclJlc3RhdXJhbnQocmVzdGF1cmFudCkge1xyXG4gICAgcmV0dXJuIChgLi9yZXN0YXVyYW50Lmh0bWw/aWQ9JHtyZXN0YXVyYW50LmlkfWApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVzdGF1cmFudCBpbWFnZSBVUkwuXHJcbiAgICovXHJcbiAgc3RhdGljIGltYWdlVXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KSB7XHJcbiAgICByZXR1cm4gKGAvaW1nLyR7cmVzdGF1cmFudC5waG90b2dyYXBoIHx8IHJlc3RhdXJhbnQuaWR9LW1lZGl1bS5qcGdgKTtcclxuICB9XHJcblxyXG4gIHN0YXRpYyBpbWFnZVNyY1NldEZvclJlc3RhdXJhbnQocmVzdGF1cmFudCl7XHJcbiAgICBjb25zdCBpbWdTcmMgPSBgL2ltZy8ke3Jlc3RhdXJhbnQucGhvdG9ncmFwaCB8fCByZXN0YXVyYW50LmlkfWA7XHJcbiAgICByZXR1cm4gYCR7aW1nU3JjfS1zbWFsbC5qcGcgMzAwdyxcclxuICAgICAgICAgICAgJHtpbWdTcmN9LW1lZGl1bS5qcGcgNjAwdyxcclxuICAgICAgICAgICAgJHtpbWdTcmN9LWxhcmdlLmpwZyA4MDB3YFxyXG4gIH1cclxuXHJcbiAgc3RhdGljIGltYWdlU2l6ZXNGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpIHtcclxuICAgIHJldHVybiBgKG1heC13aWR0aDogMzYwcHgpIDI4MHB4LFxyXG4gICAgICAgICAgICAobWF4LXdpZHRoOiA2MDBweCkgNjAwcHgsXHJcbiAgICAgICAgICAgIDQwMHB4YDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIE1hcCBtYXJrZXIgZm9yIGEgcmVzdGF1cmFudC5cclxuICAgKi9cclxuICAgc3RhdGljIG1hcE1hcmtlckZvclJlc3RhdXJhbnQocmVzdGF1cmFudCwgbWFwKSB7XHJcbiAgICAvLyBodHRwczovL2xlYWZsZXRqcy5jb20vcmVmZXJlbmNlLTEuMy4wLmh0bWwjbWFya2VyICBcclxuICAgIGNvbnN0IG1hcmtlciA9IG5ldyBMLm1hcmtlcihbcmVzdGF1cmFudC5sYXRsbmcubGF0LCByZXN0YXVyYW50LmxhdGxuZy5sbmddLFxyXG4gICAgICB7dGl0bGU6IHJlc3RhdXJhbnQubmFtZSxcclxuICAgICAgYWx0OiByZXN0YXVyYW50Lm5hbWUsXHJcbiAgICAgIHVybDogREJIZWxwZXIudXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KVxyXG4gICAgICB9KVxyXG4gICAgICBtYXJrZXIuYWRkVG8obWFwKTtcclxuICAgIHJldHVybiBtYXJrZXI7XHJcbiAgfSBcclxuICAvKiBzdGF0aWMgbWFwTWFya2VyRm9yUmVzdGF1cmFudChyZXN0YXVyYW50LCBtYXApIHtcclxuICAgIGNvbnN0IG1hcmtlciA9IG5ldyBnb29nbGUubWFwcy5NYXJrZXIoe1xyXG4gICAgICBwb3NpdGlvbjogcmVzdGF1cmFudC5sYXRsbmcsXHJcbiAgICAgIHRpdGxlOiByZXN0YXVyYW50Lm5hbWUsXHJcbiAgICAgIHVybDogREJIZWxwZXIudXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KSxcclxuICAgICAgbWFwOiBtYXAsXHJcbiAgICAgIGFuaW1hdGlvbjogZ29vZ2xlLm1hcHMuQW5pbWF0aW9uLkRST1B9XHJcbiAgICApO1xyXG4gICAgcmV0dXJuIG1hcmtlcjtcclxuICB9ICovXHJcblxyXG4gIHN0YXRpYyBzdWJtaXRSZXZpZXdCeVJlc3RhdXJhbnQocmV2aWV3KSB7XHJcbiAgICBmZXRjaChgJHtEQkhlbHBlci5BUElfVVJMfS9yZXZpZXdzYCwge1xyXG4gICAgICBtZXRob2Q6J1BPU1QnLFxyXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgXCJyZXN0YXVyYW50X2lkXCI6IHJldmlldy5yZXN0YXVyYW50X2lkLFxyXG4gICAgICAgIFwibmFtZVwiOiByZXZpZXcubmFtZSxcclxuICAgICAgICBcInJhdGluZ1wiOiByZXZpZXcucmF0aW5nLFxyXG4gICAgICAgIFwiY29tbWVudHNcIjogcmV2aWV3LmNvbW1lbnRzXHJcbiAgICB9KVxyXG4gICAgfSkudGhlbigocmVzcG9uc2UpID0+IHtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gICAgfSkuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgIGRiUHJvbWlzZS5nZXRSZXZpZXdzKHJldmlldy5yZXN0YXVyYW50X2lkKS50aGVuKChyZXZpZXdzKT0+e1xyXG4gICAgICAgIGxldCBhbGxSZXZpZXdzID0gcmV2aWV3cy5jb25jYXQocmV2aWV3KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhhbGxSZXZpZXdzKTtcclxuICAgICAgICBcclxuICAgICAgICBkYlByb21pc2UucHV0UmV2aWV3cyhyZXZpZXcucmVzdGF1cmFudF9pZCwgYWxsUmV2aWV3cyk7XHJcbiAgICAgIH0pXHJcbiAgICB9KSBcclxuICB9XHJcblxyXG4gIHN0YXRpYyB1cGRhdGVEYXRhYmFzZSgpe1xyXG4gICAgZGJQcm9taXNlLmdldFJlc3RhdXJhbnRzKCkudGhlbigocmVzdGF1cmFudHMpPT4ge1xyXG4gICAgICByZXN0YXVyYW50cy5mb3JFYWNoKHJlc3RhdXJhbnQgPT4ge1xyXG4gICAgICAgIGlmKHJlc3RhdXJhbnQucmV2aWV3cyl7XHJcbiAgICAgICAgICByZXN0YXVyYW50LnJldmlld3MuZm9yRWFjaCgocmV2aWV3KSA9PiB7XHJcbiAgICAgICAgICAgIGlmKCFyZXZpZXcuaWQpe1xyXG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdpbiB1cGRhdGVEYXRhYmFzZTogJyxyZXZpZXcpO1xyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIHRoaXMuc3VibWl0UmV2aWV3QnlSZXN0YXVyYW50KHJldmlldyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH0pXHJcbiAgfVxyXG5cclxufSIsImltcG9ydCBJREIgZnJvbSAnaWRiJztcclxuXHJcbmNvbnN0IGRiUHJvbWlzZSA9IHtcclxuICAgIGRiIDogSURCLm9wZW4oJ3Jlc3RhdXJhbnQtcmV2aWV3cy1kYicsIDIsICh1cGdyYWRlREIpID0+e1xyXG4gICAgICAgIHN3aXRjaCh1cGdyYWRlREIub2xkVmVyc2lvbil7XHJcbiAgICAgICAgICAgIGNhc2UgMDpcclxuICAgICAgICAgICAgICAgIHVwZ3JhZGVEQi5jcmVhdGVPYmplY3RTdG9yZSgncmVzdGF1cmFudHMnLCB7a2V5UGF0aDogJ2lkJ30pXHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH0pLFxyXG4gICAgcHV0UmVzdGF1cmFudHMocmVzdGF1cmFudHMpIHtcclxuICAgICAgICAvL2lmICghcmVzdGF1cmFudHMucHVzaCl7IHJlc3RhdXJhbnRzID0gW3Jlc3RhdXJhbnRzXX07XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGIudGhlbihkYiA9PiB7XHJcbiAgICAgICAgY29uc3Qgc3RvcmUgPSBkYi50cmFuc2FjdGlvbigncmVzdGF1cmFudHMnLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoJ3Jlc3RhdXJhbnRzJyk7XHJcbiAgICAgICAgUHJvbWlzZS5hbGwocmVzdGF1cmFudHMubWFwKG5ldHdvcmtSZXN0YXVyYW50ID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHN0b3JlLmdldChuZXR3b3JrUmVzdGF1cmFudC5pZCkudGhlbihpZGJSZXN0YXVyYW50ID0+IHtcclxuICAgICAgICAgICAgaWYgKCFpZGJSZXN0YXVyYW50IHx8IG5ldHdvcmtSZXN0YXVyYW50LnVwZGF0ZWRBdCA+IGlkYlJlc3RhdXJhbnQudXBkYXRlZEF0KSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RvcmUucHV0KG5ldHdvcmtSZXN0YXVyYW50KTsgIFxyXG4gICAgICAgICAgICB9IFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KSkudGhlbihmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBzdG9yZS5jb21wbGV0ZTtcclxuICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH0sXHJcbiAgICBwdXRSZXZpZXdzKGlkLCByZXZpZXdzKXtcclxuICAgICAgICBpZihpZCl7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmRiLnRoZW4oZGIgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc3RvcmUgPSBkYi50cmFuc2FjdGlvbigncmVzdGF1cmFudHMnLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoJ3Jlc3RhdXJhbnRzJylcclxuICAgICAgICAgICAgICAgIHJldHVybiBzdG9yZS5nZXQoTnVtYmVyKGlkKSkudGhlbigocmVzdGF1cmFudCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3RhdXJhbnQucmV2aWV3cyA9IHJldmlld3M7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN0b3JlLnB1dChyZXN0YXVyYW50KTtcclxuICAgICAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN0b3JlLmNvbXBsZXRlO1xyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG4gICAgZ2V0UmVzdGF1cmFudHMoaWQgPSB1bmRlZmluZWQpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kYi50aGVuKGRiID0+IHtcclxuICAgICAgICAgIGNvbnN0IHN0b3JlID0gZGIudHJhbnNhY3Rpb24oJ3Jlc3RhdXJhbnRzJywgJ3JlYWRvbmx5Jykub2JqZWN0U3RvcmUoJ3Jlc3RhdXJhbnRzJyk7XHJcbiAgICAgICAgICBpZiAoaWQpIHJldHVybiBzdG9yZS5nZXQoTnVtYmVyKGlkKSk7XHJcbiAgICAgICAgICByZXR1cm4gc3RvcmUuZ2V0QWxsKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0sXHJcbiAgICBnZXRSZXZpZXdzKGlkID0gdW5kZWZpbmVkKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5kYi50aGVuKChkYikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBzdG9yZSA9IGRiLnRyYW5zYWN0aW9uKCdyZXN0YXVyYW50cycsICdyZWFkb25seScpLm9iamVjdFN0b3JlKCdyZXN0YXVyYW50cycpO1xyXG4gICAgICAgICAgICBpZihpZCkgcmV0dXJuIHN0b3JlLmdldChOdW1iZXIoaWQpKS50aGVuKHJlc3RhdXJhbnQgPT4ge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3RhdXJhbnQucmV2aWV3c1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9KVxyXG4gICAgfSxcclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRiUHJvbWlzZTsiLCJpbXBvcnQgREJIZWxwZXIgZnJvbSAnLi9kYmhlbHBlcic7XHJcbmltcG9ydCBTRUNSRVQgZnJvbSAnLi9zZWNyZXQnO1xyXG5pbXBvcnQgJy4vcmVnaXN0ZXItc3cnO1xyXG5cclxubGV0IHJlc3RhdXJhbnRzLFxyXG4gIG5laWdoYm9yaG9vZHMsXHJcbiAgY3Vpc2luZXNcclxudmFyIG5ld01hcFxyXG52YXIgbWFya2VycyA9IFtdXHJcblxyXG4vKipcclxuICogRmV0Y2ggbmVpZ2hib3Job29kcyBhbmQgY3Vpc2luZXMgYXMgc29vbiBhcyB0aGUgcGFnZSBpcyBsb2FkZWQuXHJcbiAqL1xyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKGV2ZW50KSA9PiB7XHJcbiAgaW5pdE1hcCgpOyAvLyBhZGRlZCBcclxuICBmZXRjaE5laWdoYm9yaG9vZHMoKTtcclxuICBmZXRjaEN1aXNpbmVzKCk7XHJcbn0pO1xyXG5cclxuLyoqXHJcbiAqIEZldGNoIGFsbCBuZWlnaGJvcmhvb2RzIGFuZCBzZXQgdGhlaXIgSFRNTC5cclxuICovXHJcbmNvbnN0IGZldGNoTmVpZ2hib3Job29kcyA9ICgpID0+IHtcclxuICBEQkhlbHBlci5mZXRjaE5laWdoYm9yaG9vZHMoKGVycm9yLCBuZWlnaGJvcmhvb2RzKSA9PiB7XHJcbiAgICBpZiAoZXJyb3IpIHsgLy8gR290IGFuIGVycm9yXHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgc2VsZi5uZWlnaGJvcmhvb2RzID0gbmVpZ2hib3Job29kcztcclxuICAgICAgZmlsbE5laWdoYm9yaG9vZHNIVE1MKCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTZXQgbmVpZ2hib3Job29kcyBIVE1MLlxyXG4gKi9cclxuY29uc3QgZmlsbE5laWdoYm9yaG9vZHNIVE1MID0gKG5laWdoYm9yaG9vZHMgPSBzZWxmLm5laWdoYm9yaG9vZHMpID0+IHtcclxuICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmVpZ2hib3Job29kcy1zZWxlY3QnKTtcclxuICBuZWlnaGJvcmhvb2RzLmZvckVhY2gobmVpZ2hib3Job29kID0+IHtcclxuICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xyXG4gICAgb3B0aW9uLmlubmVySFRNTCA9IG5laWdoYm9yaG9vZDtcclxuICAgIG9wdGlvbi52YWx1ZSA9IG5laWdoYm9yaG9vZDtcclxuICAgIHNlbGVjdC5hcHBlbmQob3B0aW9uKTtcclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEZldGNoIGFsbCBjdWlzaW5lcyBhbmQgc2V0IHRoZWlyIEhUTUwuXHJcbiAqL1xyXG5jb25zdCBmZXRjaEN1aXNpbmVzID0gKCkgPT4ge1xyXG4gIERCSGVscGVyLmZldGNoQ3Vpc2luZXMoKGVycm9yLCBjdWlzaW5lcykgPT4ge1xyXG4gICAgaWYgKGVycm9yKSB7IC8vIEdvdCBhbiBlcnJvciFcclxuICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBzZWxmLmN1aXNpbmVzID0gY3Vpc2luZXM7XHJcbiAgICAgIGZpbGxDdWlzaW5lc0hUTUwoKTtcclxuICAgIH1cclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFNldCBjdWlzaW5lcyBIVE1MLlxyXG4gKi9cclxuY29uc3QgZmlsbEN1aXNpbmVzSFRNTCA9IChjdWlzaW5lcyA9IHNlbGYuY3Vpc2luZXMpID0+IHtcclxuICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3Vpc2luZXMtc2VsZWN0Jyk7XHJcblxyXG4gIGN1aXNpbmVzLmZvckVhY2goY3Vpc2luZSA9PiB7XHJcbiAgICBjb25zdCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcclxuICAgIG9wdGlvbi5pbm5lckhUTUwgPSBjdWlzaW5lO1xyXG4gICAgb3B0aW9uLnZhbHVlID0gY3Vpc2luZTtcclxuICAgIHNlbGVjdC5hcHBlbmQob3B0aW9uKTtcclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEluaXRpYWxpemUgbGVhZmxldCBtYXAsIGNhbGxlZCBmcm9tIEhUTUwuXHJcbiAqL1xyXG5jb25zdCBpbml0TWFwID0gKCkgPT4ge1xyXG4gIGlmICghU0VDUkVULm1hcGJveF9rZXkpe1xyXG4gICAgY29uc29sZS5sb2coJ1BsZWFzZSBzZWUgc2VjcmV0LWV4YW1wbGUuanMgZm9yIGluc3RydWN0aW9ucyBvbiBob3cgdG8gYWRkIHlvdXIgbWFwYm94IGtleScpO1xyXG4gIH0gZWxzZSBpZiAobmF2aWdhdG9yLm9uTGluZSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgbmV3TWFwID0gTC5tYXAoJ21hcCcsIHtcclxuICAgICAgICBjZW50ZXI6IFs0MC43MjIyMTYsIC03My45ODc1MDFdLFxyXG4gICAgICAgIHpvb206IDEyLFxyXG4gICAgICAgIHNjcm9sbFdoZWVsWm9vbTogZmFsc2VcclxuICAgICAgfSk7XHJcbiAgTC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5qcGc3MD9hY2Nlc3NfdG9rZW49e21hcGJveFRva2VufScsIHtcclxuICAgIG1hcGJveFRva2VuOiBTRUNSRVQubWFwYm94X2tleSxcclxuICAgIG1heFpvb206IDE4LFxyXG4gICAgYXR0cmlidXRpb246ICdNYXAgZGF0YSAmY29weTsgPGEgaHJlZj1cImh0dHBzOi8vd3d3Lm9wZW5zdHJlZXRtYXAub3JnL1wiPk9wZW5TdHJlZXRNYXA8L2E+IGNvbnRyaWJ1dG9ycywgJyArXHJcbiAgICAgICc8YSBocmVmPVwiaHR0cHM6Ly9jcmVhdGl2ZWNvbW1vbnMub3JnL2xpY2Vuc2VzL2J5LXNhLzIuMC9cIj5DQy1CWS1TQTwvYT4sICcgK1xyXG4gICAgICAnSW1hZ2VyeSDCqSA8YSBocmVmPVwiaHR0cHM6Ly93d3cubWFwYm94LmNvbS9cIj5NYXBib3g8L2E+JyxcclxuICAgIGlkOiAnbWFwYm94LnN0cmVldHMnXHJcbiAgfSkuYWRkVG8obmV3TWFwKTtcclxuICAgIH1cclxuICAgIGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmxvZygnT2ZmbGluZSBtb2RlOiAnLCBlcnJvcik7XHJcbiAgICB9XHJcbiAgfSBcclxuICB1cGRhdGVSZXN0YXVyYW50cygpO1xyXG59XHJcblxyXG4vKipcclxuICogVXBkYXRlIHBhZ2UgYW5kIG1hcCBmb3IgY3VycmVudCByZXN0YXVyYW50cy5cclxuICovXHJcbmNvbnN0IHVwZGF0ZVJlc3RhdXJhbnRzID0gKCkgPT4ge1xyXG4gIGNvbnN0IGNTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3Vpc2luZXMtc2VsZWN0Jyk7XHJcbiAgY29uc3QgblNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZWlnaGJvcmhvb2RzLXNlbGVjdCcpO1xyXG5cclxuICBjb25zdCBjSW5kZXggPSBjU2VsZWN0LnNlbGVjdGVkSW5kZXg7XHJcbiAgY29uc3QgbkluZGV4ID0gblNlbGVjdC5zZWxlY3RlZEluZGV4O1xyXG5cclxuICBjb25zdCBjdWlzaW5lID0gY1NlbGVjdFtjSW5kZXhdLnZhbHVlO1xyXG4gIGNvbnN0IG5laWdoYm9yaG9vZCA9IG5TZWxlY3RbbkluZGV4XS52YWx1ZTtcclxuXHJcbiAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50QnlDdWlzaW5lQW5kTmVpZ2hib3Job29kKGN1aXNpbmUsIG5laWdoYm9yaG9vZCwgKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgaWYgKGVycm9yKSB7IC8vIEdvdCBhbiBlcnJvciFcclxuICAgICAgY29uc29sZS5lcnJvcignVHJvdWJsZSBmZXRjaGluZyByZXN0YXVyYW50cyBieSBjdWlzaW5lIGFuZCBuZWlnaGJvcmhvb2Q6ICcsIGVycm9yKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJlc2V0UmVzdGF1cmFudHMocmVzdGF1cmFudHMpO1xyXG4gICAgICBmaWxsUmVzdGF1cmFudHNIVE1MKCk7XHJcbiAgICB9XHJcbiAgfSlcclxufVxyXG5cclxuLyoqXHJcbiAqIENsZWFyIGN1cnJlbnQgcmVzdGF1cmFudHMsIHRoZWlyIEhUTUwgYW5kIHJlbW92ZSB0aGVpciBtYXAgbWFya2Vycy5cclxuICovXHJcbmNvbnN0IHJlc2V0UmVzdGF1cmFudHMgPSAocmVzdGF1cmFudHMpID0+IHtcclxuICAvLyBSZW1vdmUgYWxsIHJlc3RhdXJhbnRzXHJcbiAgc2VsZi5yZXN0YXVyYW50cyA9IFtdO1xyXG4gIGNvbnN0IHVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc3RhdXJhbnRzLWxpc3QnKTtcclxuICB1bC5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgLy8gUmVtb3ZlIGFsbCBtYXAgbWFya2Vyc1xyXG4gIGlmIChzZWxmLm1hcmtlcnMpIHtcclxuICAgIHNlbGYubWFya2Vycy5mb3JFYWNoKG1hcmtlciA9PiBtYXJrZXIucmVtb3ZlKCkpO1xyXG4gIH1cclxuICBzZWxmLm1hcmtlcnMgPSBbXTtcclxuICBzZWxmLnJlc3RhdXJhbnRzID0gcmVzdGF1cmFudHM7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhdGUgYWxsIHJlc3RhdXJhbnRzIEhUTUwgYW5kIGFkZCB0aGVtIHRvIHRoZSB3ZWJwYWdlLlxyXG4gKi9cclxuY29uc3QgZmlsbFJlc3RhdXJhbnRzSFRNTCA9IChyZXN0YXVyYW50cyA9IHNlbGYucmVzdGF1cmFudHMpID0+IHtcclxuICBjb25zdCB1bCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXN0YXVyYW50cy1saXN0Jyk7XHJcbiAgcmVzdGF1cmFudHMuZm9yRWFjaChyZXN0YXVyYW50ID0+IHtcclxuICAgIHVsLmFwcGVuZChjcmVhdGVSZXN0YXVyYW50SFRNTChyZXN0YXVyYW50KSk7XHJcbiAgfSk7XHJcbiAgYWRkTWFya2Vyc1RvTWFwKCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhdGUgcmVzdGF1cmFudCBIVE1MLlxyXG4gKi9cclxuY29uc3QgY3JlYXRlUmVzdGF1cmFudEhUTUwgPSAocmVzdGF1cmFudCkgPT4ge1xyXG4gIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcclxuXHJcbiAgY29uc3QgaW1hZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbWcnKTtcclxuICBpbWFnZS5jbGFzc05hbWUgPSAncmVzdGF1cmFudC1pbWcnO1xyXG4gIGltYWdlLmFsdCA9IGBQaWN0dXJlIG9mICR7cmVzdGF1cmFudC5uYW1lfWA7XHJcbiAgaW1hZ2Uuc3JjID0gREJIZWxwZXIuaW1hZ2VVcmxGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpO1xyXG4gIGltYWdlLnNyY3NldCA9IERCSGVscGVyLmltYWdlU3JjU2V0Rm9yUmVzdGF1cmFudChyZXN0YXVyYW50KTtcclxuICBpbWFnZS5zaXplcyA9IERCSGVscGVyLmltYWdlU2l6ZXNGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpO1xyXG4gIGxpLmFwcGVuZChpbWFnZSk7XHJcblxyXG4gIGNvbnN0IG5hbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoMicpO1xyXG4gIG5hbWUuaW5uZXJIVE1MID0gcmVzdGF1cmFudC5uYW1lO1xyXG4gIGxpLmFwcGVuZChuYW1lKTtcclxuXHJcbiAgY29uc3QgbmVpZ2hib3Job29kID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xyXG4gIG5laWdoYm9yaG9vZC5pbm5lckhUTUwgPSByZXN0YXVyYW50Lm5laWdoYm9yaG9vZDtcclxuICBsaS5hcHBlbmQobmVpZ2hib3Job29kKTtcclxuXHJcbiAgY29uc3QgYWRkcmVzcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcclxuICBhZGRyZXNzLmlubmVySFRNTCA9IHJlc3RhdXJhbnQuYWRkcmVzcztcclxuICBsaS5hcHBlbmQoYWRkcmVzcyk7XHJcblxyXG4gIGNvbnN0IG1vcmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XHJcbiAgbW9yZS5pbm5lckhUTUwgPSAnVmlldyBEZXRhaWxzJztcclxuICBtb3JlLmhyZWYgPSBEQkhlbHBlci51cmxGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpO1xyXG4gIGxpLmFwcGVuZChtb3JlKVxyXG5cclxuICByZXR1cm4gbGlcclxufVxyXG5cclxuLyoqXHJcbiAqIEFkZCBtYXJrZXJzIGZvciBjdXJyZW50IHJlc3RhdXJhbnRzIHRvIHRoZSBtYXAuXHJcbiAqL1xyXG5jb25zdCBhZGRNYXJrZXJzVG9NYXAgPSAocmVzdGF1cmFudHMgPSBzZWxmLnJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgaWYgKCFuZXdNYXAgfHwgIUwpIHJldHVybjtcclxuICByZXN0YXVyYW50cy5mb3JFYWNoKHJlc3RhdXJhbnQgPT4ge1xyXG4gICAgLy8gQWRkIG1hcmtlciB0byB0aGUgbWFwXHJcbiAgICBjb25zdCBtYXJrZXIgPSBEQkhlbHBlci5tYXBNYXJrZXJGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQsIG5ld01hcCk7XHJcbiAgICBtYXJrZXIub24oXCJjbGlja1wiLCBvbkNsaWNrKTtcclxuICAgIGZ1bmN0aW9uIG9uQ2xpY2soKSB7XHJcbiAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gbWFya2VyLm9wdGlvbnMudXJsO1xyXG4gICAgfVxyXG4gICAgc2VsZi5tYXJrZXJzLnB1c2gobWFya2VyKTtcclxuICB9KTtcclxuXHJcbn0gIiwiLy9JbnN0YWxsIHNlcnZpY2Ugd29ya2VyXHJcbmlmIChuYXZpZ2F0b3Iuc2VydmljZVdvcmtlcikge1xyXG4gICAgICBuYXZpZ2F0b3Iuc2VydmljZVdvcmtlci5yZWdpc3RlcignL3N3LmpzJykudGhlbihmdW5jdGlvbihyZWdpc3RyYXRpb24pIHtcclxuICAgICAgICAvLyBSZWdpc3RyYXRpb24gd2FzIHN1Y2Nlc3NmdWxcclxuICAgICAgICBjb25zb2xlLmxvZygnU2VydmljZVdvcmtlciByZWdpc3RyYXRpb24gc3VjY2Vzc2Z1bCB3aXRoIHNjb3BlOiAnLCByZWdpc3RyYXRpb24uc2NvcGUpO1xyXG4gICAgICB9KS5jYXRjaCgoZXJyKSA9PiB7XHJcbiAgY29uc29sZS5sb2coJ1NlcnZpY2VXb3JrZXIgcmVnaXN0cmF0aW9uIGZhaWxlZDogJywgZXJyKTtcclxufSk7ICBcclxufVxyXG5cclxubmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIucmVhZHkudGhlbihzd1JlZ2lzdHJhdGlvbiA9PiBzd1JlZ2lzdHJhdGlvbi5zeW5jLnJlZ2lzdGVyKCd0b2RvX3VwZGF0ZWQnKSk7IiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU0VDUkVUIHtcclxuICAgIHN0YXRpYyBnZXQgbWFwYm94X2tleSgpe1xyXG4gICAgICAgIHJldHVybiAncGsuZXlKMUlqb2laR1Z6WkdWdGIyNW9kU0lzSW1FaU9pSmphbTF0Wm1aNk1Yb3dhVzVyTTNGd05XbDJjSE5uY0RnMEluMC5LTzlVVGV5Ny1BZDdOMHFsUDkxQ2dnJztcclxuICAgIH1cclxufSJdfQ==
