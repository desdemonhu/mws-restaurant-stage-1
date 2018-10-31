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

},{}],5:[function(require,module,exports){
"use strict";

var _dbhelper = _interopRequireDefault(require("./dbhelper"));

var _secret = _interopRequireDefault(require("./secret"));

require("./register-sw");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var restaurant;
var newMap;
var worker = new Worker('js/worker.js');
/**
 * Initialize map as soon as the page is loaded.
 */

document.addEventListener('DOMContentLoaded', function (event) {
  initMap();
  self.addEventListener('submit', submitReview);
});
/**
 * Initialize leaflet map
 */

var initMap = function initMap() {
  fetchRestaurantFromURL(function (error, restaurant) {
    if (error) {
      // Got an error!
      console.error(error);
    } else {
      if (navigator.onLine) {
        try {
          newMap = L.map('map', {
            center: [restaurant.latlng.lat, restaurant.latlng.lng],
            zoom: 16,
            scrollWheelZoom: false
          });
          L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.jpg70?access_token={mapboxToken}', {
            mapboxToken: _secret.default.mapbox_key,
            maxZoom: 18,
            attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' + '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' + 'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
            id: 'mapbox.streets'
          }).addTo(newMap);

          _dbhelper.default.mapMarkerForRestaurant(restaurant, newMap);
        } catch (error) {
          console.log('Unable to initialize map: ', error);
        }
      }

      fillBreadcrumb();
    }
  });
};
/**
 * Get current restaurant from page URL.
 */


var fetchRestaurantFromURL = function fetchRestaurantFromURL(callback) {
  // if (self.restaurant) { // restaurant already fetched!
  //   callback(null, self.restaurant)
  //   return;
  // }
  var id = getParameterByName('id');

  if (!id) {
    // no id found in URL
    error = 'No restaurant id in URL';
    callback(error, null);
  } else {
    _dbhelper.default.fetchRestaurantById(id, function (error, restaurant) {
      self.restaurant = restaurant;

      if (!restaurant) {
        console.error('Unable to fetch restaurant: ', error);
        return;
      }

      _dbhelper.default.fetchReviewsByRestaurant(id, function (error, reviews) {
        self.restaurant.reviews = reviews;

        if (!reviews) {
          console.error('Reviews: ', error);
          return;
        }

        fillRestaurantHTML();
        callback(null, restaurant);
      });
    });
  }
};
/**
 * Create restaurant HTML and add it to the webpage
 */


var fillRestaurantHTML = function fillRestaurantHTML() {
  var restaurant = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.restaurant;
  var name = document.getElementById('restaurant-name');
  name.innerHTML = restaurant.name;
  var address = document.getElementById('restaurant-address');
  address.innerHTML = restaurant.address;
  var image = document.getElementById('restaurant-img');
  image.className = 'restaurant-img';
  image.alt = "Picture of ".concat(restaurant.name);
  image.src = _dbhelper.default.imageUrlForRestaurant(restaurant);
  image.srcset = _dbhelper.default.imageSrcSetForRestaurant(restaurant);
  image.sizes = _dbhelper.default.imageSizesForRestaurant(restaurant);
  var cuisine = document.getElementById('restaurant-cuisine');
  cuisine.innerHTML = restaurant.cuisine_type; // fill operating hours

  if (restaurant.operating_hours) {
    fillRestaurantHoursHTML();
  } // fill reviews


  fillReviewsHTML();
};
/**
 * Create restaurant operating hours HTML table and add it to the webpage.
 */


var fillRestaurantHoursHTML = function fillRestaurantHoursHTML() {
  var operatingHours = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.restaurant.operating_hours;
  var hours = document.getElementById('restaurant-hours');

  for (var key in operatingHours) {
    var row = document.createElement('tr');
    var day = document.createElement('td');
    day.innerHTML = key;
    row.appendChild(day);
    var time = document.createElement('td');
    time.innerHTML = operatingHours[key];
    row.appendChild(time);
    hours.appendChild(row);
  }
};
/**
 * Create all reviews HTML and add them to the webpage.
 */


var fillReviewsHTML = function fillReviewsHTML() {
  var reviews = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.restaurant.reviews;
  var container = document.getElementById('reviews-container');
  var title = document.createElement('h2');
  title.innerHTML = 'Reviews';
  container.appendChild(title);

  if (!reviews) {
    var noReviews = document.createElement('p');
    noReviews.innerHTML = 'No reviews yet!';
    container.appendChild(noReviews);
    return;
  }

  var ul = document.getElementById('reviews-list');
  reviews.forEach(function (review) {
    ul.appendChild(createReviewHTML(review));
  });
  container.appendChild(ul);
};
/**
 * Create review HTML and add it to the webpage.
 */


var createReviewHTML = function createReviewHTML(review) {
  var li = document.createElement('li');
  var name = document.createElement('p');
  name.innerHTML = review.name;
  li.appendChild(name);
  var date = document.createElement('p');
  date.innerHTML = new Date(review.updatedAt);
  li.appendChild(date);
  var rating = document.createElement('p');
  rating.innerHTML = "Rating: ".concat(review.rating);
  li.appendChild(rating);
  var comments = document.createElement('p');
  comments.innerHTML = review.comments;
  li.appendChild(comments);
  return li;
};
/**
 * Add restaurant name to the breadcrumb navigation menu
 */


var fillBreadcrumb = function fillBreadcrumb() {
  var restaurant = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.restaurant;
  var breadcrumb = document.getElementById('breadcrumb');
  var li = document.createElement('li');
  li.innerHTML = restaurant.name;
  breadcrumb.appendChild(li);
};
/**
 * Get a parameter by name from page URL.
 */


var getParameterByName = function getParameterByName(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  var regex = new RegExp("[?&]".concat(name, "(=([^&#]*)|&|#|$)")),
      results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}; ////Submit Review


var submitReview = function submitReview(event) {
  event.preventDefault();
  var review = {};
  var reviewsList = document.getElementById('reviews-list');
  review['name'] = event.target[0].value;
  review['rating'] = event.target[1].value;
  review['comments'] = event.target[2].value;
  review['restaurant_id'] = getParameterByName('id');
  review['updatedAt'] = new Date();
  reviewsList.append(createReviewHTML(review));

  _dbhelper.default.submitReviewByRestaurant(review); // if(window.Worker){
  //   worker.postMessage(review);
  //   console.log('Review posted to worker');
  //   worker.onmessage = function(event){
  //     console.log('Message recieved from worker: ', event.data);
  //   }
  // } 

};

},{"./dbhelper":2,"./register-sw":4,"./secret":6}],6:[function(require,module,exports){
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

},{}]},{},[5])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaWRiL2xpYi9pZGIuanMiLCJzcmMvanMvZGJoZWxwZXIuanMiLCJzcmMvanMvZGJwcm9taXNlLmpzIiwic3JjL2pzL3JlZ2lzdGVyLXN3LmpzIiwic3JjL2pzL3Jlc3RhdXJhbnRfaW5mby5qcyIsInNyYy9qcy9zZWNyZXQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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T0FBTyxDQUFDLENBQUQsQ0FBWixFQUNFLE9BQU8sRUFBUDtBQUNGLFNBQU8sa0JBQWtCLENBQUMsT0FBTyxDQUFDLENBQUQsQ0FBUCxDQUFXLE9BQVgsQ0FBbUIsS0FBbkIsRUFBMEIsR0FBMUIsQ0FBRCxDQUF6QjtBQUNELENBWEQsQyxDQWFBOzs7QUFDQSxJQUFNLFlBQVksR0FBRyxTQUFmLFlBQWUsQ0FBQyxLQUFELEVBQVc7QUFDOUIsRUFBQSxLQUFLLENBQUMsY0FBTjtBQUNBLE1BQUksTUFBTSxHQUFHLEVBQWI7QUFDQSxNQUFJLFdBQVcsR0FBRyxRQUFRLENBQUMsY0FBVCxDQUF3QixjQUF4QixDQUFsQjtBQUVBLEVBQUEsTUFBTSxDQUFDLE1BQUQsQ0FBTixHQUFpQixLQUFLLENBQUMsTUFBTixDQUFhLENBQWIsRUFBZ0IsS0FBakM7QUFDQSxFQUFBLE1BQU0sQ0FBQyxRQUFELENBQU4sR0FBbUIsS0FBSyxDQUFDLE1BQU4sQ0FBYSxDQUFiLEVBQWdCLEtBQW5DO0FBQ0EsRUFBQSxNQUFNLENBQUMsVUFBRCxDQUFOLEdBQXFCLEtBQUssQ0FBQyxNQUFOLENBQWEsQ0FBYixFQUFnQixLQUFyQztBQUNBLEVBQUEsTUFBTSxDQUFDLGVBQUQsQ0FBTixHQUEwQixrQkFBa0IsQ0FBQyxJQUFELENBQTVDO0FBQ0EsRUFBQSxNQUFNLENBQUMsV0FBRCxDQUFOLEdBQXNCLElBQUksSUFBSixFQUF0QjtBQUVBLEVBQUEsV0FBVyxDQUFDLE1BQVosQ0FBbUIsZ0JBQWdCLENBQUMsTUFBRCxDQUFuQzs7QUFDQSxvQkFBUyx3QkFBVCxDQUFrQyxNQUFsQyxFQVo4QixDQWM5QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFDRCxDQXJCRDs7Ozs7Ozs7Ozs7Ozs7OztJQzNNcUIsTTs7Ozs7Ozs7O3dCQUNNO0FBQ25CLGFBQU8sK0ZBQVA7QUFDSCIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIid1c2Ugc3RyaWN0JztcblxuKGZ1bmN0aW9uKCkge1xuICBmdW5jdGlvbiB0b0FycmF5KGFycikge1xuICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnIpO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJvbWlzaWZ5UmVxdWVzdChyZXF1ZXN0KSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgcmVxdWVzdC5vbnN1Y2Nlc3MgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVzb2x2ZShyZXF1ZXN0LnJlc3VsdCk7XG4gICAgICB9O1xuXG4gICAgICByZXF1ZXN0Lm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb21pc2lmeVJlcXVlc3RDYWxsKG9iaiwgbWV0aG9kLCBhcmdzKSB7XG4gICAgdmFyIHJlcXVlc3Q7XG4gICAgdmFyIHAgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIHJlcXVlc3QgPSBvYmpbbWV0aG9kXS5hcHBseShvYmosIGFyZ3MpO1xuICAgICAgcHJvbWlzaWZ5UmVxdWVzdChyZXF1ZXN0KS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgfSk7XG5cbiAgICBwLnJlcXVlc3QgPSByZXF1ZXN0O1xuICAgIHJldHVybiBwO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJvbWlzaWZ5Q3Vyc29yUmVxdWVzdENhbGwob2JqLCBtZXRob2QsIGFyZ3MpIHtcbiAgICB2YXIgcCA9IHByb21pc2lmeVJlcXVlc3RDYWxsKG9iaiwgbWV0aG9kLCBhcmdzKTtcbiAgICByZXR1cm4gcC50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICBpZiAoIXZhbHVlKSByZXR1cm47XG4gICAgICByZXR1cm4gbmV3IEN1cnNvcih2YWx1ZSwgcC5yZXF1ZXN0KTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5UHJvcGVydGllcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBwcm9wZXJ0aWVzKSB7XG4gICAgcHJvcGVydGllcy5mb3JFYWNoKGZ1bmN0aW9uKHByb3ApIHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShQcm94eUNsYXNzLnByb3RvdHlwZSwgcHJvcCwge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHJldHVybiB0aGlzW3RhcmdldFByb3BdW3Byb3BdO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgIHRoaXNbdGFyZ2V0UHJvcF1bcHJvcF0gPSB2YWw7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlSZXF1ZXN0TWV0aG9kcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBDb25zdHJ1Y3RvciwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBpZiAoIShwcm9wIGluIENvbnN0cnVjdG9yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICAgIFByb3h5Q2xhc3MucHJvdG90eXBlW3Byb3BdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBwcm9taXNpZnlSZXF1ZXN0Q2FsbCh0aGlzW3RhcmdldFByb3BdLCBwcm9wLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5TWV0aG9kcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBDb25zdHJ1Y3RvciwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBpZiAoIShwcm9wIGluIENvbnN0cnVjdG9yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICAgIFByb3h5Q2xhc3MucHJvdG90eXBlW3Byb3BdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzW3RhcmdldFByb3BdW3Byb3BdLmFwcGx5KHRoaXNbdGFyZ2V0UHJvcF0sIGFyZ3VtZW50cyk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJveHlDdXJzb3JSZXF1ZXN0TWV0aG9kcyhQcm94eUNsYXNzLCB0YXJnZXRQcm9wLCBDb25zdHJ1Y3RvciwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBpZiAoIShwcm9wIGluIENvbnN0cnVjdG9yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICAgIFByb3h5Q2xhc3MucHJvdG90eXBlW3Byb3BdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBwcm9taXNpZnlDdXJzb3JSZXF1ZXN0Q2FsbCh0aGlzW3RhcmdldFByb3BdLCBwcm9wLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIEluZGV4KGluZGV4KSB7XG4gICAgdGhpcy5faW5kZXggPSBpbmRleDtcbiAgfVxuXG4gIHByb3h5UHJvcGVydGllcyhJbmRleCwgJ19pbmRleCcsIFtcbiAgICAnbmFtZScsXG4gICAgJ2tleVBhdGgnLFxuICAgICdtdWx0aUVudHJ5JyxcbiAgICAndW5pcXVlJ1xuICBdKTtcblxuICBwcm94eVJlcXVlc3RNZXRob2RzKEluZGV4LCAnX2luZGV4JywgSURCSW5kZXgsIFtcbiAgICAnZ2V0JyxcbiAgICAnZ2V0S2V5JyxcbiAgICAnZ2V0QWxsJyxcbiAgICAnZ2V0QWxsS2V5cycsXG4gICAgJ2NvdW50J1xuICBdKTtcblxuICBwcm94eUN1cnNvclJlcXVlc3RNZXRob2RzKEluZGV4LCAnX2luZGV4JywgSURCSW5kZXgsIFtcbiAgICAnb3BlbkN1cnNvcicsXG4gICAgJ29wZW5LZXlDdXJzb3InXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIEN1cnNvcihjdXJzb3IsIHJlcXVlc3QpIHtcbiAgICB0aGlzLl9jdXJzb3IgPSBjdXJzb3I7XG4gICAgdGhpcy5fcmVxdWVzdCA9IHJlcXVlc3Q7XG4gIH1cblxuICBwcm94eVByb3BlcnRpZXMoQ3Vyc29yLCAnX2N1cnNvcicsIFtcbiAgICAnZGlyZWN0aW9uJyxcbiAgICAna2V5JyxcbiAgICAncHJpbWFyeUtleScsXG4gICAgJ3ZhbHVlJ1xuICBdKTtcblxuICBwcm94eVJlcXVlc3RNZXRob2RzKEN1cnNvciwgJ19jdXJzb3InLCBJREJDdXJzb3IsIFtcbiAgICAndXBkYXRlJyxcbiAgICAnZGVsZXRlJ1xuICBdKTtcblxuICAvLyBwcm94eSAnbmV4dCcgbWV0aG9kc1xuICBbJ2FkdmFuY2UnLCAnY29udGludWUnLCAnY29udGludWVQcmltYXJ5S2V5J10uZm9yRWFjaChmdW5jdGlvbihtZXRob2ROYW1lKSB7XG4gICAgaWYgKCEobWV0aG9kTmFtZSBpbiBJREJDdXJzb3IucHJvdG90eXBlKSkgcmV0dXJuO1xuICAgIEN1cnNvci5wcm90b3R5cGVbbWV0aG9kTmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBjdXJzb3IgPSB0aGlzO1xuICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgY3Vyc29yLl9jdXJzb3JbbWV0aG9kTmFtZV0uYXBwbHkoY3Vyc29yLl9jdXJzb3IsIGFyZ3MpO1xuICAgICAgICByZXR1cm4gcHJvbWlzaWZ5UmVxdWVzdChjdXJzb3IuX3JlcXVlc3QpLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICBpZiAoIXZhbHVlKSByZXR1cm47XG4gICAgICAgICAgcmV0dXJuIG5ldyBDdXJzb3IodmFsdWUsIGN1cnNvci5fcmVxdWVzdCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgZnVuY3Rpb24gT2JqZWN0U3RvcmUoc3RvcmUpIHtcbiAgICB0aGlzLl9zdG9yZSA9IHN0b3JlO1xuICB9XG5cbiAgT2JqZWN0U3RvcmUucHJvdG90eXBlLmNyZWF0ZUluZGV4ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBJbmRleCh0aGlzLl9zdG9yZS5jcmVhdGVJbmRleC5hcHBseSh0aGlzLl9zdG9yZSwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgT2JqZWN0U3RvcmUucHJvdG90eXBlLmluZGV4ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBJbmRleCh0aGlzLl9zdG9yZS5pbmRleC5hcHBseSh0aGlzLl9zdG9yZSwgYXJndW1lbnRzKSk7XG4gIH07XG5cbiAgcHJveHlQcm9wZXJ0aWVzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgW1xuICAgICduYW1lJyxcbiAgICAna2V5UGF0aCcsXG4gICAgJ2luZGV4TmFtZXMnLFxuICAgICdhdXRvSW5jcmVtZW50J1xuICBdKTtcblxuICBwcm94eVJlcXVlc3RNZXRob2RzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgSURCT2JqZWN0U3RvcmUsIFtcbiAgICAncHV0JyxcbiAgICAnYWRkJyxcbiAgICAnZGVsZXRlJyxcbiAgICAnY2xlYXInLFxuICAgICdnZXQnLFxuICAgICdnZXRBbGwnLFxuICAgICdnZXRLZXknLFxuICAgICdnZXRBbGxLZXlzJyxcbiAgICAnY291bnQnXG4gIF0pO1xuXG4gIHByb3h5Q3Vyc29yUmVxdWVzdE1ldGhvZHMoT2JqZWN0U3RvcmUsICdfc3RvcmUnLCBJREJPYmplY3RTdG9yZSwgW1xuICAgICdvcGVuQ3Vyc29yJyxcbiAgICAnb3BlbktleUN1cnNvcidcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgSURCT2JqZWN0U3RvcmUsIFtcbiAgICAnZGVsZXRlSW5kZXgnXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIFRyYW5zYWN0aW9uKGlkYlRyYW5zYWN0aW9uKSB7XG4gICAgdGhpcy5fdHggPSBpZGJUcmFuc2FjdGlvbjtcbiAgICB0aGlzLmNvbXBsZXRlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICBpZGJUcmFuc2FjdGlvbi5vbmNvbXBsZXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgIH07XG4gICAgICBpZGJUcmFuc2FjdGlvbi5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlamVjdChpZGJUcmFuc2FjdGlvbi5lcnJvcik7XG4gICAgICB9O1xuICAgICAgaWRiVHJhbnNhY3Rpb24ub25hYm9ydCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZWplY3QoaWRiVHJhbnNhY3Rpb24uZXJyb3IpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIFRyYW5zYWN0aW9uLnByb3RvdHlwZS5vYmplY3RTdG9yZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgT2JqZWN0U3RvcmUodGhpcy5fdHgub2JqZWN0U3RvcmUuYXBwbHkodGhpcy5fdHgsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhUcmFuc2FjdGlvbiwgJ190eCcsIFtcbiAgICAnb2JqZWN0U3RvcmVOYW1lcycsXG4gICAgJ21vZGUnXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhUcmFuc2FjdGlvbiwgJ190eCcsIElEQlRyYW5zYWN0aW9uLCBbXG4gICAgJ2Fib3J0J1xuICBdKTtcblxuICBmdW5jdGlvbiBVcGdyYWRlREIoZGIsIG9sZFZlcnNpb24sIHRyYW5zYWN0aW9uKSB7XG4gICAgdGhpcy5fZGIgPSBkYjtcbiAgICB0aGlzLm9sZFZlcnNpb24gPSBvbGRWZXJzaW9uO1xuICAgIHRoaXMudHJhbnNhY3Rpb24gPSBuZXcgVHJhbnNhY3Rpb24odHJhbnNhY3Rpb24pO1xuICB9XG5cbiAgVXBncmFkZURCLnByb3RvdHlwZS5jcmVhdGVPYmplY3RTdG9yZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgT2JqZWN0U3RvcmUodGhpcy5fZGIuY3JlYXRlT2JqZWN0U3RvcmUuYXBwbHkodGhpcy5fZGIsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhVcGdyYWRlREIsICdfZGInLCBbXG4gICAgJ25hbWUnLFxuICAgICd2ZXJzaW9uJyxcbiAgICAnb2JqZWN0U3RvcmVOYW1lcydcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKFVwZ3JhZGVEQiwgJ19kYicsIElEQkRhdGFiYXNlLCBbXG4gICAgJ2RlbGV0ZU9iamVjdFN0b3JlJyxcbiAgICAnY2xvc2UnXG4gIF0pO1xuXG4gIGZ1bmN0aW9uIERCKGRiKSB7XG4gICAgdGhpcy5fZGIgPSBkYjtcbiAgfVxuXG4gIERCLnByb3RvdHlwZS50cmFuc2FjdGlvbiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgVHJhbnNhY3Rpb24odGhpcy5fZGIudHJhbnNhY3Rpb24uYXBwbHkodGhpcy5fZGIsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhEQiwgJ19kYicsIFtcbiAgICAnbmFtZScsXG4gICAgJ3ZlcnNpb24nLFxuICAgICdvYmplY3RTdG9yZU5hbWVzJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoREIsICdfZGInLCBJREJEYXRhYmFzZSwgW1xuICAgICdjbG9zZSdcbiAgXSk7XG5cbiAgLy8gQWRkIGN1cnNvciBpdGVyYXRvcnNcbiAgLy8gVE9ETzogcmVtb3ZlIHRoaXMgb25jZSBicm93c2VycyBkbyB0aGUgcmlnaHQgdGhpbmcgd2l0aCBwcm9taXNlc1xuICBbJ29wZW5DdXJzb3InLCAnb3BlbktleUN1cnNvciddLmZvckVhY2goZnVuY3Rpb24oZnVuY05hbWUpIHtcbiAgICBbT2JqZWN0U3RvcmUsIEluZGV4XS5mb3JFYWNoKGZ1bmN0aW9uKENvbnN0cnVjdG9yKSB7XG4gICAgICAvLyBEb24ndCBjcmVhdGUgaXRlcmF0ZUtleUN1cnNvciBpZiBvcGVuS2V5Q3Vyc29yIGRvZXNuJ3QgZXhpc3QuXG4gICAgICBpZiAoIShmdW5jTmFtZSBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG5cbiAgICAgIENvbnN0cnVjdG9yLnByb3RvdHlwZVtmdW5jTmFtZS5yZXBsYWNlKCdvcGVuJywgJ2l0ZXJhdGUnKV0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSB0b0FycmF5KGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3NbYXJncy5sZW5ndGggLSAxXTtcbiAgICAgICAgdmFyIG5hdGl2ZU9iamVjdCA9IHRoaXMuX3N0b3JlIHx8IHRoaXMuX2luZGV4O1xuICAgICAgICB2YXIgcmVxdWVzdCA9IG5hdGl2ZU9iamVjdFtmdW5jTmFtZV0uYXBwbHkobmF0aXZlT2JqZWN0LCBhcmdzLnNsaWNlKDAsIC0xKSk7XG4gICAgICAgIHJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgY2FsbGJhY2socmVxdWVzdC5yZXN1bHQpO1xuICAgICAgICB9O1xuICAgICAgfTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gcG9seWZpbGwgZ2V0QWxsXG4gIFtJbmRleCwgT2JqZWN0U3RvcmVdLmZvckVhY2goZnVuY3Rpb24oQ29uc3RydWN0b3IpIHtcbiAgICBpZiAoQ29uc3RydWN0b3IucHJvdG90eXBlLmdldEFsbCkgcmV0dXJuO1xuICAgIENvbnN0cnVjdG9yLnByb3RvdHlwZS5nZXRBbGwgPSBmdW5jdGlvbihxdWVyeSwgY291bnQpIHtcbiAgICAgIHZhciBpbnN0YW5jZSA9IHRoaXM7XG4gICAgICB2YXIgaXRlbXMgPSBbXTtcblxuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUpIHtcbiAgICAgICAgaW5zdGFuY2UuaXRlcmF0ZUN1cnNvcihxdWVyeSwgZnVuY3Rpb24oY3Vyc29yKSB7XG4gICAgICAgICAgaWYgKCFjdXJzb3IpIHtcbiAgICAgICAgICAgIHJlc29sdmUoaXRlbXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpdGVtcy5wdXNoKGN1cnNvci52YWx1ZSk7XG5cbiAgICAgICAgICBpZiAoY291bnQgIT09IHVuZGVmaW5lZCAmJiBpdGVtcy5sZW5ndGggPT0gY291bnQpIHtcbiAgICAgICAgICAgIHJlc29sdmUoaXRlbXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjdXJzb3IuY29udGludWUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9O1xuICB9KTtcblxuICB2YXIgZXhwID0ge1xuICAgIG9wZW46IGZ1bmN0aW9uKG5hbWUsIHZlcnNpb24sIHVwZ3JhZGVDYWxsYmFjaykge1xuICAgICAgdmFyIHAgPSBwcm9taXNpZnlSZXF1ZXN0Q2FsbChpbmRleGVkREIsICdvcGVuJywgW25hbWUsIHZlcnNpb25dKTtcbiAgICAgIHZhciByZXF1ZXN0ID0gcC5yZXF1ZXN0O1xuXG4gICAgICBpZiAocmVxdWVzdCkge1xuICAgICAgICByZXF1ZXN0Lm9udXBncmFkZW5lZWRlZCA9IGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgaWYgKHVwZ3JhZGVDYWxsYmFjaykge1xuICAgICAgICAgICAgdXBncmFkZUNhbGxiYWNrKG5ldyBVcGdyYWRlREIocmVxdWVzdC5yZXN1bHQsIGV2ZW50Lm9sZFZlcnNpb24sIHJlcXVlc3QudHJhbnNhY3Rpb24pKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwLnRoZW4oZnVuY3Rpb24oZGIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEQihkYik7XG4gICAgICB9KTtcbiAgICB9LFxuICAgIGRlbGV0ZTogZnVuY3Rpb24obmFtZSkge1xuICAgICAgcmV0dXJuIHByb21pc2lmeVJlcXVlc3RDYWxsKGluZGV4ZWREQiwgJ2RlbGV0ZURhdGFiYXNlJywgW25hbWVdKTtcbiAgICB9XG4gIH07XG5cbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBleHA7XG4gICAgbW9kdWxlLmV4cG9ydHMuZGVmYXVsdCA9IG1vZHVsZS5leHBvcnRzO1xuICB9XG4gIGVsc2Uge1xuICAgIHNlbGYuaWRiID0gZXhwO1xuICB9XG59KCkpO1xuIiwiaW1wb3J0IGRiUHJvbWlzZSBmcm9tICcuL2RicHJvbWlzZSc7XHJcbi8qKlxyXG4gKiBDb21tb24gZGF0YWJhc2UgaGVscGVyIGZ1bmN0aW9ucy5cclxuICovXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERCSGVscGVyIHtcclxuXHJcbiAgLyoqXHJcbiAgICogRGF0YWJhc2UgVVJMLlxyXG4gICAqIENoYW5nZSB0aGlzIHRvIHJlc3RhdXJhbnRzLmpzb24gZmlsZSBsb2NhdGlvbiBvbiB5b3VyIHNlcnZlci5cclxuICAgKi9cclxuICBzdGF0aWMgZ2V0IERBVEFCQVNFX1VSTCgpIHtcclxuICAgIGNvbnN0IHBvcnQgPSA4MDAwIC8vIENoYW5nZSB0aGlzIHRvIHlvdXIgc2VydmVyIHBvcnRcclxuICAgIHJldHVybiBgaHR0cDovL2xvY2FsaG9zdDoke3BvcnR9L2RhdGEvcmVzdGF1cmFudHMuanNvbmA7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgZ2V0IEFQSV9VUkwoKXtcclxuICAgIGNvbnN0IHBvcnQgPSAxMzM3O1xyXG4gICAgcmV0dXJuIGBodHRwOi8vbG9jYWxob3N0OiR7cG9ydH1gXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCBhbGwgcmVzdGF1cmFudHMuXHJcbiAgICovXHJcbiAgLy8gc3RhdGljIGZldGNoUmVzdGF1cmFudHMoY2FsbGJhY2spIHtcclxuICAvLyAgIGxldCB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcclxuICAvLyAgIHhoci5vcGVuKCdHRVQnLCBgJHtEQkhlbHBlci5BUElfVVJMfS9yZXN0YXVyYW50c2ApO1xyXG4gIC8vICAgeGhyLm9ubG9hZCA9ICgpID0+IHtcclxuICAvLyAgICAgaWYgKHhoci5zdGF0dXMgPT09IDIwMCkgeyAvLyBHb3QgYSBzdWNjZXNzIHJlc3BvbnNlIGZyb20gc2VydmVyIVxyXG4gIC8vICAgICAgIGNvbnN0IHJlc3RhdXJhbnRzID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KTtcclxuICAvLyAgICAgICBkYlByb21pc2UucHV0UmVzdGF1cmFudHMocmVzdGF1cmFudHMpO1xyXG4gIC8vICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnRzKTtcclxuICAvLyAgICAgfSBlbHNlIHtcclxuICAvLyAgICAgICAgZGJQcm9taXNlLmdldFJlc3RhdXJhbnRzKCkudGhlbihyZXN0YXVyYW50cyA9PntcclxuICAvLyAgICAgICAgIGlmKHJlc3RhdXJhbnRzLmxlbmd0aCA+IDApe1xyXG4gIC8vICAgICAgICAgICBjYWxsYmFjayhudWxsLCByZXN0YXVyYW50cyk7XHJcbiAgLy8gICAgICAgICB9IGVsc2Uge1xyXG4gIC8vICAgICAgICAgICBjb25zdCBlcnJvciA9IChgUmVxdWVzdCBmYWlsZWQuIFJldHVybmVkIHN0YXR1cyBvZiAke3hoci5zdGF0dXN9YCk7XHJcbiAgLy8gICAgICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAvLyAgICAgICAgIH1cclxuICAvLyAgICAgICB9KTsgXHJcbiAgLy8gICAgIH1cclxuICAvLyAgIH07XHJcbiAgLy8gICB4aHIuc2VuZCgpO1xyXG4gIC8vIH1cclxuICBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50cyhjYWxsYmFjayl7XHJcbiAgICBmZXRjaChgJHtEQkhlbHBlci5BUElfVVJMfS9yZXN0YXVyYW50c2ApLnRoZW4oKHJlc3BvbnNlKT0+IHtcclxuICAgICAgICBjb25zdCByID0gcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgIHIudGhlbigocmVzdGF1cmFudHMpID0+IHtcclxuICAgICAgICAgIGRiUHJvbWlzZS5wdXRSZXN0YXVyYW50cyhyZXN0YXVyYW50cyk7XHJcbiAgICAgICAgICBjYWxsYmFjayhudWxsLCByZXN0YXVyYW50cyk7XHJcbiAgICAgICAgfSlcclxuICAgIH0pLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICBkYlByb21pc2UuZ2V0UmVzdGF1cmFudHMoKS50aGVuKChyZXN0YXVyYW50cyk9PntcclxuICAgICAgICBpZihyZXN0YXVyYW50cy5sZW5ndGggPiAwKXtcclxuICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnRzKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gJ1VuYWJsZSB0byBnZXQgcmVzdGF1cmFudHMgZnJvbSBJbmRleERCOiAnXHJcbiAgICAgICAgICBjYWxsYmFjayhlcnJvck1lc3NhZ2UsIGVycm9yLCBudWxsKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pXHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggYSByZXN0YXVyYW50IGJ5IGl0cyBJRC5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50QnlJZChpZCwgY2FsbGJhY2spIHtcclxuICAgIGZldGNoKGAke0RCSGVscGVyLkFQSV9VUkx9L3Jlc3RhdXJhbnRzLyR7aWR9YCkudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHJldHVybiBQcm9taXNlLnJlamVjdChcIlJlc3RhdXJhbnQgY291bGRuJ3QgYmUgZmV0Y2hlZCBmcm9tIG5ldHdvcmtcIik7XHJcbiAgICAgIHJldHVybiByZXNwb25zZS5qc29uKCk7XHJcbiAgICB9KVxyXG4gICAgLnRoZW4oKHJlc3RhdXJhbnQpPT4ge1xyXG4gICAgICBkYlByb21pc2UucHV0UmVzdGF1cmFudHMocmVzdGF1cmFudClcclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnQpO1xyXG4gICAgfSkuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGlkLCBlcnJvcik7XHJcbiAgICAgIGRiUHJvbWlzZS5nZXRSZXN0YXVyYW50cyhpZCkudGhlbigocmVzdGF1cmFudCk9PntcclxuICAgICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgZmV0Y2hSZXZpZXdzQnlSZXN0YXVyYW50KGlkLCBjYWxsYmFjayl7XHJcbiAgICBmZXRjaChgJHtEQkhlbHBlci5BUElfVVJMfS9yZXZpZXdzLz9yZXN0YXVyYW50X2lkPSR7aWR9YCkudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHJldHVybiBQcm9taXNlLnJlamVjdChcIlJlc3RhdXJhbnQgUmV2aWV3cyBjb3VsZG4ndCBiZSBmZXRjaGVkIGZyb20gbmV0d29ya1wiKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxuICAgIH0pLnRoZW4oKHJldmlld3MpPT4ge1xyXG4gICAgICBkYlByb21pc2UuZ2V0UmV2aWV3cyhpZCkudGhlbigoZGJSZXZpZXdzKT0+e1xyXG4gICAgICAgIGlmKHJldmlld3MubGVuZ3RoID49IGRiUmV2aWV3cy5sZW5ndGgpe1xyXG4gICAgICAgICAgZGJQcm9taXNlLnB1dFJldmlld3MoaWQsIHJldmlld3MpLnRoZW4oKCkgPT57XHJcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhudWxsLCByZXZpZXdzKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfWVsc2Uge1xyXG4gICAgICAgICAgZGJQcm9taXNlLmdldFJldmlld3MoaWQpLnRoZW4oKHJldmlld3MpPT57XHJcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhudWxsLCByZXZpZXdzKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgIH0pLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICBjb25zb2xlLmxvZyhlcnJvcik7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIHJlc3RhdXJhbnRzIGJ5IGEgY3Vpc2luZSB0eXBlIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaFJlc3RhdXJhbnRCeUN1aXNpbmUoY3Vpc2luZSwgY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50cyAgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmdcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRmlsdGVyIHJlc3RhdXJhbnRzIHRvIGhhdmUgb25seSBnaXZlbiBjdWlzaW5lIHR5cGVcclxuICAgICAgICBjb25zdCByZXN1bHRzID0gcmVzdGF1cmFudHMuZmlsdGVyKHIgPT4gci5jdWlzaW5lX3R5cGUgPT0gY3Vpc2luZSk7XHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0cyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggcmVzdGF1cmFudHMgYnkgYSBuZWlnaGJvcmhvb2Qgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudEJ5TmVpZ2hib3Job29kKG5laWdoYm9yaG9vZCwgY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50c1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBGaWx0ZXIgcmVzdGF1cmFudHMgdG8gaGF2ZSBvbmx5IGdpdmVuIG5laWdoYm9yaG9vZFxyXG4gICAgICAgIGNvbnN0IHJlc3VsdHMgPSByZXN0YXVyYW50cy5maWx0ZXIociA9PiByLm5laWdoYm9yaG9vZCA9PSBuZWlnaGJvcmhvb2QpO1xyXG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdHMpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIHJlc3RhdXJhbnRzIGJ5IGEgY3Vpc2luZSBhbmQgYSBuZWlnaGJvcmhvb2Qgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudEJ5Q3Vpc2luZUFuZE5laWdoYm9yaG9vZChjdWlzaW5lLCBuZWlnaGJvcmhvb2QsIGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbGV0IHJlc3VsdHMgPSByZXN0YXVyYW50c1xyXG4gICAgICAgIGlmIChjdWlzaW5lICE9ICdhbGwnKSB7IC8vIGZpbHRlciBieSBjdWlzaW5lXHJcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIociA9PiByLmN1aXNpbmVfdHlwZSA9PSBjdWlzaW5lKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKG5laWdoYm9yaG9vZCAhPSAnYWxsJykgeyAvLyBmaWx0ZXIgYnkgbmVpZ2hib3Job29kXHJcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIociA9PiByLm5laWdoYm9yaG9vZCA9PSBuZWlnaGJvcmhvb2QpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYWxsYmFjayhudWxsLCByZXN1bHRzKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCBhbGwgbmVpZ2hib3Job29kcyB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZy5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hOZWlnaGJvcmhvb2RzKGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gR2V0IGFsbCBuZWlnaGJvcmhvb2RzIGZyb20gYWxsIHJlc3RhdXJhbnRzXHJcbiAgICAgICAgY29uc3QgbmVpZ2hib3Job29kcyA9IHJlc3RhdXJhbnRzLm1hcCgodiwgaSkgPT4gcmVzdGF1cmFudHNbaV0ubmVpZ2hib3Job29kKVxyXG4gICAgICAgIC8vIFJlbW92ZSBkdXBsaWNhdGVzIGZyb20gbmVpZ2hib3Job29kc1xyXG4gICAgICAgIGNvbnN0IHVuaXF1ZU5laWdoYm9yaG9vZHMgPSBuZWlnaGJvcmhvb2RzLmZpbHRlcigodiwgaSkgPT4gbmVpZ2hib3Job29kcy5pbmRleE9mKHYpID09IGkpXHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgdW5pcXVlTmVpZ2hib3Job29kcyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggYWxsIGN1aXNpbmVzIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaEN1aXNpbmVzKGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gR2V0IGFsbCBjdWlzaW5lcyBmcm9tIGFsbCByZXN0YXVyYW50c1xyXG4gICAgICAgIGNvbnN0IGN1aXNpbmVzID0gcmVzdGF1cmFudHMubWFwKCh2LCBpKSA9PiByZXN0YXVyYW50c1tpXS5jdWlzaW5lX3R5cGUpXHJcbiAgICAgICAgLy8gUmVtb3ZlIGR1cGxpY2F0ZXMgZnJvbSBjdWlzaW5lc1xyXG4gICAgICAgIGNvbnN0IHVuaXF1ZUN1aXNpbmVzID0gY3Vpc2luZXMuZmlsdGVyKCh2LCBpKSA9PiBjdWlzaW5lcy5pbmRleE9mKHYpID09IGkpXHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgdW5pcXVlQ3Vpc2luZXMpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJlc3RhdXJhbnQgcGFnZSBVUkwuXHJcbiAgICovXHJcbiAgc3RhdGljIHVybEZvclJlc3RhdXJhbnQocmVzdGF1cmFudCkge1xyXG4gICAgcmV0dXJuIChgLi9yZXN0YXVyYW50Lmh0bWw/aWQ9JHtyZXN0YXVyYW50LmlkfWApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVzdGF1cmFudCBpbWFnZSBVUkwuXHJcbiAgICovXHJcbiAgc3RhdGljIGltYWdlVXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KSB7XHJcbiAgICByZXR1cm4gKGAvaW1nLyR7cmVzdGF1cmFudC5waG90b2dyYXBoIHx8IHJlc3RhdXJhbnQuaWR9LW1lZGl1bS5qcGdgKTtcclxuICB9XHJcblxyXG4gIHN0YXRpYyBpbWFnZVNyY1NldEZvclJlc3RhdXJhbnQocmVzdGF1cmFudCl7XHJcbiAgICBjb25zdCBpbWdTcmMgPSBgL2ltZy8ke3Jlc3RhdXJhbnQucGhvdG9ncmFwaCB8fCByZXN0YXVyYW50LmlkfWA7XHJcbiAgICByZXR1cm4gYCR7aW1nU3JjfS1zbWFsbC5qcGcgMzAwdyxcclxuICAgICAgICAgICAgJHtpbWdTcmN9LW1lZGl1bS5qcGcgNjAwdyxcclxuICAgICAgICAgICAgJHtpbWdTcmN9LWxhcmdlLmpwZyA4MDB3YFxyXG4gIH1cclxuXHJcbiAgc3RhdGljIGltYWdlU2l6ZXNGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpIHtcclxuICAgIHJldHVybiBgKG1heC13aWR0aDogMzYwcHgpIDI4MHB4LFxyXG4gICAgICAgICAgICAobWF4LXdpZHRoOiA2MDBweCkgNjAwcHgsXHJcbiAgICAgICAgICAgIDQwMHB4YDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIE1hcCBtYXJrZXIgZm9yIGEgcmVzdGF1cmFudC5cclxuICAgKi9cclxuICAgc3RhdGljIG1hcE1hcmtlckZvclJlc3RhdXJhbnQocmVzdGF1cmFudCwgbWFwKSB7XHJcbiAgICAvLyBodHRwczovL2xlYWZsZXRqcy5jb20vcmVmZXJlbmNlLTEuMy4wLmh0bWwjbWFya2VyICBcclxuICAgIGNvbnN0IG1hcmtlciA9IG5ldyBMLm1hcmtlcihbcmVzdGF1cmFudC5sYXRsbmcubGF0LCByZXN0YXVyYW50LmxhdGxuZy5sbmddLFxyXG4gICAgICB7dGl0bGU6IHJlc3RhdXJhbnQubmFtZSxcclxuICAgICAgYWx0OiByZXN0YXVyYW50Lm5hbWUsXHJcbiAgICAgIHVybDogREJIZWxwZXIudXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KVxyXG4gICAgICB9KVxyXG4gICAgICBtYXJrZXIuYWRkVG8obWFwKTtcclxuICAgIHJldHVybiBtYXJrZXI7XHJcbiAgfSBcclxuICAvKiBzdGF0aWMgbWFwTWFya2VyRm9yUmVzdGF1cmFudChyZXN0YXVyYW50LCBtYXApIHtcclxuICAgIGNvbnN0IG1hcmtlciA9IG5ldyBnb29nbGUubWFwcy5NYXJrZXIoe1xyXG4gICAgICBwb3NpdGlvbjogcmVzdGF1cmFudC5sYXRsbmcsXHJcbiAgICAgIHRpdGxlOiByZXN0YXVyYW50Lm5hbWUsXHJcbiAgICAgIHVybDogREJIZWxwZXIudXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KSxcclxuICAgICAgbWFwOiBtYXAsXHJcbiAgICAgIGFuaW1hdGlvbjogZ29vZ2xlLm1hcHMuQW5pbWF0aW9uLkRST1B9XHJcbiAgICApO1xyXG4gICAgcmV0dXJuIG1hcmtlcjtcclxuICB9ICovXHJcblxyXG4gIHN0YXRpYyBzdWJtaXRSZXZpZXdCeVJlc3RhdXJhbnQocmV2aWV3KSB7XHJcbiAgICBmZXRjaChgJHtEQkhlbHBlci5BUElfVVJMfS9yZXZpZXdzYCwge1xyXG4gICAgICBtZXRob2Q6J1BPU1QnLFxyXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgXCJyZXN0YXVyYW50X2lkXCI6IHJldmlldy5yZXN0YXVyYW50X2lkLFxyXG4gICAgICAgIFwibmFtZVwiOiByZXZpZXcubmFtZSxcclxuICAgICAgICBcInJhdGluZ1wiOiByZXZpZXcucmF0aW5nLFxyXG4gICAgICAgIFwiY29tbWVudHNcIjogcmV2aWV3LmNvbW1lbnRzXHJcbiAgICB9KVxyXG4gICAgfSkudGhlbigocmVzcG9uc2UpID0+IHtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gICAgfSkuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgIGRiUHJvbWlzZS5nZXRSZXZpZXdzKHJldmlldy5yZXN0YXVyYW50X2lkKS50aGVuKChyZXZpZXdzKT0+e1xyXG4gICAgICAgIGxldCBhbGxSZXZpZXdzID0gcmV2aWV3cy5jb25jYXQocmV2aWV3KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhhbGxSZXZpZXdzKTtcclxuICAgICAgICBcclxuICAgICAgICBkYlByb21pc2UucHV0UmV2aWV3cyhyZXZpZXcucmVzdGF1cmFudF9pZCwgYWxsUmV2aWV3cyk7XHJcbiAgICAgIH0pXHJcbiAgICB9KSBcclxuICB9XHJcblxyXG4gIHN0YXRpYyB1cGRhdGVEYXRhYmFzZSgpe1xyXG4gICAgZGJQcm9taXNlLmdldFJlc3RhdXJhbnRzKCkudGhlbigocmVzdGF1cmFudHMpPT4ge1xyXG4gICAgICByZXN0YXVyYW50cy5mb3JFYWNoKHJlc3RhdXJhbnQgPT4ge1xyXG4gICAgICAgIGlmKHJlc3RhdXJhbnQucmV2aWV3cyl7XHJcbiAgICAgICAgICByZXN0YXVyYW50LnJldmlld3MuZm9yRWFjaCgocmV2aWV3KSA9PiB7XHJcbiAgICAgICAgICAgIGlmKCFyZXZpZXcuaWQpe1xyXG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdpbiB1cGRhdGVEYXRhYmFzZTogJyxyZXZpZXcpO1xyXG4gICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIHRoaXMuc3VibWl0UmV2aWV3QnlSZXN0YXVyYW50KHJldmlldyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH0pXHJcbiAgfVxyXG5cclxufSIsImltcG9ydCBJREIgZnJvbSAnaWRiJztcclxuXHJcbmNvbnN0IGRiUHJvbWlzZSA9IHtcclxuICAgIGRiIDogSURCLm9wZW4oJ3Jlc3RhdXJhbnQtcmV2aWV3cy1kYicsIDIsICh1cGdyYWRlREIpID0+e1xyXG4gICAgICAgIHN3aXRjaCh1cGdyYWRlREIub2xkVmVyc2lvbil7XHJcbiAgICAgICAgICAgIGNhc2UgMDpcclxuICAgICAgICAgICAgICAgIHVwZ3JhZGVEQi5jcmVhdGVPYmplY3RTdG9yZSgncmVzdGF1cmFudHMnLCB7a2V5UGF0aDogJ2lkJ30pXHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH0pLFxyXG4gICAgcHV0UmVzdGF1cmFudHMocmVzdGF1cmFudHMpIHtcclxuICAgICAgICAvL2lmICghcmVzdGF1cmFudHMucHVzaCl7IHJlc3RhdXJhbnRzID0gW3Jlc3RhdXJhbnRzXX07XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGIudGhlbihkYiA9PiB7XHJcbiAgICAgICAgY29uc3Qgc3RvcmUgPSBkYi50cmFuc2FjdGlvbigncmVzdGF1cmFudHMnLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoJ3Jlc3RhdXJhbnRzJyk7XHJcbiAgICAgICAgUHJvbWlzZS5hbGwocmVzdGF1cmFudHMubWFwKG5ldHdvcmtSZXN0YXVyYW50ID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHN0b3JlLmdldChuZXR3b3JrUmVzdGF1cmFudC5pZCkudGhlbihpZGJSZXN0YXVyYW50ID0+IHtcclxuICAgICAgICAgICAgaWYgKCFpZGJSZXN0YXVyYW50IHx8IG5ldHdvcmtSZXN0YXVyYW50LnVwZGF0ZWRBdCA+IGlkYlJlc3RhdXJhbnQudXBkYXRlZEF0KSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RvcmUucHV0KG5ldHdvcmtSZXN0YXVyYW50KTsgIFxyXG4gICAgICAgICAgICB9IFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KSkudGhlbihmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBzdG9yZS5jb21wbGV0ZTtcclxuICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH0sXHJcbiAgICBwdXRSZXZpZXdzKGlkLCByZXZpZXdzKXtcclxuICAgICAgICBpZihpZCl7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmRiLnRoZW4oZGIgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc3RvcmUgPSBkYi50cmFuc2FjdGlvbigncmVzdGF1cmFudHMnLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoJ3Jlc3RhdXJhbnRzJylcclxuICAgICAgICAgICAgICAgIHJldHVybiBzdG9yZS5nZXQoTnVtYmVyKGlkKSkudGhlbigocmVzdGF1cmFudCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3RhdXJhbnQucmV2aWV3cyA9IHJldmlld3M7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN0b3JlLnB1dChyZXN0YXVyYW50KTtcclxuICAgICAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHN0b3JlLmNvbXBsZXRlO1xyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG4gICAgZ2V0UmVzdGF1cmFudHMoaWQgPSB1bmRlZmluZWQpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kYi50aGVuKGRiID0+IHtcclxuICAgICAgICAgIGNvbnN0IHN0b3JlID0gZGIudHJhbnNhY3Rpb24oJ3Jlc3RhdXJhbnRzJywgJ3JlYWRvbmx5Jykub2JqZWN0U3RvcmUoJ3Jlc3RhdXJhbnRzJyk7XHJcbiAgICAgICAgICBpZiAoaWQpIHJldHVybiBzdG9yZS5nZXQoTnVtYmVyKGlkKSk7XHJcbiAgICAgICAgICByZXR1cm4gc3RvcmUuZ2V0QWxsKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0sXHJcbiAgICBnZXRSZXZpZXdzKGlkID0gdW5kZWZpbmVkKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5kYi50aGVuKChkYikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBzdG9yZSA9IGRiLnRyYW5zYWN0aW9uKCdyZXN0YXVyYW50cycsICdyZWFkb25seScpLm9iamVjdFN0b3JlKCdyZXN0YXVyYW50cycpO1xyXG4gICAgICAgICAgICBpZihpZCkgcmV0dXJuIHN0b3JlLmdldChOdW1iZXIoaWQpKS50aGVuKHJlc3RhdXJhbnQgPT4ge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3RhdXJhbnQucmV2aWV3c1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9KVxyXG4gICAgfSxcclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRiUHJvbWlzZTsiLCIvL0luc3RhbGwgc2VydmljZSB3b3JrZXJcclxuaWYgKG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyKSB7XHJcbiAgICAgIG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLnJlZ2lzdGVyKCcvc3cuanMnKS50aGVuKGZ1bmN0aW9uKHJlZ2lzdHJhdGlvbikge1xyXG4gICAgICAgIC8vIFJlZ2lzdHJhdGlvbiB3YXMgc3VjY2Vzc2Z1bFxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlV29ya2VyIHJlZ2lzdHJhdGlvbiBzdWNjZXNzZnVsIHdpdGggc2NvcGU6ICcsIHJlZ2lzdHJhdGlvbi5zY29wZSk7XHJcbiAgICAgIH0pLmNhdGNoKChlcnIpID0+IHtcclxuICBjb25zb2xlLmxvZygnU2VydmljZVdvcmtlciByZWdpc3RyYXRpb24gZmFpbGVkOiAnLCBlcnIpO1xyXG59KTsgIFxyXG59XHJcblxyXG5uYXZpZ2F0b3Iuc2VydmljZVdvcmtlci5yZWFkeS50aGVuKHN3UmVnaXN0cmF0aW9uID0+IHN3UmVnaXN0cmF0aW9uLnN5bmMucmVnaXN0ZXIoJ3RvZG9fdXBkYXRlZCcpKTsiLCJpbXBvcnQgREJIZWxwZXIgZnJvbSAnLi9kYmhlbHBlcic7XHJcbmltcG9ydCBTRUNSRVQgZnJvbSAnLi9zZWNyZXQnO1xyXG5pbXBvcnQgJy4vcmVnaXN0ZXItc3cnO1xyXG5cclxubGV0IHJlc3RhdXJhbnQ7XHJcbnZhciBuZXdNYXA7XHJcbmNvbnN0IHdvcmtlciA9IG5ldyBXb3JrZXIoJ2pzL3dvcmtlci5qcycpO1xyXG5cclxuLyoqXHJcbiAqIEluaXRpYWxpemUgbWFwIGFzIHNvb24gYXMgdGhlIHBhZ2UgaXMgbG9hZGVkLlxyXG4gKi9cclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIChldmVudCkgPT4geyAgXHJcbiAgaW5pdE1hcCgpO1xyXG4gIHNlbGYuYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0Jywgc3VibWl0UmV2aWV3KTtcclxufSk7XHJcblxyXG4vKipcclxuICogSW5pdGlhbGl6ZSBsZWFmbGV0IG1hcFxyXG4gKi9cclxuY29uc3QgaW5pdE1hcCA9ICgpID0+IHtcclxuICBmZXRjaFJlc3RhdXJhbnRGcm9tVVJMKChlcnJvciwgcmVzdGF1cmFudCkgPT4ge1xyXG4gICAgaWYgKGVycm9yKSB7IC8vIEdvdCBhbiBlcnJvciFcclxuICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpZiAobmF2aWdhdG9yLm9uTGluZSl7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIG5ld01hcCA9IEwubWFwKCdtYXAnLCB7XHJcbiAgICAgICAgICAgIGNlbnRlcjogW3Jlc3RhdXJhbnQubGF0bG5nLmxhdCwgcmVzdGF1cmFudC5sYXRsbmcubG5nXSxcclxuICAgICAgICAgICAgem9vbTogMTYsXHJcbiAgICAgICAgICAgIHNjcm9sbFdoZWVsWm9vbTogZmFsc2VcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgTC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5qcGc3MD9hY2Nlc3NfdG9rZW49e21hcGJveFRva2VufScsIHtcclxuICAgICAgICAgICAgbWFwYm94VG9rZW46IFNFQ1JFVC5tYXBib3hfa2V5LFxyXG4gICAgICAgICAgICBtYXhab29tOiAxOCxcclxuICAgICAgICAgICAgYXR0cmlidXRpb246ICdNYXAgZGF0YSAmY29weTsgPGEgaHJlZj1cImh0dHBzOi8vd3d3Lm9wZW5zdHJlZXRtYXAub3JnL1wiPk9wZW5TdHJlZXRNYXA8L2E+IGNvbnRyaWJ1dG9ycywgJyArXHJcbiAgICAgICAgICAgICAgJzxhIGhyZWY9XCJodHRwczovL2NyZWF0aXZlY29tbW9ucy5vcmcvbGljZW5zZXMvYnktc2EvMi4wL1wiPkNDLUJZLVNBPC9hPiwgJyArXHJcbiAgICAgICAgICAgICAgJ0ltYWdlcnkgwqkgPGEgaHJlZj1cImh0dHBzOi8vd3d3Lm1hcGJveC5jb20vXCI+TWFwYm94PC9hPicsXHJcbiAgICAgICAgICAgIGlkOiAnbWFwYm94LnN0cmVldHMnICAgIFxyXG4gICAgICAgICAgfSkuYWRkVG8obmV3TWFwKTtcclxuICAgICAgICAgIERCSGVscGVyLm1hcE1hcmtlckZvclJlc3RhdXJhbnQocmVzdGF1cmFudCwgbmV3TWFwKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY2F0Y2goZXJyb3Ipe1xyXG4gICAgICAgICAgY29uc29sZS5sb2coJ1VuYWJsZSB0byBpbml0aWFsaXplIG1hcDogJywgZXJyb3IpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSAgICAgIFxyXG4gICAgICBmaWxsQnJlYWRjcnVtYigpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG59ICBcclxuXHJcbi8qKlxyXG4gKiBHZXQgY3VycmVudCByZXN0YXVyYW50IGZyb20gcGFnZSBVUkwuXHJcbiAqL1xyXG5jb25zdCBmZXRjaFJlc3RhdXJhbnRGcm9tVVJMID0gKGNhbGxiYWNrKSA9PiB7XHJcbiAgLy8gaWYgKHNlbGYucmVzdGF1cmFudCkgeyAvLyByZXN0YXVyYW50IGFscmVhZHkgZmV0Y2hlZCFcclxuICAvLyAgIGNhbGxiYWNrKG51bGwsIHNlbGYucmVzdGF1cmFudClcclxuICAvLyAgIHJldHVybjtcclxuICAvLyB9XHJcbiAgY29uc3QgaWQgPSBnZXRQYXJhbWV0ZXJCeU5hbWUoJ2lkJyk7XHJcbiAgaWYgKCFpZCkgeyAvLyBubyBpZCBmb3VuZCBpbiBVUkxcclxuICAgIGVycm9yID0gJ05vIHJlc3RhdXJhbnQgaWQgaW4gVVJMJ1xyXG4gICAgY2FsbGJhY2soZXJyb3IsIG51bGwpO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBEQkhlbHBlci5mZXRjaFJlc3RhdXJhbnRCeUlkKGlkLCAoZXJyb3IsIHJlc3RhdXJhbnQpID0+IHtcclxuICAgICAgc2VsZi5yZXN0YXVyYW50ID0gcmVzdGF1cmFudDtcclxuICAgICAgaWYgKCFyZXN0YXVyYW50KSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignVW5hYmxlIHRvIGZldGNoIHJlc3RhdXJhbnQ6ICcsIGVycm9yKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgREJIZWxwZXIuZmV0Y2hSZXZpZXdzQnlSZXN0YXVyYW50KGlkLCAoZXJyb3IsIHJldmlld3MpID0+IHtcclxuICAgICAgICBzZWxmLnJlc3RhdXJhbnQucmV2aWV3cyA9IHJldmlld3M7XHJcbiAgICAgICAgaWYoIXJldmlld3MpIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1Jldmlld3M6ICcsIGVycm9yKTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZmlsbFJlc3RhdXJhbnRIVE1MKCk7XHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudCk7fSk7XHJcbiAgICB9KTsgXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogQ3JlYXRlIHJlc3RhdXJhbnQgSFRNTCBhbmQgYWRkIGl0IHRvIHRoZSB3ZWJwYWdlXHJcbiAqL1xyXG5jb25zdCBmaWxsUmVzdGF1cmFudEhUTUwgPSAocmVzdGF1cmFudCA9IHNlbGYucmVzdGF1cmFudCkgPT4ge1xyXG4gIGNvbnN0IG5hbWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVzdGF1cmFudC1uYW1lJyk7XHJcbiAgbmFtZS5pbm5lckhUTUwgPSByZXN0YXVyYW50Lm5hbWU7XHJcblxyXG4gIGNvbnN0IGFkZHJlc3MgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVzdGF1cmFudC1hZGRyZXNzJyk7XHJcbiAgYWRkcmVzcy5pbm5lckhUTUwgPSByZXN0YXVyYW50LmFkZHJlc3M7XHJcblxyXG4gIGNvbnN0IGltYWdlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc3RhdXJhbnQtaW1nJyk7XHJcbiAgaW1hZ2UuY2xhc3NOYW1lID0gJ3Jlc3RhdXJhbnQtaW1nJ1xyXG4gIGltYWdlLmFsdCA9IGBQaWN0dXJlIG9mICR7cmVzdGF1cmFudC5uYW1lfWA7XHJcbiAgaW1hZ2Uuc3JjID0gREJIZWxwZXIuaW1hZ2VVcmxGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpO1xyXG4gIGltYWdlLnNyY3NldCA9IERCSGVscGVyLmltYWdlU3JjU2V0Rm9yUmVzdGF1cmFudChyZXN0YXVyYW50KTtcclxuICBpbWFnZS5zaXplcyA9IERCSGVscGVyLmltYWdlU2l6ZXNGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpO1xyXG5cclxuICBjb25zdCBjdWlzaW5lID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc3RhdXJhbnQtY3Vpc2luZScpO1xyXG4gIGN1aXNpbmUuaW5uZXJIVE1MID0gcmVzdGF1cmFudC5jdWlzaW5lX3R5cGU7XHJcblxyXG4gIC8vIGZpbGwgb3BlcmF0aW5nIGhvdXJzXHJcbiAgaWYgKHJlc3RhdXJhbnQub3BlcmF0aW5nX2hvdXJzKSB7XHJcbiAgICBmaWxsUmVzdGF1cmFudEhvdXJzSFRNTCgpO1xyXG4gIH1cclxuICAvLyBmaWxsIHJldmlld3NcclxuICBmaWxsUmV2aWV3c0hUTUwoKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENyZWF0ZSByZXN0YXVyYW50IG9wZXJhdGluZyBob3VycyBIVE1MIHRhYmxlIGFuZCBhZGQgaXQgdG8gdGhlIHdlYnBhZ2UuXHJcbiAqL1xyXG5jb25zdCBmaWxsUmVzdGF1cmFudEhvdXJzSFRNTCA9IChvcGVyYXRpbmdIb3VycyA9IHNlbGYucmVzdGF1cmFudC5vcGVyYXRpbmdfaG91cnMpID0+IHtcclxuICBjb25zdCBob3VycyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXN0YXVyYW50LWhvdXJzJyk7XHJcbiAgZm9yIChsZXQga2V5IGluIG9wZXJhdGluZ0hvdXJzKSB7XHJcbiAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0cicpO1xyXG5cclxuICAgIGNvbnN0IGRheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RkJyk7XHJcbiAgICBkYXkuaW5uZXJIVE1MID0ga2V5O1xyXG4gICAgcm93LmFwcGVuZENoaWxkKGRheSk7XHJcblxyXG4gICAgY29uc3QgdGltZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RkJyk7XHJcbiAgICB0aW1lLmlubmVySFRNTCA9IG9wZXJhdGluZ0hvdXJzW2tleV07XHJcbiAgICByb3cuYXBwZW5kQ2hpbGQodGltZSk7XHJcblxyXG4gICAgaG91cnMuYXBwZW5kQ2hpbGQocm93KTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhdGUgYWxsIHJldmlld3MgSFRNTCBhbmQgYWRkIHRoZW0gdG8gdGhlIHdlYnBhZ2UuXHJcbiAqL1xyXG5jb25zdCBmaWxsUmV2aWV3c0hUTUwgPSAocmV2aWV3cyA9IHNlbGYucmVzdGF1cmFudC5yZXZpZXdzKSA9PiB7XHJcbiAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jldmlld3MtY29udGFpbmVyJyk7XHJcbiAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoMicpO1xyXG4gIHRpdGxlLmlubmVySFRNTCA9ICdSZXZpZXdzJztcclxuICBjb250YWluZXIuYXBwZW5kQ2hpbGQodGl0bGUpO1xyXG5cclxuICBpZiAoIXJldmlld3MpIHtcclxuICAgIGNvbnN0IG5vUmV2aWV3cyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcclxuICAgIG5vUmV2aWV3cy5pbm5lckhUTUwgPSAnTm8gcmV2aWV3cyB5ZXQhJztcclxuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChub1Jldmlld3MpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBjb25zdCB1bCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXZpZXdzLWxpc3QnKTtcclxuICBcclxuICByZXZpZXdzLmZvckVhY2gocmV2aWV3ID0+IHtcclxuICAgIHVsLmFwcGVuZENoaWxkKGNyZWF0ZVJldmlld0hUTUwocmV2aWV3KSk7XHJcbiAgfSk7XHJcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKHVsKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENyZWF0ZSByZXZpZXcgSFRNTCBhbmQgYWRkIGl0IHRvIHRoZSB3ZWJwYWdlLlxyXG4gKi9cclxuY29uc3QgY3JlYXRlUmV2aWV3SFRNTCA9IChyZXZpZXcpID0+IHtcclxuICBjb25zdCBsaSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XHJcbiAgY29uc3QgbmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcclxuICBuYW1lLmlubmVySFRNTCA9IHJldmlldy5uYW1lO1xyXG4gIGxpLmFwcGVuZENoaWxkKG5hbWUpO1xyXG5cclxuICBjb25zdCBkYXRlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xyXG4gIGRhdGUuaW5uZXJIVE1MID0gbmV3IERhdGUocmV2aWV3LnVwZGF0ZWRBdCk7XHJcbiAgbGkuYXBwZW5kQ2hpbGQoZGF0ZSk7XHJcblxyXG4gIGNvbnN0IHJhdGluZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcclxuICByYXRpbmcuaW5uZXJIVE1MID0gYFJhdGluZzogJHtyZXZpZXcucmF0aW5nfWA7XHJcbiAgbGkuYXBwZW5kQ2hpbGQocmF0aW5nKTtcclxuXHJcbiAgY29uc3QgY29tbWVudHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XHJcbiAgY29tbWVudHMuaW5uZXJIVE1MID0gcmV2aWV3LmNvbW1lbnRzO1xyXG4gIGxpLmFwcGVuZENoaWxkKGNvbW1lbnRzKTtcclxuXHJcbiAgcmV0dXJuIGxpO1xyXG59XHJcblxyXG4vKipcclxuICogQWRkIHJlc3RhdXJhbnQgbmFtZSB0byB0aGUgYnJlYWRjcnVtYiBuYXZpZ2F0aW9uIG1lbnVcclxuICovXHJcbmNvbnN0IGZpbGxCcmVhZGNydW1iID0gKHJlc3RhdXJhbnQ9c2VsZi5yZXN0YXVyYW50KSA9PiB7XHJcbiAgY29uc3QgYnJlYWRjcnVtYiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdicmVhZGNydW1iJyk7XHJcbiAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xyXG4gIGxpLmlubmVySFRNTCA9IHJlc3RhdXJhbnQubmFtZTtcclxuICBicmVhZGNydW1iLmFwcGVuZENoaWxkKGxpKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBhIHBhcmFtZXRlciBieSBuYW1lIGZyb20gcGFnZSBVUkwuXHJcbiAqL1xyXG5jb25zdCBnZXRQYXJhbWV0ZXJCeU5hbWUgPSAobmFtZSwgdXJsKSA9PiB7XHJcbiAgaWYgKCF1cmwpXHJcbiAgICB1cmwgPSB3aW5kb3cubG9jYXRpb24uaHJlZjtcclxuICBuYW1lID0gbmFtZS5yZXBsYWNlKC9bXFxbXFxdXS9nLCAnXFxcXCQmJyk7XHJcbiAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKGBbPyZdJHtuYW1lfSg9KFteJiNdKil8JnwjfCQpYCksXHJcbiAgICByZXN1bHRzID0gcmVnZXguZXhlYyh1cmwpO1xyXG4gIGlmICghcmVzdWx0cylcclxuICAgIHJldHVybiBudWxsO1xyXG4gIGlmICghcmVzdWx0c1syXSlcclxuICAgIHJldHVybiAnJztcclxuICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHJlc3VsdHNbMl0ucmVwbGFjZSgvXFwrL2csICcgJykpO1xyXG59XHJcblxyXG4vLy8vU3VibWl0IFJldmlld1xyXG5jb25zdCBzdWJtaXRSZXZpZXcgPSAoZXZlbnQpID0+IHtcclxuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gIGxldCByZXZpZXcgPSB7fTtcclxuICBsZXQgcmV2aWV3c0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmV2aWV3cy1saXN0Jyk7XHJcblxyXG4gIHJldmlld1snbmFtZSddID0gZXZlbnQudGFyZ2V0WzBdLnZhbHVlO1xyXG4gIHJldmlld1sncmF0aW5nJ10gPSBldmVudC50YXJnZXRbMV0udmFsdWU7XHJcbiAgcmV2aWV3Wydjb21tZW50cyddID0gZXZlbnQudGFyZ2V0WzJdLnZhbHVlO1xyXG4gIHJldmlld1sncmVzdGF1cmFudF9pZCddID0gZ2V0UGFyYW1ldGVyQnlOYW1lKCdpZCcpO1xyXG4gIHJldmlld1sndXBkYXRlZEF0J10gPSBuZXcgRGF0ZSgpO1xyXG5cclxuICByZXZpZXdzTGlzdC5hcHBlbmQoY3JlYXRlUmV2aWV3SFRNTChyZXZpZXcpKTtcclxuICBEQkhlbHBlci5zdWJtaXRSZXZpZXdCeVJlc3RhdXJhbnQocmV2aWV3KTtcclxuXHJcbiAgLy8gaWYod2luZG93Lldvcmtlcil7XHJcbiAgLy8gICB3b3JrZXIucG9zdE1lc3NhZ2UocmV2aWV3KTtcclxuICAvLyAgIGNvbnNvbGUubG9nKCdSZXZpZXcgcG9zdGVkIHRvIHdvcmtlcicpO1xyXG4gIC8vICAgd29ya2VyLm9ubWVzc2FnZSA9IGZ1bmN0aW9uKGV2ZW50KXtcclxuICAvLyAgICAgY29uc29sZS5sb2coJ01lc3NhZ2UgcmVjaWV2ZWQgZnJvbSB3b3JrZXI6ICcsIGV2ZW50LmRhdGEpO1xyXG4gIC8vICAgfVxyXG4gIC8vIH0gXHJcbn1cclxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU0VDUkVUIHtcclxuICAgIHN0YXRpYyBnZXQgbWFwYm94X2tleSgpe1xyXG4gICAgICAgIHJldHVybiAncGsuZXlKMUlqb2laR1Z6WkdWdGIyNW9kU0lzSW1FaU9pSmphbTF0Wm1aNk1Yb3dhVzVyTTNGd05XbDJjSE5uY0RnMEluMC5LTzlVVGV5Ny1BZDdOMHFsUDkxQ2dnJztcclxuICAgIH1cclxufSJdfQ==
