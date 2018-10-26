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
  } else {
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
    updateRestaurants();
  }
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
      console.error(error);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaWRiL2xpYi9pZGIuanMiLCJzcmMvanMvZGJoZWxwZXIuanMiLCJzcmMvanMvZGJwcm9taXNlLmpzIiwic3JjL2pzL21haW4uanMiLCJzcmMvanMvcmVnaXN0ZXItc3cuanMiLCJzcmMvanMvc2VjcmV0LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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RCxFQUdHLEtBSEgsQ0FHUyxVQUFDLEdBQUQsRUFBUztBQUN0QixJQUFBLE9BQU8sQ0FBQyxHQUFSLENBQVkscUNBQVosRUFBbUQsR0FBbkQ7QUFDRCxHQUxLO0FBTUw7O0FBRUQsU0FBUyxDQUFDLGFBQVYsQ0FBd0IsS0FBeEIsQ0FBOEIsSUFBOUIsQ0FBbUMsVUFBQSxjQUFjO0FBQUEsU0FBSSxjQUFjLENBQUMsSUFBZixDQUFvQixRQUFwQixDQUE2QixjQUE3QixDQUFKO0FBQUEsQ0FBakQ7Ozs7Ozs7Ozs7Ozs7Ozs7SUNWcUIsTTs7Ozs7Ozs7O3dCQUNNO0FBQ25CLGFBQU8sK0ZBQVA7QUFDSCIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIid1c2Ugc3RyaWN0JztcblxuKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiB0b0FycmF5KGFycikge1xuICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnIpO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJvbWlzaWZ5UmVxdWVzdChyZXF1ZXN0KSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVzb2x2ZShyZXF1ZXN0LnJlc3VsdCk7XG4gICAgICB9O1xuXG4gICAgICByZXF1ZXN0Lm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb21pc2lmeVJlcXVlc3RDYWxsKG9iaiwgbWV0aG9kLCBhcmdzKSB7XG4gICAgdmFyIHJlcXVlc3Q7XG4gICAgdmFyIHAgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIHJlcXVlc3QgPSBvYmpbbWV0aG9kXS5hcHBseShvYmosIGFyZ3MpO1xuICAgICAgcHJvbWlzaWZ5UmVxdWVzdChyZXF1ZXN0KS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgfSk7XG5cbiAgICBwLnJlcXVlc3QgPSByZXF1ZXN0O1xuICAgIHJldHVybiBwO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJvbWlzaWZ5Q3Vyc29yUmVxdWVzdENhbGwob2JqLCBtZXRob2QsIGFyZ3MpIHtcbiAgICB2YXIgcCA9IHByb21pc2lmeVJlcXVlc3RDYWxsKG9iaiwgbWV0aG9kLCBhcmdzKTtcbiAgICByZXR1cm4gcC50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICBpZiAoIXZhbHVlKSByZXR1cm47XG4gICAgICByZXR1cm4gbmV3IEN1cnNvcih2YWx1ZSwgcC5yZXF1ZXN0KTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5UHJvcGVydGllcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShQcm94eUNsYXNzLnByb3RvdHlwZSwgcHJvcCwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHJldHVybiB0aGlzW3RhcmdldFByb3BdW3Byb3BdO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgIHRoaXNbdGFyZ2V0UHJvcF1bcHJvcF0gPSB2YWw7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlSZXF1ZXN0TWV0aG9kcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBDb25zdHJ1Y3RvciwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBpZiAoIShwcm9wIGluIENvbnN0cnVjdG9yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICAgIFByb3h5Q2xhc3MucHJvdG90eXBlW3Byb3BdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBwcm9taXNpZnlSZXF1ZXN0Q2FsbCh0aGlzW3RhcmdldFByb3BdLCBwcm9wLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5TWV0aG9kcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBDb25zdHJ1Y3RvciwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBpZiAoIShwcm9wIGluIENvbnN0cnVjdG9yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICAgIFByb3h5Q2xhc3MucHJvdG90eXBlW3Byb3BdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzW3RhcmdldFByb3BdW3Byb3BdLmFwcGx5KHRoaXNbdGFyZ2V0UHJvcF0sIGFyZ3VtZW50cyk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlDdXJzb3JSZXF1ZXN0TWV0aG9kcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBDb25zdHJ1Y3RvciwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBpZiAoIShwcm9wIGluIENvbnN0cnVjdG9yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICAgIFByb3h5Q2xhc3MucHJvdG90eXBlW3Byb3BdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBwcm9taXNpZnlDdXJzb3JSZXF1ZXN0Q2FsbCh0aGlzW3RhcmdldFByb3BdLCBwcm9wLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIEluZGV4KGluZGV4KSB7XG4gICAgdGhpcy5faW5kZXggPSBpbmRleDtcbiAgfVxuXG4gIHByb3h5UHJvcGVydGllcyhJbmRleCwgJ19pbmRleCcsIFtcbiAgICAnbmFtZScsXG4gICAgJ2tleVBhdGgnLFxuICAgICdtdWx0aUVudHJ5JyxcbiAgICAndW5pcXVlJ1xuICBdKTtcblxuICBwcm94eVJlcXVlc3RNZXRob2RzKEluZGV4LCAnX2luZGV4JywgSURCSW5kZXgsIFtcbiAgICAnZ2V0JyxcbiAgICAnZ2V0S2V5JyxcbiAgICAnZ2V0QWxsJyxcbiAgICAnZ2V0QWxsS2V5cycsXG4gICAgJ2NvdW50J1xuICBdKTtcblxuICBwcm94eUN1cnNvclJlcXVlc3RNZXRob2RzKEluZGV4LCAnX2luZGV4JywgSURCSW5kZXgsIFtcbiAgICAnb3BlbkN1cnNvcicsXG4gICAgJ29wZW5LZXlDdXJzb3InXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIEN1cnNvcihjdXJzb3IsIHJlcXVlc3QpIHtcbiAgICB0aGlzLl9jdXJzb3IgPSBjdXJzb3I7XG4gICAgdGhpcy5fcmVxdWVzdCA9IHJlcXVlc3Q7XG4gIH1cblxuICBwcm94eVByb3BlcnRpZXMoQ3Vyc29yLCAnX2N1cnNvcicsIFtcbiAgICAnZGlyZWN0aW9uJyxcbiAgICAna2V5JyxcbiAgICAncHJpbWFyeUtleScsXG4gICAgJ3ZhbHVlJ1xuICBdKTtcblxuICBwcm94eVJlcXVlc3RNZXRob2RzKEN1cnNvciwgJ19jdXJzb3InLCBJREJDdXJzb3IsIFtcbiAgICAndXBkYXRlJyxcbiAgICAnZGVsZXRlJ1xuICBdKTtcblxuICAvLyBwcm94eSAnbmV4dCcgbWV0aG9kc1xuICBbJ2FkdmFuY2UnLCAnY29udGludWUnLCAnY29udGludWVQcmltYXJ5S2V5J10uZm9yRWFjaChmdW5jdGlvbihtZXRob2ROYW1lKSB7XG4gICAgaWYgKCEobWV0aG9kTmFtZSBpbiBJREJDdXJzb3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgIEN1cnNvci5wcm90b3R5cGVbbWV0aG9kTmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBjdXJzb3IgPSB0aGlzO1xuICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgY3Vyc29yLl9jdXJzb3JbbWV0aG9kTmFtZV0uYXBwbHkoY3Vyc29yLl9jdXJzb3IsIGFyZ3MpO1xuICAgICAgICByZXR1cm4gcHJvbWlzaWZ5UmVxdWVzdChjdXJzb3IuX3JlcXVlc3QpLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICBpZiAoIXZhbHVlKSByZXR1cm47XG4gICAgICAgICAgcmV0dXJuIG5ldyBDdXJzb3IodmFsdWUsIGN1cnNvci5fcmVxdWVzdCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgZnVuY3Rpb24gT2JqZWN0U3RvcmUoc3RvcmUpIHtcbiAgICB0aGlzLl9zdG9yZSA9IHN0b3JlO1xuICB9XG5cbiAgT2JqZWN0U3RvcmUucHJvdG90eXBlLmNyZWF0ZUluZGV4ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBJbmRleCh0aGlzLl9zdG9yZS5jcmVhdGVJbmRleC5hcHBseSh0aGlzLl9zdG9yZSwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgT2JqZWN0U3RvcmUucHJvdG90eXBlLmluZGV4ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBJbmRleCh0aGlzLl9zdG9yZS5pbmRleC5hcHBseSh0aGlzLl9zdG9yZSwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgW1xuICAgICduYW1lJyxcbiAgICAna2V5UGF0aCcsXG4gICAgJ2luZGV4TmFtZXMnLFxuICAgICdhdXRvSW5jcmVtZW50J1xuICBdKTtcblxuICBwcm94eVJlcXVlc3RNZXRob2RzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgSURCT2JqZWN0U3RvcmUsIFtcbiAgICAncHV0JyxcbiAgICAnYWRkJyxcbiAgICAnZGVsZXRlJyxcbiAgICAnY2xlYXInLFxuICAgICdnZXQnLFxuICAgICdnZXRBbGwnLFxuICAgICdnZXRLZXknLFxuICAgICdnZXRBbGxLZXlzJyxcbiAgICAnY291bnQnXG4gIF0pO1xuXG4gIHByb3h5Q3Vyc29yUmVxdWVzdE1ldGhvZHMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBJREJPYmplY3RTdG9yZSwgW1xuICAgICdvcGVuQ3Vyc29yJyxcbiAgICAnb3BlbktleUN1cnNvcidcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgSURCT2JqZWN0U3RvcmUsIFtcbiAgICAnZGVsZXRlSW5kZXgnXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIFRyYW5zYWN0aW9uKGlkYlRyYW5zYWN0aW9uKSB7XG4gICAgdGhpcy5fdHggPSBpZGJUcmFuc2FjdGlvbjtcbiAgICB0aGlzLmNvbXBsZXRlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICBpZGJUcmFuc2FjdGlvbi5vbmNvbXBsZXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgIH07XG4gICAgICBpZGJUcmFuc2FjdGlvbi5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlamVjdChpZGJUcmFuc2FjdGlvbi5lcnJvcik7XG4gICAgICB9O1xuICAgICAgaWRiVHJhbnNhY3Rpb24ub25hYm9ydCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZWplY3QoaWRiVHJhbnNhY3Rpb24uZXJyb3IpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIFRyYW5zYWN0aW9uLnByb3RvdHlwZS5vYmplY3RTdG9yZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgT2JqZWN0U3RvcmUodGhpcy5fdHgub2JqZWN0U3RvcmUuYXBwbHkodGhpcy5fdHgsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhUcmFuc2FjdGlvbiwgJ190eCcsIFtcbiAgICAnb2JqZWN0U3RvcmVOYW1lcycsXG4gICAgJ21vZGUnXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhUcmFuc2FjdGlvbiwgJ190eCcsIElEQlRyYW5zYWN0aW9uLCBbXG4gICAgJ2Fib3J0J1xuICBdKTtcblxuICBmdW5jdGlvbiBVcGdyYWRlREIoZGIsIG9sZFZlcnNpb24sIHRyYW5zYWN0aW9uKSB7XG4gICAgdGhpcy5fZGIgPSBkYjtcbiAgICB0aGlzLm9sZFZlcnNpb24gPSBvbGRWZXJzaW9uO1xuICAgIHRoaXMudHJhbnNhY3Rpb24gPSBuZXcgVHJhbnNhY3Rpb24odHJhbnNhY3Rpb24pO1xuICB9XG5cbiAgVXBncmFkZURCLnByb3RvdHlwZS5jcmVhdGVPYmplY3RTdG9yZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgT2JqZWN0U3RvcmUodGhpcy5fZGIuY3JlYXRlT2JqZWN0U3RvcmUuYXBwbHkodGhpcy5fZGIsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhVcGdyYWRlREIsICdfZGInLCBbXG4gICAgJ25hbWUnLFxuICAgICd2ZXJzaW9uJyxcbiAgICAnb2JqZWN0U3RvcmVOYW1lcydcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKFVwZ3JhZGVEQiwgJ19kYicsIElEQkRhdGFiYXNlLCBbXG4gICAgJ2RlbGV0ZU9iamVjdFN0b3JlJyxcbiAgICAnY2xvc2UnXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIERCKGRiKSB7XG4gICAgdGhpcy5fZGIgPSBkYjtcbiAgfVxuXG4gIERCLnByb3RvdHlwZS50cmFuc2FjdGlvbiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgVHJhbnNhY3Rpb24odGhpcy5fZGIudHJhbnNhY3Rpb24uYXBwbHkodGhpcy5fZGIsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhEQiwgJ19kYicsIFtcbiAgICAnbmFtZScsXG4gICAgJ3ZlcnNpb24nLFxuICAgICdvYmplY3RTdG9yZU5hbWVzJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoREIsICdfZGInLCBJREJEYXRhYmFzZSwgW1xuICAgICdjbG9zZSdcbiAgXSk7XG5cbiAgLy8gQWRkIGN1cnNvciBpdGVyYXRvcnNcbiAgLy8gVE9ETzogcmVtb3ZlIHRoaXMgb25jZSBicm93c2VycyBkbyB0aGUgcmlnaHQgdGhpbmcgd2l0aCBwcm9taXNlc1xuICBbJ29wZW5DdXJzb3InLCAnb3BlbktleUN1cnNvciddLmZvckVhY2goZnVuY3Rpb24oZnVuY05hbWUpIHtcbiAgICBbT2JqZWN0U3RvcmUsIEluZGV4XS5mb3JFYWNoKGZ1bmN0aW9uKENvbnN0cnVjdG9yKSB7XG4gICAgICAvLyBEb24ndCBjcmVhdGUgaXRlcmF0ZUtleUN1cnNvciBpZiBvcGVuS2V5Q3Vyc29yIGRvZXNuJ3QgZXhpc3QuXG4gICAgICBpZiAoIShmdW5jTmFtZSBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG5cbiAgICAgIENvbnN0cnVjdG9yLnByb3RvdHlwZVtmdW5jTmFtZS5yZXBsYWNlKCdvcGVuJywgJ2l0ZXJhdGUnKV0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSB0b0FycmF5KGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3NbYXJncy5sZW5ndGggLSAxXTtcbiAgICAgICAgdmFyIG5hdGl2ZU9iamVjdCA9IHRoaXMuX3N0b3JlIHx8IHRoaXMuX2luZGV4O1xuICAgICAgICB2YXIgcmVxdWVzdCA9IG5hdGl2ZU9iamVjdFtmdW5jTmFtZV0uYXBwbHkobmF0aXZlT2JqZWN0LCBhcmdzLnNsaWNlKDAsIC0xKSk7XG4gICAgICAgIHJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgY2FsbGJhY2socmVxdWVzdC5yZXN1bHQpO1xuICAgICAgICB9O1xuICAgICAgfTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gcG9seWZpbGwgZ2V0QWxsXG4gIFtJbmRleCwgT2JqZWN0U3RvcmVdLmZvckVhY2goZnVuY3Rpb24oQ29uc3RydWN0b3IpIHtcbiAgICBpZiAoQ29uc3RydWN0b3IucHJvdG90eXBlLmdldEFsbCkgcmV0dXJuO1xuICAgIENvbnN0cnVjdG9yLnByb3RvdHlwZS5nZXRBbGwgPSBmdW5jdGlvbihxdWVyeSwgY291bnQpIHtcbiAgICAgIHZhciBpbnN0YW5jZSA9IHRoaXM7XG4gICAgICB2YXIgaXRlbXMgPSBbXTtcblxuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUpIHtcbiAgICAgICAgaW5zdGFuY2UuaXRlcmF0ZUN1cnNvcihxdWVyeSwgZnVuY3Rpb24oY3Vyc29yKSB7XG4gICAgICAgICAgaWYgKCFjdXJzb3IpIHtcbiAgICAgICAgICAgIHJlc29sdmUoaXRlbXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpdGVtcy5wdXNoKGN1cnNvci52YWx1ZSk7XG5cbiAgICAgICAgICBpZiAoY291bnQgIT09IHVuZGVmaW5lZCAmJiBpdGVtcy5sZW5ndGggPT0gY291bnQpIHtcbiAgICAgICAgICAgIHJlc29sdmUoaXRlbXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjdXJzb3IuY29udGludWUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9O1xuICB9KTtcblxuICB2YXIgZXhwID0ge1xuICAgIG9wZW46IGZ1bmN0aW9uKG5hbWUsIHZlcnNpb24sIHVwZ3JhZGVDYWxsYmFjaykge1xuICAgICAgdmFyIHAgPSBwcm9taXNpZnlSZXF1ZXN0Q2FsbChpbmRleGVkREIsICdvcGVuJywgW25hbWUsIHZlcnNpb25dKTtcbiAgICAgIHZhciByZXF1ZXN0ID0gcC5yZXF1ZXN0O1xuXG4gICAgICBpZiAocmVxdWVzdCkge1xuICAgICAgICByZXF1ZXN0Lm9udXBncmFkZW5lZWRlZCA9IGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgaWYgKHVwZ3JhZGVDYWxsYmFjaykge1xuICAgICAgICAgICAgdXBncmFkZUNhbGxiYWNrKG5ldyBVcGdyYWRlREIocmVxdWVzdC5yZXN1bHQsIGV2ZW50Lm9sZFZlcnNpb24sIHJlcXVlc3QudHJhbnNhY3Rpb24pKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwLnRoZW4oZnVuY3Rpb24oZGIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEQihkYik7XG4gICAgICB9KTtcbiAgICB9LFxuICAgIGRlbGV0ZTogZnVuY3Rpb24obmFtZSkge1xuICAgICAgcmV0dXJuIHByb21pc2lmeVJlcXVlc3RDYWxsKGluZGV4ZWREQiwgJ2RlbGV0ZURhdGFiYXNlJywgW25hbWVdKTtcbiAgICB9XG4gIH07XG5cbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBleHA7XG4gICAgbW9kdWxlLmV4cG9ydHMuZGVmYXVsdCA9IG1vZHVsZS5leHBvcnRzO1xuICB9XG4gIGVsc2Uge1xuICAgIHNlbGYuaWRiID0gZXhwO1xuICB9XG59KCkpO1xuIiwiaW1wb3J0IGRiUHJvbWlzZSBmcm9tICcuL2RicHJvbWlzZSc7XHJcbi8qKlxyXG4gKiBDb21tb24gZGF0YWJhc2UgaGVscGVyIGZ1bmN0aW9ucy5cclxuICovXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERCSGVscGVyIHtcclxuXHJcbiAgLyoqXHJcbiAgICogRGF0YWJhc2UgVVJMLlxyXG4gICAqIENoYW5nZSB0aGlzIHRvIHJlc3RhdXJhbnRzLmpzb24gZmlsZSBsb2NhdGlvbiBvbiB5b3VyIHNlcnZlci5cclxuICAgKi9cclxuICBzdGF0aWMgZ2V0IERBVEFCQVNFX1VSTCgpIHtcclxuICAgIGNvbnN0IHBvcnQgPSA4MDAwIC8vIENoYW5nZSB0aGlzIHRvIHlvdXIgc2VydmVyIHBvcnRcclxuICAgIHJldHVybiBgaHR0cDovL2xvY2FsaG9zdDoke3BvcnR9L2RhdGEvcmVzdGF1cmFudHMuanNvbmA7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgZ2V0IEFQSV9VUkwoKXtcclxuICAgIGNvbnN0IHBvcnQgPSAxMzM3O1xyXG4gICAgcmV0dXJuIGBodHRwOi8vbG9jYWxob3N0OiR7cG9ydH1gXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCBhbGwgcmVzdGF1cmFudHMuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudHMoY2FsbGJhY2spIHtcclxuICAgIGxldCB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcclxuICAgIHhoci5vcGVuKCdHRVQnLCBgJHtEQkhlbHBlci5BUElfVVJMfS9yZXN0YXVyYW50c2ApO1xyXG4gICAgeGhyLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgaWYgKHhoci5zdGF0dXMgPT09IDIwMCkgeyAvLyBHb3QgYSBzdWNjZXNzIHJlc3BvbnNlIGZyb20gc2VydmVyIVxyXG4gICAgICAgIGNvbnN0IHJlc3RhdXJhbnRzID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KTtcclxuICAgICAgICBkYlByb21pc2UucHV0UmVzdGF1cmFudHMocmVzdGF1cmFudHMpO1xyXG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnRzKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgZGJQcm9taXNlLmdldFJlc3RhdXJhbnRzKCkudGhlbihyZXN0YXVyYW50cyA9PntcclxuICAgICAgICAgIGlmKHJlc3RhdXJhbnRzLmxlbmd0aCA+IDApe1xyXG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCByZXN0YXVyYW50cyk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IChgUmVxdWVzdCBmYWlsZWQuIFJldHVybmVkIHN0YXR1cyBvZiAke3hoci5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTsgXHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgICB4aHIuc2VuZCgpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggYSByZXN0YXVyYW50IGJ5IGl0cyBJRC5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50QnlJZChpZCwgY2FsbGJhY2spIHtcclxuICAgIGZldGNoKGAke0RCSGVscGVyLkFQSV9VUkx9L3Jlc3RhdXJhbnRzLyR7aWR9YCkudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHJldHVybiBQcm9taXNlLnJlamVjdChcIlJlc3RhdXJhbnQgY291bGRuJ3QgYmUgZmV0Y2hlZCBmcm9tIG5ldHdvcmtcIik7XHJcbiAgICAgIHJldHVybiByZXNwb25zZS5qc29uKCk7XHJcbiAgICB9KVxyXG4gICAgLnRoZW4oKHJlc3RhdXJhbnQpPT4ge1xyXG4gICAgICBkYlByb21pc2UucHV0UmVzdGF1cmFudHMocmVzdGF1cmFudClcclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnQpO1xyXG4gICAgfSkuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGlkLCBlcnJvcik7XHJcbiAgICAgIGRiUHJvbWlzZS5nZXRSZXN0YXVyYW50cyhpZCkudGhlbigocmVzdGF1cmFudCk9PntcclxuICAgICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgZmV0Y2hSZXZpZXdzQnlSZXN0YXVyYW50KGlkLCBjYWxsYmFjayl7XHJcbiAgICBmZXRjaChgJHtEQkhlbHBlci5BUElfVVJMfS9yZXZpZXdzLz9yZXN0YXVyYW50X2lkPSR7aWR9YCkudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHJldHVybiBQcm9taXNlLnJlamVjdChcIlJlc3RhdXJhbnQgUmV2aWV3cyBjb3VsZG4ndCBiZSBmZXRjaGVkIGZyb20gbmV0d29ya1wiKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxuICAgIH0pLnRoZW4oKHJldmlld3MpPT4ge1xyXG4gICAgICBkYlByb21pc2UucHV0UmV2aWV3cyhpZCwgcmV2aWV3cyk7XHJcbiAgICAgIHJldHVybiBjYWxsYmFjayhudWxsLCByZXZpZXdzKTtcclxuICAgIH0pLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICBjb25zb2xlLmxvZyhlcnJvcik7XHJcbiAgICAgIGRiUHJvbWlzZS5nZXRSZXZpZXdzKGlkKS50aGVuKChyZXZpZXdzKT0+e1xyXG4gICAgICAgIHJldHVybiBjYWxsYmFjayhudWxsLCByZXZpZXdzKTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIHJlc3RhdXJhbnRzIGJ5IGEgY3Vpc2luZSB0eXBlIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaFJlc3RhdXJhbnRCeUN1aXNpbmUoY3Vpc2luZSwgY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50cyAgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmdcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRmlsdGVyIHJlc3RhdXJhbnRzIHRvIGhhdmUgb25seSBnaXZlbiBjdWlzaW5lIHR5cGVcclxuICAgICAgICBjb25zdCByZXN1bHRzID0gcmVzdGF1cmFudHMuZmlsdGVyKHIgPT4gci5jdWlzaW5lX3R5cGUgPT0gY3Vpc2luZSk7XHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0cyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggcmVzdGF1cmFudHMgYnkgYSBuZWlnaGJvcmhvb2Qgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudEJ5TmVpZ2hib3Job29kKG5laWdoYm9yaG9vZCwgY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50c1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBGaWx0ZXIgcmVzdGF1cmFudHMgdG8gaGF2ZSBvbmx5IGdpdmVuIG5laWdoYm9yaG9vZFxyXG4gICAgICAgIGNvbnN0IHJlc3VsdHMgPSByZXN0YXVyYW50cy5maWx0ZXIociA9PiByLm5laWdoYm9yaG9vZCA9PSBuZWlnaGJvcmhvb2QpO1xyXG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdHMpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIHJlc3RhdXJhbnRzIGJ5IGEgY3Vpc2luZSBhbmQgYSBuZWlnaGJvcmhvb2Qgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudEJ5Q3Vpc2luZUFuZE5laWdoYm9yaG9vZChjdWlzaW5lLCBuZWlnaGJvcmhvb2QsIGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbGV0IHJlc3VsdHMgPSByZXN0YXVyYW50c1xyXG4gICAgICAgIGlmIChjdWlzaW5lICE9ICdhbGwnKSB7IC8vIGZpbHRlciBieSBjdWlzaW5lXHJcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIociA9PiByLmN1aXNpbmVfdHlwZSA9PSBjdWlzaW5lKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKG5laWdoYm9yaG9vZCAhPSAnYWxsJykgeyAvLyBmaWx0ZXIgYnkgbmVpZ2hib3Job29kXHJcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIociA9PiByLm5laWdoYm9yaG9vZCA9PSBuZWlnaGJvcmhvb2QpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYWxsYmFjayhudWxsLCByZXN1bHRzKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCBhbGwgbmVpZ2hib3Job29kcyB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZy5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hOZWlnaGJvcmhvb2RzKGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gR2V0IGFsbCBuZWlnaGJvcmhvb2RzIGZyb20gYWxsIHJlc3RhdXJhbnRzXHJcbiAgICAgICAgY29uc3QgbmVpZ2hib3Job29kcyA9IHJlc3RhdXJhbnRzLm1hcCgodiwgaSkgPT4gcmVzdGF1cmFudHNbaV0ubmVpZ2hib3Job29kKVxyXG4gICAgICAgIC8vIFJlbW92ZSBkdXBsaWNhdGVzIGZyb20gbmVpZ2hib3Job29kc1xyXG4gICAgICAgIGNvbnN0IHVuaXF1ZU5laWdoYm9yaG9vZHMgPSBuZWlnaGJvcmhvb2RzLmZpbHRlcigodiwgaSkgPT4gbmVpZ2hib3Job29kcy5pbmRleE9mKHYpID09IGkpXHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgdW5pcXVlTmVpZ2hib3Job29kcyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggYWxsIGN1aXNpbmVzIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaEN1aXNpbmVzKGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gR2V0IGFsbCBjdWlzaW5lcyBmcm9tIGFsbCByZXN0YXVyYW50c1xyXG4gICAgICAgIGNvbnN0IGN1aXNpbmVzID0gcmVzdGF1cmFudHMubWFwKCh2LCBpKSA9PiByZXN0YXVyYW50c1tpXS5jdWlzaW5lX3R5cGUpXHJcbiAgICAgICAgLy8gUmVtb3ZlIGR1cGxpY2F0ZXMgZnJvbSBjdWlzaW5lc1xyXG4gICAgICAgIGNvbnN0IHVuaXF1ZUN1aXNpbmVzID0gY3Vpc2luZXMuZmlsdGVyKCh2LCBpKSA9PiBjdWlzaW5lcy5pbmRleE9mKHYpID09IGkpXHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgdW5pcXVlQ3Vpc2luZXMpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJlc3RhdXJhbnQgcGFnZSBVUkwuXHJcbiAgICovXHJcbiAgc3RhdGljIHVybEZvclJlc3RhdXJhbnQocmVzdGF1cmFudCkge1xyXG4gICAgcmV0dXJuIChgLi9yZXN0YXVyYW50Lmh0bWw/aWQ9JHtyZXN0YXVyYW50LmlkfWApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVzdGF1cmFudCBpbWFnZSBVUkwuXHJcbiAgICovXHJcbiAgc3RhdGljIGltYWdlVXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KSB7XHJcbiAgICByZXR1cm4gKGAvaW1nLyR7cmVzdGF1cmFudC5waG90b2dyYXBoIHx8IHJlc3RhdXJhbnQuaWR9LW1lZGl1bS5qcGdgKTtcclxuICB9XHJcblxyXG4gIHN0YXRpYyBpbWFnZVNyY1NldEZvclJlc3RhdXJhbnQocmVzdGF1cmFudCl7XHJcbiAgICBjb25zdCBpbWdTcmMgPSBgL2ltZy8ke3Jlc3RhdXJhbnQucGhvdG9ncmFwaCB8fCByZXN0YXVyYW50LmlkfWA7XHJcbiAgICByZXR1cm4gYCR7aW1nU3JjfS1zbWFsbC5qcGcgMzAwdyxcclxuICAgICAgICAgICAgJHtpbWdTcmN9LW1lZGl1bS5qcGcgNjAwdyxcclxuICAgICAgICAgICAgJHtpbWdTcmN9LWxhcmdlLmpwZyA4MDB3YFxyXG4gIH1cclxuXHJcbiAgc3RhdGljIGltYWdlU2l6ZXNGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpIHtcclxuICAgIHJldHVybiBgKG1heC13aWR0aDogMzYwcHgpIDI4MHB4LFxyXG4gICAgICAgICAgICAobWF4LXdpZHRoOiA2MDBweCkgNjAwcHgsXHJcbiAgICAgICAgICAgIDQwMHB4YDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIE1hcCBtYXJrZXIgZm9yIGEgcmVzdGF1cmFudC5cclxuICAgKi9cclxuICAgc3RhdGljIG1hcE1hcmtlckZvclJlc3RhdXJhbnQocmVzdGF1cmFudCwgbWFwKSB7XHJcbiAgICAvLyBodHRwczovL2xlYWZsZXRqcy5jb20vcmVmZXJlbmNlLTEuMy4wLmh0bWwjbWFya2VyICBcclxuICAgIGNvbnN0IG1hcmtlciA9IG5ldyBMLm1hcmtlcihbcmVzdGF1cmFudC5sYXRsbmcubGF0LCByZXN0YXVyYW50LmxhdGxuZy5sbmddLFxyXG4gICAgICB7dGl0bGU6IHJlc3RhdXJhbnQubmFtZSxcclxuICAgICAgYWx0OiByZXN0YXVyYW50Lm5hbWUsXHJcbiAgICAgIHVybDogREJIZWxwZXIudXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KVxyXG4gICAgICB9KVxyXG4gICAgICBtYXJrZXIuYWRkVG8obWFwKTtcclxuICAgIHJldHVybiBtYXJrZXI7XHJcbiAgfSBcclxuICAvKiBzdGF0aWMgbWFwTWFya2VyRm9yUmVzdGF1cmFudChyZXN0YXVyYW50LCBtYXApIHtcclxuICAgIGNvbnN0IG1hcmtlciA9IG5ldyBnb29nbGUubWFwcy5NYXJrZXIoe1xyXG4gICAgICBwb3NpdGlvbjogcmVzdGF1cmFudC5sYXRsbmcsXHJcbiAgICAgIHRpdGxlOiByZXN0YXVyYW50Lm5hbWUsXHJcbiAgICAgIHVybDogREJIZWxwZXIudXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KSxcclxuICAgICAgbWFwOiBtYXAsXHJcbiAgICAgIGFuaW1hdGlvbjogZ29vZ2xlLm1hcHMuQW5pbWF0aW9uLkRST1B9XHJcbiAgICApO1xyXG4gICAgcmV0dXJuIG1hcmtlcjtcclxuICB9ICovXHJcblxyXG4gIHN0YXRpYyBzdWJtaXRSZXZpZXdCeVJlc3RhdXJhbnQocmV2aWV3KSB7XHJcbiAgaWYobmF2aWdhdG9yLm9uTGluZSkge1xyXG4gICAgZmV0Y2goYCR7REJIZWxwZXIuQVBJX1VSTH0vcmV2aWV3c2AsIHtcclxuICAgICAgbWV0aG9kOidwb3N0JyxcclxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIFwicmVzdGF1cmFudF9pZFwiOiByZXZpZXcucmVzdGF1cmFudF9pZCxcclxuICAgICAgICBcIm5hbWVcIjogcmV2aWV3Lm5hbWUsXHJcbiAgICAgICAgXCJyYXRpbmdcIjogcmV2aWV3LnJhdGluZyxcclxuICAgICAgICBcImNvbW1lbnRzXCI6IHJldmlldy5jb21tZW50c1xyXG4gICAgfSlcclxuICAgIH0pLnRoZW4oKHJlc3BvbnNlKSA9PiB7XHJcbiAgICAgIHJldHVybiByZXNwb25zZTtcclxuICAgIH0pXHJcbiAgfSBlbHNlIHtcclxuICAgICAgZGJQcm9taXNlLmdldFJldmlld3MocmV2aWV3LnJlc3RhdXJhbnRfaWQpLnRoZW4oKHJldmlld3MpPT57XHJcbiAgICAgICAgbGV0IGFsbFJldmlld3MgPSByZXZpZXdzLmNvbmNhdChyZXZpZXcpO1xyXG4gICAgICAgIGRiUHJvbWlzZS5wdXRSZXZpZXdzKHJldmlldy5yZXN0YXVyYW50X2lkLCBhbGxSZXZpZXdzKTtcclxuICAgICAgfSlcclxuICAgIH0gIFxyXG4gIH1cclxuXHJcbiAgc3RhdGljIHVwZGF0ZURhdGFiYXNlKCl7XHJcbiAgICBkYlByb21pc2UuZ2V0UmVzdGF1cmFudHMoKS50aGVuKChyZXN0YXVyYW50cyk9PiB7XHJcbiAgICAgIHJlc3RhdXJhbnRzLmZvckVhY2gocmVzdGF1cmFudCA9PiB7XHJcbiAgICAgICAgaWYocmVzdGF1cmFudC5yZXZpZXdzKXtcclxuICAgICAgICAgIHJlc3RhdXJhbnQucmV2aWV3cy5mb3JFYWNoKChyZXZpZXcpID0+IHtcclxuICAgICAgICAgICAgaWYoIXJldmlldy5pZCl7XHJcbiAgICAgICAgICAgICAgdGhpcy5zdWJtaXRSZXZpZXdCeVJlc3RhdXJhbnQocmV2aWV3KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfSlcclxuICB9XHJcblxyXG59IiwiaW1wb3J0IElEQiBmcm9tICdpZGInO1xyXG5cclxuY29uc3QgZGJQcm9taXNlID0ge1xyXG4gICAgZGIgOiBJREIub3BlbigncmVzdGF1cmFudC1yZXZpZXdzLWRiJywgMiwgKHVwZ3JhZGVEQikgPT57XHJcbiAgICAgICAgc3dpdGNoKHVwZ3JhZGVEQi5vbGRWZXJzaW9uKXtcclxuICAgICAgICAgICAgY2FzZSAwOlxyXG4gICAgICAgICAgICAgICAgdXBncmFkZURCLmNyZWF0ZU9iamVjdFN0b3JlKCdyZXN0YXVyYW50cycsIHtrZXlQYXRoOiAnaWQnfSlcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfSksXHJcbiAgICBwdXRSZXN0YXVyYW50cyhyZXN0YXVyYW50cykge1xyXG4gICAgICAgIC8vaWYgKCFyZXN0YXVyYW50cy5wdXNoKXsgcmVzdGF1cmFudHMgPSBbcmVzdGF1cmFudHNdfTtcclxuICAgICAgICByZXR1cm4gdGhpcy5kYi50aGVuKGRiID0+IHtcclxuICAgICAgICBjb25zdCBzdG9yZSA9IGRiLnRyYW5zYWN0aW9uKCdyZXN0YXVyYW50cycsICdyZWFkd3JpdGUnKS5vYmplY3RTdG9yZSgncmVzdGF1cmFudHMnKTtcclxuICAgICAgICBQcm9taXNlLmFsbChyZXN0YXVyYW50cy5tYXAobmV0d29ya1Jlc3RhdXJhbnQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gc3RvcmUuZ2V0KG5ldHdvcmtSZXN0YXVyYW50LmlkKS50aGVuKGlkYlJlc3RhdXJhbnQgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWlkYlJlc3RhdXJhbnQgfHwgbmV0d29ya1Jlc3RhdXJhbnQudXBkYXRlZEF0ID4gaWRiUmVzdGF1cmFudC51cGRhdGVkQXQpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBzdG9yZS5wdXQobmV0d29ya1Jlc3RhdXJhbnQpOyAgXHJcbiAgICAgICAgICAgIH0gXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pKS50aGVuKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHN0b3JlLmNvbXBsZXRlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSxcclxuICAgIHB1dFJldmlld3MoaWQsIHJldmlld3Mpe1xyXG4gICAgICAgIGlmKGlkKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGIudGhlbihkYiA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzdG9yZSA9IGRiLnRyYW5zYWN0aW9uKCdyZXN0YXVyYW50cycsICdyZWFkd3JpdGUnKS5vYmplY3RTdG9yZSgncmVzdGF1cmFudHMnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0b3JlLmdldChOdW1iZXIoaWQpKS50aGVuKChyZXN0YXVyYW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdGF1cmFudC5yZXZpZXdzID0gcmV2aWV3cztcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RvcmUucHV0KHJlc3RhdXJhbnQpO1xyXG4gICAgICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RvcmUuY29tcGxldGU7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgIH0sXHJcbiAgICBnZXRSZXN0YXVyYW50cyhpZCA9IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRiLnRoZW4oZGIgPT4ge1xyXG4gICAgICAgICAgY29uc3Qgc3RvcmUgPSBkYi50cmFuc2FjdGlvbigncmVzdGF1cmFudHMnKS5vYmplY3RTdG9yZSgncmVzdGF1cmFudHMnKTtcclxuICAgICAgICAgIGlmIChpZCkgcmV0dXJuIHN0b3JlLmdldChOdW1iZXIoaWQpKTtcclxuICAgICAgICAgIHJldHVybiBzdG9yZS5nZXRBbGwoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSxcclxuICAgIGdldFJldmlld3MoaWQgPSB1bmRlZmluZWQpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRiLnRoZW4oKGRiKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHN0b3JlID0gZGIudHJhbnNhY3Rpb24oJ3Jlc3RhdXJhbnRzJykub2JqZWN0U3RvcmUoJ3Jlc3RhdXJhbnRzJyk7XHJcbiAgICAgICAgICAgIGlmKGlkKSByZXR1cm4gc3RvcmUuZ2V0KE51bWJlcihpZCkpLnRoZW4ocmVzdGF1cmFudCA9PiB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdGF1cmFudC5yZXZpZXdzXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH0pXHJcbiAgICB9LFxyXG59O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGJQcm9taXNlOyIsImltcG9ydCBEQkhlbHBlciBmcm9tICcuL2RiaGVscGVyJztcclxuaW1wb3J0IFNFQ1JFVCBmcm9tICcuL3NlY3JldCc7XHJcbmltcG9ydCAnLi9yZWdpc3Rlci1zdyc7XHJcblxyXG5sZXQgcmVzdGF1cmFudHMsXHJcbiAgbmVpZ2hib3Job29kcyxcclxuICBjdWlzaW5lc1xyXG52YXIgbmV3TWFwXHJcbnZhciBtYXJrZXJzID0gW11cclxuXHJcbi8qKlxyXG4gKiBGZXRjaCBuZWlnaGJvcmhvb2RzIGFuZCBjdWlzaW5lcyBhcyBzb29uIGFzIHRoZSBwYWdlIGlzIGxvYWRlZC5cclxuICovXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoZXZlbnQpID0+IHtcclxuICBpbml0TWFwKCk7IC8vIGFkZGVkIFxyXG4gIGZldGNoTmVpZ2hib3Job29kcygpO1xyXG4gIGZldGNoQ3Vpc2luZXMoKTtcclxufSk7XHJcblxyXG4vKipcclxuICogRmV0Y2ggYWxsIG5laWdoYm9yaG9vZHMgYW5kIHNldCB0aGVpciBIVE1MLlxyXG4gKi9cclxuY29uc3QgZmV0Y2hOZWlnaGJvcmhvb2RzID0gKCkgPT4ge1xyXG4gIERCSGVscGVyLmZldGNoTmVpZ2hib3Job29kcygoZXJyb3IsIG5laWdoYm9yaG9vZHMpID0+IHtcclxuICAgIGlmIChlcnJvcikgeyAvLyBHb3QgYW4gZXJyb3JcclxuICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBzZWxmLm5laWdoYm9yaG9vZHMgPSBuZWlnaGJvcmhvb2RzO1xyXG4gICAgICBmaWxsTmVpZ2hib3Job29kc0hUTUwoKTtcclxuICAgIH1cclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFNldCBuZWlnaGJvcmhvb2RzIEhUTUwuXHJcbiAqL1xyXG5jb25zdCBmaWxsTmVpZ2hib3Job29kc0hUTUwgPSAobmVpZ2hib3Job29kcyA9IHNlbGYubmVpZ2hib3Job29kcykgPT4ge1xyXG4gIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZWlnaGJvcmhvb2RzLXNlbGVjdCcpO1xyXG4gIG5laWdoYm9yaG9vZHMuZm9yRWFjaChuZWlnaGJvcmhvb2QgPT4ge1xyXG4gICAgY29uc3Qgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XHJcbiAgICBvcHRpb24uaW5uZXJIVE1MID0gbmVpZ2hib3Job29kO1xyXG4gICAgb3B0aW9uLnZhbHVlID0gbmVpZ2hib3Job29kO1xyXG4gICAgc2VsZWN0LmFwcGVuZChvcHRpb24pO1xyXG4gIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogRmV0Y2ggYWxsIGN1aXNpbmVzIGFuZCBzZXQgdGhlaXIgSFRNTC5cclxuICovXHJcbmNvbnN0IGZldGNoQ3Vpc2luZXMgPSAoKSA9PiB7XHJcbiAgREJIZWxwZXIuZmV0Y2hDdWlzaW5lcygoZXJyb3IsIGN1aXNpbmVzKSA9PiB7XHJcbiAgICBpZiAoZXJyb3IpIHsgLy8gR290IGFuIGVycm9yIVxyXG4gICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHNlbGYuY3Vpc2luZXMgPSBjdWlzaW5lcztcclxuICAgICAgZmlsbEN1aXNpbmVzSFRNTCgpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogU2V0IGN1aXNpbmVzIEhUTUwuXHJcbiAqL1xyXG5jb25zdCBmaWxsQ3Vpc2luZXNIVE1MID0gKGN1aXNpbmVzID0gc2VsZi5jdWlzaW5lcykgPT4ge1xyXG4gIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjdWlzaW5lcy1zZWxlY3QnKTtcclxuXHJcbiAgY3Vpc2luZXMuZm9yRWFjaChjdWlzaW5lID0+IHtcclxuICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xyXG4gICAgb3B0aW9uLmlubmVySFRNTCA9IGN1aXNpbmU7XHJcbiAgICBvcHRpb24udmFsdWUgPSBjdWlzaW5lO1xyXG4gICAgc2VsZWN0LmFwcGVuZChvcHRpb24pO1xyXG4gIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogSW5pdGlhbGl6ZSBsZWFmbGV0IG1hcCwgY2FsbGVkIGZyb20gSFRNTC5cclxuICovXHJcbmNvbnN0IGluaXRNYXAgPSAoKSA9PiB7XHJcbiAgaWYgKCFTRUNSRVQubWFwYm94X2tleSl7XHJcbiAgICBjb25zb2xlLmxvZygnUGxlYXNlIHNlZSBzZWNyZXQtZXhhbXBsZS5qcyBmb3IgaW5zdHJ1Y3Rpb25zIG9uIGhvdyB0byBhZGQgeW91ciBtYXBib3gga2V5Jyk7XHJcbiAgfSBlbHNlIHtcclxuICAgIG5ld01hcCA9IEwubWFwKCdtYXAnLCB7XHJcbiAgICAgIGNlbnRlcjogWzQwLjcyMjIxNiwgLTczLjk4NzUwMV0sXHJcbiAgICAgIHpvb206IDEyLFxyXG4gICAgICBzY3JvbGxXaGVlbFpvb206IGZhbHNlXHJcbiAgICB9KTtcclxuTC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5qcGc3MD9hY2Nlc3NfdG9rZW49e21hcGJveFRva2VufScsIHtcclxuICBtYXBib3hUb2tlbjogU0VDUkVULm1hcGJveF9rZXksXHJcbiAgbWF4Wm9vbTogMTgsXHJcbiAgYXR0cmlidXRpb246ICdNYXAgZGF0YSAmY29weTsgPGEgaHJlZj1cImh0dHBzOi8vd3d3Lm9wZW5zdHJlZXRtYXAub3JnL1wiPk9wZW5TdHJlZXRNYXA8L2E+IGNvbnRyaWJ1dG9ycywgJyArXHJcbiAgICAnPGEgaHJlZj1cImh0dHBzOi8vY3JlYXRpdmVjb21tb25zLm9yZy9saWNlbnNlcy9ieS1zYS8yLjAvXCI+Q0MtQlktU0E8L2E+LCAnICtcclxuICAgICdJbWFnZXJ5IMKpIDxhIGhyZWY9XCJodHRwczovL3d3dy5tYXBib3guY29tL1wiPk1hcGJveDwvYT4nLFxyXG4gIGlkOiAnbWFwYm94LnN0cmVldHMnXHJcbn0pLmFkZFRvKG5ld01hcCk7XHJcblxyXG51cGRhdGVSZXN0YXVyYW50cygpO1xyXG4gIH0gXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBVcGRhdGUgcGFnZSBhbmQgbWFwIGZvciBjdXJyZW50IHJlc3RhdXJhbnRzLlxyXG4gKi9cclxuY29uc3QgdXBkYXRlUmVzdGF1cmFudHMgPSAoKSA9PiB7XHJcbiAgY29uc3QgY1NlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjdWlzaW5lcy1zZWxlY3QnKTtcclxuICBjb25zdCBuU2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25laWdoYm9yaG9vZHMtc2VsZWN0Jyk7XHJcblxyXG4gIGNvbnN0IGNJbmRleCA9IGNTZWxlY3Quc2VsZWN0ZWRJbmRleDtcclxuICBjb25zdCBuSW5kZXggPSBuU2VsZWN0LnNlbGVjdGVkSW5kZXg7XHJcblxyXG4gIGNvbnN0IGN1aXNpbmUgPSBjU2VsZWN0W2NJbmRleF0udmFsdWU7XHJcbiAgY29uc3QgbmVpZ2hib3Job29kID0gblNlbGVjdFtuSW5kZXhdLnZhbHVlO1xyXG5cclxuICBEQkhlbHBlci5mZXRjaFJlc3RhdXJhbnRCeUN1aXNpbmVBbmROZWlnaGJvcmhvb2QoY3Vpc2luZSwgbmVpZ2hib3Job29kLCAoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICBpZiAoZXJyb3IpIHsgLy8gR290IGFuIGVycm9yIVxyXG4gICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJlc2V0UmVzdGF1cmFudHMocmVzdGF1cmFudHMpO1xyXG4gICAgICBmaWxsUmVzdGF1cmFudHNIVE1MKCk7XHJcbiAgICB9XHJcbiAgfSlcclxufVxyXG5cclxuLyoqXHJcbiAqIENsZWFyIGN1cnJlbnQgcmVzdGF1cmFudHMsIHRoZWlyIEhUTUwgYW5kIHJlbW92ZSB0aGVpciBtYXAgbWFya2Vycy5cclxuICovXHJcbmNvbnN0IHJlc2V0UmVzdGF1cmFudHMgPSAocmVzdGF1cmFudHMpID0+IHtcclxuICAvLyBSZW1vdmUgYWxsIHJlc3RhdXJhbnRzXHJcbiAgc2VsZi5yZXN0YXVyYW50cyA9IFtdO1xyXG4gIGNvbnN0IHVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc3RhdXJhbnRzLWxpc3QnKTtcclxuICB1bC5pbm5lckhUTUwgPSAnJztcclxuXHJcbiAgLy8gUmVtb3ZlIGFsbCBtYXAgbWFya2Vyc1xyXG4gIGlmIChzZWxmLm1hcmtlcnMpIHtcclxuICAgIHNlbGYubWFya2Vycy5mb3JFYWNoKG1hcmtlciA9PiBtYXJrZXIucmVtb3ZlKCkpO1xyXG4gIH1cclxuICBzZWxmLm1hcmtlcnMgPSBbXTtcclxuICBzZWxmLnJlc3RhdXJhbnRzID0gcmVzdGF1cmFudHM7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhdGUgYWxsIHJlc3RhdXJhbnRzIEhUTUwgYW5kIGFkZCB0aGVtIHRvIHRoZSB3ZWJwYWdlLlxyXG4gKi9cclxuY29uc3QgZmlsbFJlc3RhdXJhbnRzSFRNTCA9IChyZXN0YXVyYW50cyA9IHNlbGYucmVzdGF1cmFudHMpID0+IHtcclxuICBjb25zdCB1bCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXN0YXVyYW50cy1saXN0Jyk7XHJcbiAgcmVzdGF1cmFudHMuZm9yRWFjaChyZXN0YXVyYW50ID0+IHtcclxuICAgIHVsLmFwcGVuZChjcmVhdGVSZXN0YXVyYW50SFRNTChyZXN0YXVyYW50KSk7XHJcbiAgfSk7XHJcbiAgYWRkTWFya2Vyc1RvTWFwKCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhdGUgcmVzdGF1cmFudCBIVE1MLlxyXG4gKi9cclxuY29uc3QgY3JlYXRlUmVzdGF1cmFudEhUTUwgPSAocmVzdGF1cmFudCkgPT4ge1xyXG4gIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcclxuXHJcbiAgY29uc3QgaW1hZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbWcnKTtcclxuICBpbWFnZS5jbGFzc05hbWUgPSAncmVzdGF1cmFudC1pbWcnO1xyXG4gIGltYWdlLmFsdCA9IGBQaWN0dXJlIG9mICR7cmVzdGF1cmFudC5uYW1lfWA7XHJcbiAgaW1hZ2Uuc3JjID0gREJIZWxwZXIuaW1hZ2VVcmxGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpO1xyXG4gIGltYWdlLnNyY3NldCA9IERCSGVscGVyLmltYWdlU3JjU2V0Rm9yUmVzdGF1cmFudChyZXN0YXVyYW50KTtcclxuICBpbWFnZS5zaXplcyA9IERCSGVscGVyLmltYWdlU2l6ZXNGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpO1xyXG4gIGxpLmFwcGVuZChpbWFnZSk7XHJcblxyXG4gIGNvbnN0IG5hbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoMicpO1xyXG4gIG5hbWUuaW5uZXJIVE1MID0gcmVzdGF1cmFudC5uYW1lO1xyXG4gIGxpLmFwcGVuZChuYW1lKTtcclxuXHJcbiAgY29uc3QgbmVpZ2hib3Job29kID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xyXG4gIG5laWdoYm9yaG9vZC5pbm5lckhUTUwgPSByZXN0YXVyYW50Lm5laWdoYm9yaG9vZDtcclxuICBsaS5hcHBlbmQobmVpZ2hib3Job29kKTtcclxuXHJcbiAgY29uc3QgYWRkcmVzcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcclxuICBhZGRyZXNzLmlubmVySFRNTCA9IHJlc3RhdXJhbnQuYWRkcmVzcztcclxuICBsaS5hcHBlbmQoYWRkcmVzcyk7XHJcblxyXG4gIGNvbnN0IG1vcmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XHJcbiAgbW9yZS5pbm5lckhUTUwgPSAnVmlldyBEZXRhaWxzJztcclxuICBtb3JlLmhyZWYgPSBEQkhlbHBlci51cmxGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpO1xyXG4gIGxpLmFwcGVuZChtb3JlKVxyXG5cclxuICByZXR1cm4gbGlcclxufVxyXG5cclxuLyoqXHJcbiAqIEFkZCBtYXJrZXJzIGZvciBjdXJyZW50IHJlc3RhdXJhbnRzIHRvIHRoZSBtYXAuXHJcbiAqL1xyXG5jb25zdCBhZGRNYXJrZXJzVG9NYXAgPSAocmVzdGF1cmFudHMgPSBzZWxmLnJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgcmVzdGF1cmFudHMuZm9yRWFjaChyZXN0YXVyYW50ID0+IHtcclxuICAgIC8vIEFkZCBtYXJrZXIgdG8gdGhlIG1hcFxyXG4gICAgY29uc3QgbWFya2VyID0gREJIZWxwZXIubWFwTWFya2VyRm9yUmVzdGF1cmFudChyZXN0YXVyYW50LCBuZXdNYXApO1xyXG4gICAgbWFya2VyLm9uKFwiY2xpY2tcIiwgb25DbGljayk7XHJcbiAgICBmdW5jdGlvbiBvbkNsaWNrKCkge1xyXG4gICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IG1hcmtlci5vcHRpb25zLnVybDtcclxuICAgIH1cclxuICAgIHNlbGYubWFya2Vycy5wdXNoKG1hcmtlcik7XHJcbiAgfSk7XHJcblxyXG59ICIsIi8vSW5zdGFsbCBzZXJ2aWNlIHdvcmtlclxyXG5pZiAobmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIpIHtcclxuICAgICAgbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIucmVnaXN0ZXIoJy9zdy5qcycpLnRoZW4oZnVuY3Rpb24ocmVnaXN0cmF0aW9uKSB7XHJcbiAgICAgICAgLy8gUmVnaXN0cmF0aW9uIHdhcyBzdWNjZXNzZnVsXHJcbiAgICAgICAgY29uc29sZS5sb2coJ1NlcnZpY2VXb3JrZXIgcmVnaXN0cmF0aW9uIHN1Y2Nlc3NmdWwgd2l0aCBzY29wZTogJywgcmVnaXN0cmF0aW9uLnNjb3BlKTtcclxuICAgICAgfSkuY2F0Y2goKGVycikgPT4ge1xyXG4gIGNvbnNvbGUubG9nKCdTZXJ2aWNlV29ya2VyIHJlZ2lzdHJhdGlvbiBmYWlsZWQ6ICcsIGVycik7XHJcbn0pOyAgXHJcbn1cclxuXHJcbm5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLnJlYWR5LnRoZW4oc3dSZWdpc3RyYXRpb24gPT4gc3dSZWdpc3RyYXRpb24uc3luYy5yZWdpc3RlcigndG9kb191cGRhdGVkJykpOyIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNFQ1JFVCB7XHJcbiAgICBzdGF0aWMgZ2V0IG1hcGJveF9rZXkoKXtcclxuICAgICAgICByZXR1cm4gJ3BrLmV5SjFJam9pWkdWelpHVnRiMjVvZFNJc0ltRWlPaUpqYW0xdFptWjZNWG93YVc1ck0zRndOV2wyY0hObmNEZzBJbjAuS085VVRleTctQWQ3TjBxbFA5MUNnZyc7XHJcbiAgICB9XHJcbn0iXX0=
