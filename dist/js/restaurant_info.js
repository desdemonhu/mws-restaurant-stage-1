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
        if (!response.ok) {
          _dbpromise.default.getRestaurants().then(function (restaurants) {
            if (restaurants > 0) {
              callback(null, restaurants);
            } else {
              var error = 'Unable to get restaurants from IndexDB';
              callback(error, null);
            }
          });
        } else {
          var r = response.json();
          r.then(function (restaurants) {
            _dbpromise.default.putRestaurants(restaurants);

            callback(null, restaurants);
          });
        }
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

  if (window.Worker) {
    worker.postMessage(review);
    console.log('Review posted to worker');

    worker.onmessage = function (event) {
      console.log('Message recieved from worker: ', event.data);
    };
  }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaWRiL2xpYi9pZGIuanMiLCJzcmMvanMvZGJoZWxwZXIuanMiLCJzcmMvanMvZGJwcm9taXNlLmpzIiwic3JjL2pzL3JlZ2lzdGVyLXN3LmpzIiwic3JjL2pzL3Jlc3RhdXJhbnRfaW5mby5qcyIsInNyYy9qcy9zZWNyZXQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFD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QUFDLGNBQVQsQ0FBd0IsY0FBeEIsQ0FBbEI7QUFFQSxFQUFBLE1BQU0sQ0FBQyxNQUFELENBQU4sR0FBaUIsS0FBSyxDQUFDLE1BQU4sQ0FBYSxDQUFiLEVBQWdCLEtBQWpDO0FBQ0EsRUFBQSxNQUFNLENBQUMsUUFBRCxDQUFOLEdBQW1CLEtBQUssQ0FBQyxNQUFOLENBQWEsQ0FBYixFQUFnQixLQUFuQztBQUNBLEVBQUEsTUFBTSxDQUFDLFVBQUQsQ0FBTixHQUFxQixLQUFLLENBQUMsTUFBTixDQUFhLENBQWIsRUFBZ0IsS0FBckM7QUFDQSxFQUFBLE1BQU0sQ0FBQyxlQUFELENBQU4sR0FBMEIsa0JBQWtCLENBQUMsSUFBRCxDQUE1QztBQUNBLEVBQUEsTUFBTSxDQUFDLFdBQUQsQ0FBTixHQUFzQixJQUFJLElBQUosRUFBdEI7QUFFQSxFQUFBLFdBQVcsQ0FBQyxNQUFaLENBQW1CLGdCQUFnQixDQUFDLE1BQUQsQ0FBbkM7O0FBRUEsTUFBRyxNQUFNLENBQUMsTUFBVixFQUFpQjtBQUNmLElBQUEsTUFBTSxDQUFDLFdBQVAsQ0FBbUIsTUFBbkI7QUFDQSxJQUFBLE9BQU8sQ0FBQyxHQUFSLENBQVkseUJBQVo7O0FBQ0EsSUFBQSxNQUFNLENBQUMsU0FBUCxHQUFtQixVQUFTLEtBQVQsRUFBZTtBQUNoQyxNQUFBLE9BQU8sQ0FBQyxHQUFSLENBQVksZ0NBQVosRUFBOEMsS0FBSyxDQUFDLElBQXBEO0FBQ0QsS0FGRDtBQUdEO0FBQ0YsQ0FwQkQ7Ozs7Ozs7Ozs7Ozs7Ozs7SUMzTXFCLE07Ozs7Ozs7Ozt3QkFDTTtBQUNuQixhQUFPLCtGQUFQO0FBQ0giLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIndXNlIHN0cmljdCc7XG5cbihmdW5jdGlvbigpIHtcbiAgZnVuY3Rpb24gdG9BcnJheShhcnIpIHtcbiAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJyKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb21pc2lmeVJlcXVlc3QocmVxdWVzdCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIHJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlc29sdmUocmVxdWVzdC5yZXN1bHQpO1xuICAgICAgfTtcblxuICAgICAgcmVxdWVzdC5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlamVjdChyZXF1ZXN0LmVycm9yKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm9taXNpZnlSZXF1ZXN0Q2FsbChvYmosIG1ldGhvZCwgYXJncykge1xuICAgIHZhciByZXF1ZXN0O1xuICAgIHZhciBwID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICByZXF1ZXN0ID0gb2JqW21ldGhvZF0uYXBwbHkob2JqLCBhcmdzKTtcbiAgICAgIHByb21pc2lmeVJlcXVlc3QocmVxdWVzdCkudGhlbihyZXNvbHZlLCByZWplY3QpO1xuICAgIH0pO1xuXG4gICAgcC5yZXF1ZXN0ID0gcmVxdWVzdDtcbiAgICByZXR1cm4gcDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb21pc2lmeUN1cnNvclJlcXVlc3RDYWxsKG9iaiwgbWV0aG9kLCBhcmdzKSB7XG4gICAgdmFyIHAgPSBwcm9taXNpZnlSZXF1ZXN0Q2FsbChvYmosIG1ldGhvZCwgYXJncyk7XG4gICAgcmV0dXJuIHAudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgaWYgKCF2YWx1ZSkgcmV0dXJuO1xuICAgICAgcmV0dXJuIG5ldyBDdXJzb3IodmFsdWUsIHAucmVxdWVzdCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eVByb3BlcnRpZXMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUHJveHlDbGFzcy5wcm90b3R5cGUsIHByb3AsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICByZXR1cm4gdGhpc1t0YXJnZXRQcm9wXVtwcm9wXTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICB0aGlzW3RhcmdldFByb3BdW3Byb3BdID0gdmFsO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5UmVxdWVzdE1ldGhvZHMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgQ29uc3RydWN0b3IsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgaWYgKCEocHJvcCBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgICBQcm94eUNsYXNzLnByb3RvdHlwZVtwcm9wXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gcHJvbWlzaWZ5UmVxdWVzdENhbGwodGhpc1t0YXJnZXRQcm9wXSwgcHJvcCwgYXJndW1lbnRzKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eU1ldGhvZHMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgQ29uc3RydWN0b3IsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgaWYgKCEocHJvcCBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgICBQcm94eUNsYXNzLnByb3RvdHlwZVtwcm9wXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpc1t0YXJnZXRQcm9wXVtwcm9wXS5hcHBseSh0aGlzW3RhcmdldFByb3BdLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5Q3Vyc29yUmVxdWVzdE1ldGhvZHMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgQ29uc3RydWN0b3IsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgaWYgKCEocHJvcCBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgICBQcm94eUNsYXNzLnByb3RvdHlwZVtwcm9wXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gcHJvbWlzaWZ5Q3Vyc29yUmVxdWVzdENhbGwodGhpc1t0YXJnZXRQcm9wXSwgcHJvcCwgYXJndW1lbnRzKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBJbmRleChpbmRleCkge1xuICAgIHRoaXMuX2luZGV4ID0gaW5kZXg7XG4gIH1cblxuICBwcm94eVByb3BlcnRpZXMoSW5kZXgsICdfaW5kZXgnLCBbXG4gICAgJ25hbWUnLFxuICAgICdrZXlQYXRoJyxcbiAgICAnbXVsdGlFbnRyeScsXG4gICAgJ3VuaXF1ZSdcbiAgXSk7XG5cbiAgcHJveHlSZXF1ZXN0TWV0aG9kcyhJbmRleCwgJ19pbmRleCcsIElEQkluZGV4LCBbXG4gICAgJ2dldCcsXG4gICAgJ2dldEtleScsXG4gICAgJ2dldEFsbCcsXG4gICAgJ2dldEFsbEtleXMnLFxuICAgICdjb3VudCdcbiAgXSk7XG5cbiAgcHJveHlDdXJzb3JSZXF1ZXN0TWV0aG9kcyhJbmRleCwgJ19pbmRleCcsIElEQkluZGV4LCBbXG4gICAgJ29wZW5DdXJzb3InLFxuICAgICdvcGVuS2V5Q3Vyc29yJ1xuICBdKTtcblxuICBmdW5jdGlvbiBDdXJzb3IoY3Vyc29yLCByZXF1ZXN0KSB7XG4gICAgdGhpcy5fY3Vyc29yID0gY3Vyc29yO1xuICAgIHRoaXMuX3JlcXVlc3QgPSByZXF1ZXN0O1xuICB9XG5cbiAgcHJveHlQcm9wZXJ0aWVzKEN1cnNvciwgJ19jdXJzb3InLCBbXG4gICAgJ2RpcmVjdGlvbicsXG4gICAgJ2tleScsXG4gICAgJ3ByaW1hcnlLZXknLFxuICAgICd2YWx1ZSdcbiAgXSk7XG5cbiAgcHJveHlSZXF1ZXN0TWV0aG9kcyhDdXJzb3IsICdfY3Vyc29yJywgSURCQ3Vyc29yLCBbXG4gICAgJ3VwZGF0ZScsXG4gICAgJ2RlbGV0ZSdcbiAgXSk7XG5cbiAgLy8gcHJveHkgJ25leHQnIG1ldGhvZHNcbiAgWydhZHZhbmNlJywgJ2NvbnRpbnVlJywgJ2NvbnRpbnVlUHJpbWFyeUtleSddLmZvckVhY2goZnVuY3Rpb24obWV0aG9kTmFtZSkge1xuICAgIGlmICghKG1ldGhvZE5hbWUgaW4gSURCQ3Vyc29yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICBDdXJzb3IucHJvdG90eXBlW21ldGhvZE5hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgY3Vyc29yID0gdGhpcztcbiAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIGN1cnNvci5fY3Vyc29yW21ldGhvZE5hbWVdLmFwcGx5KGN1cnNvci5fY3Vyc29yLCBhcmdzKTtcbiAgICAgICAgcmV0dXJuIHByb21pc2lmeVJlcXVlc3QoY3Vyc29yLl9yZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgaWYgKCF2YWx1ZSkgcmV0dXJuO1xuICAgICAgICAgIHJldHVybiBuZXcgQ3Vyc29yKHZhbHVlLCBjdXJzb3IuX3JlcXVlc3QpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIE9iamVjdFN0b3JlKHN0b3JlKSB7XG4gICAgdGhpcy5fc3RvcmUgPSBzdG9yZTtcbiAgfVxuXG4gIE9iamVjdFN0b3JlLnByb3RvdHlwZS5jcmVhdGVJbmRleCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgSW5kZXgodGhpcy5fc3RvcmUuY3JlYXRlSW5kZXguYXBwbHkodGhpcy5fc3RvcmUsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIE9iamVjdFN0b3JlLnByb3RvdHlwZS5pbmRleCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgSW5kZXgodGhpcy5fc3RvcmUuaW5kZXguYXBwbHkodGhpcy5fc3RvcmUsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIFtcbiAgICAnbmFtZScsXG4gICAgJ2tleVBhdGgnLFxuICAgICdpbmRleE5hbWVzJyxcbiAgICAnYXV0b0luY3JlbWVudCdcbiAgXSk7XG5cbiAgcHJveHlSZXF1ZXN0TWV0aG9kcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIElEQk9iamVjdFN0b3JlLCBbXG4gICAgJ3B1dCcsXG4gICAgJ2FkZCcsXG4gICAgJ2RlbGV0ZScsXG4gICAgJ2NsZWFyJyxcbiAgICAnZ2V0JyxcbiAgICAnZ2V0QWxsJyxcbiAgICAnZ2V0S2V5JyxcbiAgICAnZ2V0QWxsS2V5cycsXG4gICAgJ2NvdW50J1xuICBdKTtcblxuICBwcm94eUN1cnNvclJlcXVlc3RNZXRob2RzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgSURCT2JqZWN0U3RvcmUsIFtcbiAgICAnb3BlbkN1cnNvcicsXG4gICAgJ29wZW5LZXlDdXJzb3InXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIElEQk9iamVjdFN0b3JlLCBbXG4gICAgJ2RlbGV0ZUluZGV4J1xuICBdKTtcblxuICBmdW5jdGlvbiBUcmFuc2FjdGlvbihpZGJUcmFuc2FjdGlvbikge1xuICAgIHRoaXMuX3R4ID0gaWRiVHJhbnNhY3Rpb247XG4gICAgdGhpcy5jb21wbGV0ZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgaWRiVHJhbnNhY3Rpb24ub25jb21wbGV0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9O1xuICAgICAgaWRiVHJhbnNhY3Rpb24ub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZWplY3QoaWRiVHJhbnNhY3Rpb24uZXJyb3IpO1xuICAgICAgfTtcbiAgICAgIGlkYlRyYW5zYWN0aW9uLm9uYWJvcnQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KGlkYlRyYW5zYWN0aW9uLmVycm9yKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBUcmFuc2FjdGlvbi5wcm90b3R5cGUub2JqZWN0U3RvcmUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IE9iamVjdFN0b3JlKHRoaXMuX3R4Lm9iamVjdFN0b3JlLmFwcGx5KHRoaXMuX3R4LCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoVHJhbnNhY3Rpb24sICdfdHgnLCBbXG4gICAgJ29iamVjdFN0b3JlTmFtZXMnLFxuICAgICdtb2RlJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoVHJhbnNhY3Rpb24sICdfdHgnLCBJREJUcmFuc2FjdGlvbiwgW1xuICAgICdhYm9ydCdcbiAgXSk7XG5cbiAgZnVuY3Rpb24gVXBncmFkZURCKGRiLCBvbGRWZXJzaW9uLCB0cmFuc2FjdGlvbikge1xuICAgIHRoaXMuX2RiID0gZGI7XG4gICAgdGhpcy5vbGRWZXJzaW9uID0gb2xkVmVyc2lvbjtcbiAgICB0aGlzLnRyYW5zYWN0aW9uID0gbmV3IFRyYW5zYWN0aW9uKHRyYW5zYWN0aW9uKTtcbiAgfVxuXG4gIFVwZ3JhZGVEQi5wcm90b3R5cGUuY3JlYXRlT2JqZWN0U3RvcmUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IE9iamVjdFN0b3JlKHRoaXMuX2RiLmNyZWF0ZU9iamVjdFN0b3JlLmFwcGx5KHRoaXMuX2RiLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoVXBncmFkZURCLCAnX2RiJywgW1xuICAgICduYW1lJyxcbiAgICAndmVyc2lvbicsXG4gICAgJ29iamVjdFN0b3JlTmFtZXMnXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhVcGdyYWRlREIsICdfZGInLCBJREJEYXRhYmFzZSwgW1xuICAgICdkZWxldGVPYmplY3RTdG9yZScsXG4gICAgJ2Nsb3NlJ1xuICBdKTtcblxuICBmdW5jdGlvbiBEQihkYikge1xuICAgIHRoaXMuX2RiID0gZGI7XG4gIH1cblxuICBEQi5wcm90b3R5cGUudHJhbnNhY3Rpb24gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IFRyYW5zYWN0aW9uKHRoaXMuX2RiLnRyYW5zYWN0aW9uLmFwcGx5KHRoaXMuX2RiLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoREIsICdfZGInLCBbXG4gICAgJ25hbWUnLFxuICAgICd2ZXJzaW9uJyxcbiAgICAnb2JqZWN0U3RvcmVOYW1lcydcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKERCLCAnX2RiJywgSURCRGF0YWJhc2UsIFtcbiAgICAnY2xvc2UnXG4gIF0pO1xuXG4gIC8vIEFkZCBjdXJzb3IgaXRlcmF0b3JzXG4gIC8vIFRPRE86IHJlbW92ZSB0aGlzIG9uY2UgYnJvd3NlcnMgZG8gdGhlIHJpZ2h0IHRoaW5nIHdpdGggcHJvbWlzZXNcbiAgWydvcGVuQ3Vyc29yJywgJ29wZW5LZXlDdXJzb3InXS5mb3JFYWNoKGZ1bmN0aW9uKGZ1bmNOYW1lKSB7XG4gICAgW09iamVjdFN0b3JlLCBJbmRleF0uZm9yRWFjaChmdW5jdGlvbihDb25zdHJ1Y3Rvcikge1xuICAgICAgLy8gRG9uJ3QgY3JlYXRlIGl0ZXJhdGVLZXlDdXJzb3IgaWYgb3BlbktleUN1cnNvciBkb2Vzbid0IGV4aXN0LlxuICAgICAgaWYgKCEoZnVuY05hbWUgaW4gQ29uc3RydWN0b3IucHJvdG90eXBlKSkgcmV0dXJuO1xuXG4gICAgICBDb25zdHJ1Y3Rvci5wcm90b3R5cGVbZnVuY05hbWUucmVwbGFjZSgnb3BlbicsICdpdGVyYXRlJyldID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gdG9BcnJheShhcmd1bWVudHMpO1xuICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmdzW2FyZ3MubGVuZ3RoIC0gMV07XG4gICAgICAgIHZhciBuYXRpdmVPYmplY3QgPSB0aGlzLl9zdG9yZSB8fCB0aGlzLl9pbmRleDtcbiAgICAgICAgdmFyIHJlcXVlc3QgPSBuYXRpdmVPYmplY3RbZnVuY05hbWVdLmFwcGx5KG5hdGl2ZU9iamVjdCwgYXJncy5zbGljZSgwLCAtMSkpO1xuICAgICAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGNhbGxiYWNrKHJlcXVlc3QucmVzdWx0KTtcbiAgICAgICAgfTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIHBvbHlmaWxsIGdldEFsbFxuICBbSW5kZXgsIE9iamVjdFN0b3JlXS5mb3JFYWNoKGZ1bmN0aW9uKENvbnN0cnVjdG9yKSB7XG4gICAgaWYgKENvbnN0cnVjdG9yLnByb3RvdHlwZS5nZXRBbGwpIHJldHVybjtcbiAgICBDb25zdHJ1Y3Rvci5wcm90b3R5cGUuZ2V0QWxsID0gZnVuY3Rpb24ocXVlcnksIGNvdW50KSB7XG4gICAgICB2YXIgaW5zdGFuY2UgPSB0aGlzO1xuICAgICAgdmFyIGl0ZW1zID0gW107XG5cbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlKSB7XG4gICAgICAgIGluc3RhbmNlLml0ZXJhdGVDdXJzb3IocXVlcnksIGZ1bmN0aW9uKGN1cnNvcikge1xuICAgICAgICAgIGlmICghY3Vyc29yKSB7XG4gICAgICAgICAgICByZXNvbHZlKGl0ZW1zKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaXRlbXMucHVzaChjdXJzb3IudmFsdWUpO1xuXG4gICAgICAgICAgaWYgKGNvdW50ICE9PSB1bmRlZmluZWQgJiYgaXRlbXMubGVuZ3RoID09IGNvdW50KSB7XG4gICAgICAgICAgICByZXNvbHZlKGl0ZW1zKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY3Vyc29yLmNvbnRpbnVlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgdmFyIGV4cCA9IHtcbiAgICBvcGVuOiBmdW5jdGlvbihuYW1lLCB2ZXJzaW9uLCB1cGdyYWRlQ2FsbGJhY2spIHtcbiAgICAgIHZhciBwID0gcHJvbWlzaWZ5UmVxdWVzdENhbGwoaW5kZXhlZERCLCAnb3BlbicsIFtuYW1lLCB2ZXJzaW9uXSk7XG4gICAgICB2YXIgcmVxdWVzdCA9IHAucmVxdWVzdDtcblxuICAgICAgaWYgKHJlcXVlc3QpIHtcbiAgICAgICAgcmVxdWVzdC5vbnVwZ3JhZGVuZWVkZWQgPSBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgIGlmICh1cGdyYWRlQ2FsbGJhY2spIHtcbiAgICAgICAgICAgIHVwZ3JhZGVDYWxsYmFjayhuZXcgVXBncmFkZURCKHJlcXVlc3QucmVzdWx0LCBldmVudC5vbGRWZXJzaW9uLCByZXF1ZXN0LnRyYW5zYWN0aW9uKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcC50aGVuKGZ1bmN0aW9uKGRiKSB7XG4gICAgICAgIHJldHVybiBuZXcgREIoZGIpO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICBkZWxldGU6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHJldHVybiBwcm9taXNpZnlSZXF1ZXN0Q2FsbChpbmRleGVkREIsICdkZWxldGVEYXRhYmFzZScsIFtuYW1lXSk7XG4gICAgfVxuICB9O1xuXG4gIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZXhwO1xuICAgIG1vZHVsZS5leHBvcnRzLmRlZmF1bHQgPSBtb2R1bGUuZXhwb3J0cztcbiAgfVxuICBlbHNlIHtcbiAgICBzZWxmLmlkYiA9IGV4cDtcbiAgfVxufSgpKTtcbiIsImltcG9ydCBkYlByb21pc2UgZnJvbSAnLi9kYnByb21pc2UnO1xyXG4vKipcclxuICogQ29tbW9uIGRhdGFiYXNlIGhlbHBlciBmdW5jdGlvbnMuXHJcbiAqL1xyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEQkhlbHBlciB7XHJcblxyXG4gIC8qKlxyXG4gICAqIERhdGFiYXNlIFVSTC5cclxuICAgKiBDaGFuZ2UgdGhpcyB0byByZXN0YXVyYW50cy5qc29uIGZpbGUgbG9jYXRpb24gb24geW91ciBzZXJ2ZXIuXHJcbiAgICovXHJcbiAgc3RhdGljIGdldCBEQVRBQkFTRV9VUkwoKSB7XHJcbiAgICBjb25zdCBwb3J0ID0gODAwMCAvLyBDaGFuZ2UgdGhpcyB0byB5b3VyIHNlcnZlciBwb3J0XHJcbiAgICByZXR1cm4gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtwb3J0fS9kYXRhL3Jlc3RhdXJhbnRzLmpzb25gO1xyXG4gIH1cclxuXHJcbiAgc3RhdGljIGdldCBBUElfVVJMKCl7XHJcbiAgICBjb25zdCBwb3J0ID0gMTMzNztcclxuICAgIHJldHVybiBgaHR0cDovL2xvY2FsaG9zdDoke3BvcnR9YFxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggYWxsIHJlc3RhdXJhbnRzLlxyXG4gICAqL1xyXG4gIC8vIHN0YXRpYyBmZXRjaFJlc3RhdXJhbnRzKGNhbGxiYWNrKSB7XHJcbiAgLy8gICBsZXQgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XHJcbiAgLy8gICB4aHIub3BlbignR0VUJywgYCR7REJIZWxwZXIuQVBJX1VSTH0vcmVzdGF1cmFudHNgKTtcclxuICAvLyAgIHhoci5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgLy8gICAgIGlmICh4aHIuc3RhdHVzID09PSAyMDApIHsgLy8gR290IGEgc3VjY2VzcyByZXNwb25zZSBmcm9tIHNlcnZlciFcclxuICAvLyAgICAgICBjb25zdCByZXN0YXVyYW50cyA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCk7XHJcbiAgLy8gICAgICAgZGJQcm9taXNlLnB1dFJlc3RhdXJhbnRzKHJlc3RhdXJhbnRzKTtcclxuICAvLyAgICAgICBjYWxsYmFjayhudWxsLCByZXN0YXVyYW50cyk7XHJcbiAgLy8gICAgIH0gZWxzZSB7XHJcbiAgLy8gICAgICAgIGRiUHJvbWlzZS5nZXRSZXN0YXVyYW50cygpLnRoZW4ocmVzdGF1cmFudHMgPT57XHJcbiAgLy8gICAgICAgICBpZihyZXN0YXVyYW50cy5sZW5ndGggPiAwKXtcclxuICAvLyAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudHMpO1xyXG4gIC8vICAgICAgICAgfSBlbHNlIHtcclxuICAvLyAgICAgICAgICAgY29uc3QgZXJyb3IgPSAoYFJlcXVlc3QgZmFpbGVkLiBSZXR1cm5lZCBzdGF0dXMgb2YgJHt4aHIuc3RhdHVzfWApO1xyXG4gIC8vICAgICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgLy8gICAgICAgICB9XHJcbiAgLy8gICAgICAgfSk7IFxyXG4gIC8vICAgICB9XHJcbiAgLy8gICB9O1xyXG4gIC8vICAgeGhyLnNlbmQoKTtcclxuICAvLyB9XHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudHMoY2FsbGJhY2spe1xyXG4gICAgZmV0Y2goYCR7REJIZWxwZXIuQVBJX1VSTH0vcmVzdGF1cmFudHNgKS50aGVuKChyZXNwb25zZSk9PiB7XHJcbiAgICAgIGlmKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgIGRiUHJvbWlzZS5nZXRSZXN0YXVyYW50cygpLnRoZW4oKHJlc3RhdXJhbnRzKT0+e1xyXG4gICAgICAgICAgaWYocmVzdGF1cmFudHMgPiAwKXtcclxuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudHMpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSAnVW5hYmxlIHRvIGdldCByZXN0YXVyYW50cyBmcm9tIEluZGV4REInXHJcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnN0IHIgPSByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgci50aGVuKChyZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICAgICAgZGJQcm9taXNlLnB1dFJlc3RhdXJhbnRzKHJlc3RhdXJhbnRzKTtcclxuICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnRzKTtcclxuICAgICAgICB9KVxyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggYSByZXN0YXVyYW50IGJ5IGl0cyBJRC5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hSZXN0YXVyYW50QnlJZChpZCwgY2FsbGJhY2spIHtcclxuICAgIGZldGNoKGAke0RCSGVscGVyLkFQSV9VUkx9L3Jlc3RhdXJhbnRzLyR7aWR9YCkudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHJldHVybiBQcm9taXNlLnJlamVjdChcIlJlc3RhdXJhbnQgY291bGRuJ3QgYmUgZmV0Y2hlZCBmcm9tIG5ldHdvcmtcIik7XHJcbiAgICAgIHJldHVybiByZXNwb25zZS5qc29uKCk7XHJcbiAgICB9KVxyXG4gICAgLnRoZW4oKHJlc3RhdXJhbnQpPT4ge1xyXG4gICAgICBkYlByb21pc2UucHV0UmVzdGF1cmFudHMocmVzdGF1cmFudClcclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKG51bGwsIHJlc3RhdXJhbnQpO1xyXG4gICAgfSkuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGlkLCBlcnJvcik7XHJcbiAgICAgIGRiUHJvbWlzZS5nZXRSZXN0YXVyYW50cyhpZCkudGhlbigocmVzdGF1cmFudCk9PntcclxuICAgICAgICByZXR1cm4gY2FsbGJhY2sobnVsbCwgcmVzdGF1cmFudCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBzdGF0aWMgZmV0Y2hSZXZpZXdzQnlSZXN0YXVyYW50KGlkLCBjYWxsYmFjayl7XHJcbiAgICBmZXRjaChgJHtEQkhlbHBlci5BUElfVVJMfS9yZXZpZXdzLz9yZXN0YXVyYW50X2lkPSR7aWR9YCkudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHJldHVybiBQcm9taXNlLnJlamVjdChcIlJlc3RhdXJhbnQgUmV2aWV3cyBjb3VsZG4ndCBiZSBmZXRjaGVkIGZyb20gbmV0d29ya1wiKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxuICAgIH0pLnRoZW4oKHJldmlld3MpPT4ge1xyXG4gICAgICBkYlByb21pc2UucHV0UmV2aWV3cyhpZCwgcmV2aWV3cyk7XHJcbiAgICAgIHJldHVybiBjYWxsYmFjayhudWxsLCByZXZpZXdzKTtcclxuICAgIH0pLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICBjb25zb2xlLmxvZyhlcnJvcik7XHJcbiAgICAgIGRiUHJvbWlzZS5nZXRSZXZpZXdzKGlkKS50aGVuKChyZXZpZXdzKT0+e1xyXG4gICAgICAgIHJldHVybiBjYWxsYmFjayhudWxsLCByZXZpZXdzKTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIHJlc3RhdXJhbnRzIGJ5IGEgY3Vpc2luZSB0eXBlIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaFJlc3RhdXJhbnRCeUN1aXNpbmUoY3Vpc2luZSwgY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50cyAgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmdcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRmlsdGVyIHJlc3RhdXJhbnRzIHRvIGhhdmUgb25seSBnaXZlbiBjdWlzaW5lIHR5cGVcclxuICAgICAgICBjb25zdCByZXN1bHRzID0gcmVzdGF1cmFudHMuZmlsdGVyKHIgPT4gci5jdWlzaW5lX3R5cGUgPT0gY3Vpc2luZSk7XHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0cyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggcmVzdGF1cmFudHMgYnkgYSBuZWlnaGJvcmhvb2Qgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudEJ5TmVpZ2hib3Job29kKG5laWdoYm9yaG9vZCwgY2FsbGJhY2spIHtcclxuICAgIC8vIEZldGNoIGFsbCByZXN0YXVyYW50c1xyXG4gICAgREJIZWxwZXIuZmV0Y2hSZXN0YXVyYW50cygoZXJyb3IsIHJlc3RhdXJhbnRzKSA9PiB7XHJcbiAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBudWxsKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBGaWx0ZXIgcmVzdGF1cmFudHMgdG8gaGF2ZSBvbmx5IGdpdmVuIG5laWdoYm9yaG9vZFxyXG4gICAgICAgIGNvbnN0IHJlc3VsdHMgPSByZXN0YXVyYW50cy5maWx0ZXIociA9PiByLm5laWdoYm9yaG9vZCA9PSBuZWlnaGJvcmhvb2QpO1xyXG4gICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdHMpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZldGNoIHJlc3RhdXJhbnRzIGJ5IGEgY3Vpc2luZSBhbmQgYSBuZWlnaGJvcmhvb2Qgd2l0aCBwcm9wZXIgZXJyb3IgaGFuZGxpbmcuXHJcbiAgICovXHJcbiAgc3RhdGljIGZldGNoUmVzdGF1cmFudEJ5Q3Vpc2luZUFuZE5laWdoYm9yaG9vZChjdWlzaW5lLCBuZWlnaGJvcmhvb2QsIGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbGV0IHJlc3VsdHMgPSByZXN0YXVyYW50c1xyXG4gICAgICAgIGlmIChjdWlzaW5lICE9ICdhbGwnKSB7IC8vIGZpbHRlciBieSBjdWlzaW5lXHJcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIociA9PiByLmN1aXNpbmVfdHlwZSA9PSBjdWlzaW5lKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKG5laWdoYm9yaG9vZCAhPSAnYWxsJykgeyAvLyBmaWx0ZXIgYnkgbmVpZ2hib3Job29kXHJcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIociA9PiByLm5laWdoYm9yaG9vZCA9PSBuZWlnaGJvcmhvb2QpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYWxsYmFjayhudWxsLCByZXN1bHRzKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGZXRjaCBhbGwgbmVpZ2hib3Job29kcyB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZy5cclxuICAgKi9cclxuICBzdGF0aWMgZmV0Y2hOZWlnaGJvcmhvb2RzKGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gR2V0IGFsbCBuZWlnaGJvcmhvb2RzIGZyb20gYWxsIHJlc3RhdXJhbnRzXHJcbiAgICAgICAgY29uc3QgbmVpZ2hib3Job29kcyA9IHJlc3RhdXJhbnRzLm1hcCgodiwgaSkgPT4gcmVzdGF1cmFudHNbaV0ubmVpZ2hib3Job29kKVxyXG4gICAgICAgIC8vIFJlbW92ZSBkdXBsaWNhdGVzIGZyb20gbmVpZ2hib3Job29kc1xyXG4gICAgICAgIGNvbnN0IHVuaXF1ZU5laWdoYm9yaG9vZHMgPSBuZWlnaGJvcmhvb2RzLmZpbHRlcigodiwgaSkgPT4gbmVpZ2hib3Job29kcy5pbmRleE9mKHYpID09IGkpXHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgdW5pcXVlTmVpZ2hib3Job29kcyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmV0Y2ggYWxsIGN1aXNpbmVzIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nLlxyXG4gICAqL1xyXG4gIHN0YXRpYyBmZXRjaEN1aXNpbmVzKGNhbGxiYWNrKSB7XHJcbiAgICAvLyBGZXRjaCBhbGwgcmVzdGF1cmFudHNcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudHMoKGVycm9yLCByZXN0YXVyYW50cykgPT4ge1xyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gR2V0IGFsbCBjdWlzaW5lcyBmcm9tIGFsbCByZXN0YXVyYW50c1xyXG4gICAgICAgIGNvbnN0IGN1aXNpbmVzID0gcmVzdGF1cmFudHMubWFwKCh2LCBpKSA9PiByZXN0YXVyYW50c1tpXS5jdWlzaW5lX3R5cGUpXHJcbiAgICAgICAgLy8gUmVtb3ZlIGR1cGxpY2F0ZXMgZnJvbSBjdWlzaW5lc1xyXG4gICAgICAgIGNvbnN0IHVuaXF1ZUN1aXNpbmVzID0gY3Vpc2luZXMuZmlsdGVyKCh2LCBpKSA9PiBjdWlzaW5lcy5pbmRleE9mKHYpID09IGkpXHJcbiAgICAgICAgY2FsbGJhY2sobnVsbCwgdW5pcXVlQ3Vpc2luZXMpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJlc3RhdXJhbnQgcGFnZSBVUkwuXHJcbiAgICovXHJcbiAgc3RhdGljIHVybEZvclJlc3RhdXJhbnQocmVzdGF1cmFudCkge1xyXG4gICAgcmV0dXJuIChgLi9yZXN0YXVyYW50Lmh0bWw/aWQ9JHtyZXN0YXVyYW50LmlkfWApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVzdGF1cmFudCBpbWFnZSBVUkwuXHJcbiAgICovXHJcbiAgc3RhdGljIGltYWdlVXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KSB7XHJcbiAgICByZXR1cm4gKGAvaW1nLyR7cmVzdGF1cmFudC5waG90b2dyYXBoIHx8IHJlc3RhdXJhbnQuaWR9LW1lZGl1bS5qcGdgKTtcclxuICB9XHJcblxyXG4gIHN0YXRpYyBpbWFnZVNyY1NldEZvclJlc3RhdXJhbnQocmVzdGF1cmFudCl7XHJcbiAgICBjb25zdCBpbWdTcmMgPSBgL2ltZy8ke3Jlc3RhdXJhbnQucGhvdG9ncmFwaCB8fCByZXN0YXVyYW50LmlkfWA7XHJcbiAgICByZXR1cm4gYCR7aW1nU3JjfS1zbWFsbC5qcGcgMzAwdyxcclxuICAgICAgICAgICAgJHtpbWdTcmN9LW1lZGl1bS5qcGcgNjAwdyxcclxuICAgICAgICAgICAgJHtpbWdTcmN9LWxhcmdlLmpwZyA4MDB3YFxyXG4gIH1cclxuXHJcbiAgc3RhdGljIGltYWdlU2l6ZXNGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpIHtcclxuICAgIHJldHVybiBgKG1heC13aWR0aDogMzYwcHgpIDI4MHB4LFxyXG4gICAgICAgICAgICAobWF4LXdpZHRoOiA2MDBweCkgNjAwcHgsXHJcbiAgICAgICAgICAgIDQwMHB4YDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIE1hcCBtYXJrZXIgZm9yIGEgcmVzdGF1cmFudC5cclxuICAgKi9cclxuICAgc3RhdGljIG1hcE1hcmtlckZvclJlc3RhdXJhbnQocmVzdGF1cmFudCwgbWFwKSB7XHJcbiAgICAvLyBodHRwczovL2xlYWZsZXRqcy5jb20vcmVmZXJlbmNlLTEuMy4wLmh0bWwjbWFya2VyICBcclxuICAgIGNvbnN0IG1hcmtlciA9IG5ldyBMLm1hcmtlcihbcmVzdGF1cmFudC5sYXRsbmcubGF0LCByZXN0YXVyYW50LmxhdGxuZy5sbmddLFxyXG4gICAgICB7dGl0bGU6IHJlc3RhdXJhbnQubmFtZSxcclxuICAgICAgYWx0OiByZXN0YXVyYW50Lm5hbWUsXHJcbiAgICAgIHVybDogREJIZWxwZXIudXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KVxyXG4gICAgICB9KVxyXG4gICAgICBtYXJrZXIuYWRkVG8obWFwKTtcclxuICAgIHJldHVybiBtYXJrZXI7XHJcbiAgfSBcclxuICAvKiBzdGF0aWMgbWFwTWFya2VyRm9yUmVzdGF1cmFudChyZXN0YXVyYW50LCBtYXApIHtcclxuICAgIGNvbnN0IG1hcmtlciA9IG5ldyBnb29nbGUubWFwcy5NYXJrZXIoe1xyXG4gICAgICBwb3NpdGlvbjogcmVzdGF1cmFudC5sYXRsbmcsXHJcbiAgICAgIHRpdGxlOiByZXN0YXVyYW50Lm5hbWUsXHJcbiAgICAgIHVybDogREJIZWxwZXIudXJsRm9yUmVzdGF1cmFudChyZXN0YXVyYW50KSxcclxuICAgICAgbWFwOiBtYXAsXHJcbiAgICAgIGFuaW1hdGlvbjogZ29vZ2xlLm1hcHMuQW5pbWF0aW9uLkRST1B9XHJcbiAgICApO1xyXG4gICAgcmV0dXJuIG1hcmtlcjtcclxuICB9ICovXHJcblxyXG4gIHN0YXRpYyBzdWJtaXRSZXZpZXdCeVJlc3RhdXJhbnQocmV2aWV3KSB7XHJcbiAgaWYobmF2aWdhdG9yLm9uTGluZSkge1xyXG4gICAgZmV0Y2goYCR7REJIZWxwZXIuQVBJX1VSTH0vcmV2aWV3c2AsIHtcclxuICAgICAgbWV0aG9kOidwb3N0JyxcclxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIFwicmVzdGF1cmFudF9pZFwiOiByZXZpZXcucmVzdGF1cmFudF9pZCxcclxuICAgICAgICBcIm5hbWVcIjogcmV2aWV3Lm5hbWUsXHJcbiAgICAgICAgXCJyYXRpbmdcIjogcmV2aWV3LnJhdGluZyxcclxuICAgICAgICBcImNvbW1lbnRzXCI6IHJldmlldy5jb21tZW50c1xyXG4gICAgfSlcclxuICAgIH0pLnRoZW4oKHJlc3BvbnNlKSA9PiB7XHJcbiAgICAgIHJldHVybiByZXNwb25zZTtcclxuICAgIH0pXHJcbiAgfSBlbHNlIHtcclxuICAgICAgZGJQcm9taXNlLmdldFJldmlld3MocmV2aWV3LnJlc3RhdXJhbnRfaWQpLnRoZW4oKHJldmlld3MpPT57XHJcbiAgICAgICAgbGV0IGFsbFJldmlld3MgPSByZXZpZXdzLmNvbmNhdChyZXZpZXcpO1xyXG4gICAgICAgIGRiUHJvbWlzZS5wdXRSZXZpZXdzKHJldmlldy5yZXN0YXVyYW50X2lkLCBhbGxSZXZpZXdzKTtcclxuICAgICAgfSlcclxuICAgIH0gIFxyXG4gIH1cclxuXHJcbiAgc3RhdGljIHVwZGF0ZURhdGFiYXNlKCl7XHJcbiAgICBkYlByb21pc2UuZ2V0UmVzdGF1cmFudHMoKS50aGVuKChyZXN0YXVyYW50cyk9PiB7XHJcbiAgICAgIHJlc3RhdXJhbnRzLmZvckVhY2gocmVzdGF1cmFudCA9PiB7XHJcbiAgICAgICAgaWYocmVzdGF1cmFudC5yZXZpZXdzKXtcclxuICAgICAgICAgIHJlc3RhdXJhbnQucmV2aWV3cy5mb3JFYWNoKChyZXZpZXcpID0+IHtcclxuICAgICAgICAgICAgaWYoIXJldmlldy5pZCl7XHJcbiAgICAgICAgICAgICAgdGhpcy5zdWJtaXRSZXZpZXdCeVJlc3RhdXJhbnQocmV2aWV3KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfSlcclxuICB9XHJcblxyXG59IiwiaW1wb3J0IElEQiBmcm9tICdpZGInO1xyXG5cclxuY29uc3QgZGJQcm9taXNlID0ge1xyXG4gICAgZGIgOiBJREIub3BlbigncmVzdGF1cmFudC1yZXZpZXdzLWRiJywgMiwgKHVwZ3JhZGVEQikgPT57XHJcbiAgICAgICAgc3dpdGNoKHVwZ3JhZGVEQi5vbGRWZXJzaW9uKXtcclxuICAgICAgICAgICAgY2FzZSAwOlxyXG4gICAgICAgICAgICAgICAgdXBncmFkZURCLmNyZWF0ZU9iamVjdFN0b3JlKCdyZXN0YXVyYW50cycsIHtrZXlQYXRoOiAnaWQnfSlcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfSksXHJcbiAgICBwdXRSZXN0YXVyYW50cyhyZXN0YXVyYW50cykge1xyXG4gICAgICAgIC8vaWYgKCFyZXN0YXVyYW50cy5wdXNoKXsgcmVzdGF1cmFudHMgPSBbcmVzdGF1cmFudHNdfTtcclxuICAgICAgICByZXR1cm4gdGhpcy5kYi50aGVuKGRiID0+IHtcclxuICAgICAgICBjb25zdCBzdG9yZSA9IGRiLnRyYW5zYWN0aW9uKCdyZXN0YXVyYW50cycsICdyZWFkd3JpdGUnKS5vYmplY3RTdG9yZSgncmVzdGF1cmFudHMnKTtcclxuICAgICAgICBQcm9taXNlLmFsbChyZXN0YXVyYW50cy5tYXAobmV0d29ya1Jlc3RhdXJhbnQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gc3RvcmUuZ2V0KG5ldHdvcmtSZXN0YXVyYW50LmlkKS50aGVuKGlkYlJlc3RhdXJhbnQgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWlkYlJlc3RhdXJhbnQgfHwgbmV0d29ya1Jlc3RhdXJhbnQudXBkYXRlZEF0ID4gaWRiUmVzdGF1cmFudC51cGRhdGVkQXQpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBzdG9yZS5wdXQobmV0d29ya1Jlc3RhdXJhbnQpOyAgXHJcbiAgICAgICAgICAgIH0gXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pKS50aGVuKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHN0b3JlLmNvbXBsZXRlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSxcclxuICAgIHB1dFJldmlld3MoaWQsIHJldmlld3Mpe1xyXG4gICAgICAgIGlmKGlkKXtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGIudGhlbihkYiA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzdG9yZSA9IGRiLnRyYW5zYWN0aW9uKCdyZXN0YXVyYW50cycsICdyZWFkd3JpdGUnKS5vYmplY3RTdG9yZSgncmVzdGF1cmFudHMnKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0b3JlLmdldChOdW1iZXIoaWQpKS50aGVuKChyZXN0YXVyYW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdGF1cmFudC5yZXZpZXdzID0gcmV2aWV3cztcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RvcmUucHV0KHJlc3RhdXJhbnQpO1xyXG4gICAgICAgICAgICAgICAgfSkudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RvcmUuY29tcGxldGU7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgIH0sXHJcbiAgICBnZXRSZXN0YXVyYW50cyhpZCA9IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRiLnRoZW4oZGIgPT4ge1xyXG4gICAgICAgICAgY29uc3Qgc3RvcmUgPSBkYi50cmFuc2FjdGlvbigncmVzdGF1cmFudHMnLCAncmVhZG9ubHknKS5vYmplY3RTdG9yZSgncmVzdGF1cmFudHMnKTtcclxuICAgICAgICAgIGlmIChpZCkgcmV0dXJuIHN0b3JlLmdldChOdW1iZXIoaWQpKTtcclxuICAgICAgICAgIHJldHVybiBzdG9yZS5nZXRBbGwoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSxcclxuICAgIGdldFJldmlld3MoaWQgPSB1bmRlZmluZWQpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmRiLnRoZW4oKGRiKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHN0b3JlID0gZGIudHJhbnNhY3Rpb24oJ3Jlc3RhdXJhbnRzJywgJ3JlYWRvbmx5Jykub2JqZWN0U3RvcmUoJ3Jlc3RhdXJhbnRzJyk7XHJcbiAgICAgICAgICAgIGlmKGlkKSByZXR1cm4gc3RvcmUuZ2V0KE51bWJlcihpZCkpLnRoZW4ocmVzdGF1cmFudCA9PiB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdGF1cmFudC5yZXZpZXdzXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH0pXHJcbiAgICB9LFxyXG59O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGJQcm9taXNlOyIsIi8vSW5zdGFsbCBzZXJ2aWNlIHdvcmtlclxyXG5pZiAobmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIpIHtcclxuICAgICAgbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIucmVnaXN0ZXIoJy9zdy5qcycpLnRoZW4oZnVuY3Rpb24ocmVnaXN0cmF0aW9uKSB7XHJcbiAgICAgICAgLy8gUmVnaXN0cmF0aW9uIHdhcyBzdWNjZXNzZnVsXHJcbiAgICAgICAgY29uc29sZS5sb2coJ1NlcnZpY2VXb3JrZXIgcmVnaXN0cmF0aW9uIHN1Y2Nlc3NmdWwgd2l0aCBzY29wZTogJywgcmVnaXN0cmF0aW9uLnNjb3BlKTtcclxuICAgICAgfSkuY2F0Y2goKGVycikgPT4ge1xyXG4gIGNvbnNvbGUubG9nKCdTZXJ2aWNlV29ya2VyIHJlZ2lzdHJhdGlvbiBmYWlsZWQ6ICcsIGVycik7XHJcbn0pOyAgXHJcbn1cclxuXHJcbm5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLnJlYWR5LnRoZW4oc3dSZWdpc3RyYXRpb24gPT4gc3dSZWdpc3RyYXRpb24uc3luYy5yZWdpc3RlcigndG9kb191cGRhdGVkJykpOyIsImltcG9ydCBEQkhlbHBlciBmcm9tICcuL2RiaGVscGVyJztcclxuaW1wb3J0IFNFQ1JFVCBmcm9tICcuL3NlY3JldCc7XHJcbmltcG9ydCAnLi9yZWdpc3Rlci1zdyc7XHJcblxyXG5sZXQgcmVzdGF1cmFudDtcclxudmFyIG5ld01hcDtcclxuY29uc3Qgd29ya2VyID0gbmV3IFdvcmtlcignanMvd29ya2VyLmpzJyk7XHJcblxyXG4vKipcclxuICogSW5pdGlhbGl6ZSBtYXAgYXMgc29vbiBhcyB0aGUgcGFnZSBpcyBsb2FkZWQuXHJcbiAqL1xyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKGV2ZW50KSA9PiB7ICBcclxuICBpbml0TWFwKCk7XHJcbiAgc2VsZi5hZGRFdmVudExpc3RlbmVyKCdzdWJtaXQnLCBzdWJtaXRSZXZpZXcpO1xyXG59KTtcclxuXHJcbi8qKlxyXG4gKiBJbml0aWFsaXplIGxlYWZsZXQgbWFwXHJcbiAqL1xyXG5jb25zdCBpbml0TWFwID0gKCkgPT4ge1xyXG4gIGZldGNoUmVzdGF1cmFudEZyb21VUkwoKGVycm9yLCByZXN0YXVyYW50KSA9PiB7XHJcbiAgICBpZiAoZXJyb3IpIHsgLy8gR290IGFuIGVycm9yIVxyXG4gICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGlmIChuYXZpZ2F0b3Iub25MaW5lKXtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgbmV3TWFwID0gTC5tYXAoJ21hcCcsIHtcclxuICAgICAgICAgICAgY2VudGVyOiBbcmVzdGF1cmFudC5sYXRsbmcubGF0LCByZXN0YXVyYW50LmxhdGxuZy5sbmddLFxyXG4gICAgICAgICAgICB6b29tOiAxNixcclxuICAgICAgICAgICAgc2Nyb2xsV2hlZWxab29tOiBmYWxzZVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBMLnRpbGVMYXllcignaHR0cHM6Ly9hcGkudGlsZXMubWFwYm94LmNvbS92NC97aWR9L3t6fS97eH0ve3l9LmpwZzcwP2FjY2Vzc190b2tlbj17bWFwYm94VG9rZW59Jywge1xyXG4gICAgICAgICAgICBtYXBib3hUb2tlbjogU0VDUkVULm1hcGJveF9rZXksXHJcbiAgICAgICAgICAgIG1heFpvb206IDE4LFxyXG4gICAgICAgICAgICBhdHRyaWJ1dGlvbjogJ01hcCBkYXRhICZjb3B5OyA8YSBocmVmPVwiaHR0cHM6Ly93d3cub3BlbnN0cmVldG1hcC5vcmcvXCI+T3BlblN0cmVldE1hcDwvYT4gY29udHJpYnV0b3JzLCAnICtcclxuICAgICAgICAgICAgICAnPGEgaHJlZj1cImh0dHBzOi8vY3JlYXRpdmVjb21tb25zLm9yZy9saWNlbnNlcy9ieS1zYS8yLjAvXCI+Q0MtQlktU0E8L2E+LCAnICtcclxuICAgICAgICAgICAgICAnSW1hZ2VyeSDCqSA8YSBocmVmPVwiaHR0cHM6Ly93d3cubWFwYm94LmNvbS9cIj5NYXBib3g8L2E+JyxcclxuICAgICAgICAgICAgaWQ6ICdtYXBib3guc3RyZWV0cycgICAgXHJcbiAgICAgICAgICB9KS5hZGRUbyhuZXdNYXApO1xyXG4gICAgICAgICAgREJIZWxwZXIubWFwTWFya2VyRm9yUmVzdGF1cmFudChyZXN0YXVyYW50LCBuZXdNYXApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaChlcnJvcil7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygnVW5hYmxlIHRvIGluaXRpYWxpemUgbWFwOiAnLCBlcnJvcik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9ICAgICAgXHJcbiAgICAgIGZpbGxCcmVhZGNydW1iKCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbn0gIFxyXG5cclxuLyoqXHJcbiAqIEdldCBjdXJyZW50IHJlc3RhdXJhbnQgZnJvbSBwYWdlIFVSTC5cclxuICovXHJcbmNvbnN0IGZldGNoUmVzdGF1cmFudEZyb21VUkwgPSAoY2FsbGJhY2spID0+IHtcclxuICAvLyBpZiAoc2VsZi5yZXN0YXVyYW50KSB7IC8vIHJlc3RhdXJhbnQgYWxyZWFkeSBmZXRjaGVkIVxyXG4gIC8vICAgY2FsbGJhY2sobnVsbCwgc2VsZi5yZXN0YXVyYW50KVxyXG4gIC8vICAgcmV0dXJuO1xyXG4gIC8vIH1cclxuICBjb25zdCBpZCA9IGdldFBhcmFtZXRlckJ5TmFtZSgnaWQnKTtcclxuICBpZiAoIWlkKSB7IC8vIG5vIGlkIGZvdW5kIGluIFVSTFxyXG4gICAgZXJyb3IgPSAnTm8gcmVzdGF1cmFudCBpZCBpbiBVUkwnXHJcbiAgICBjYWxsYmFjayhlcnJvciwgbnVsbCk7XHJcbiAgfSBlbHNlIHtcclxuICAgIERCSGVscGVyLmZldGNoUmVzdGF1cmFudEJ5SWQoaWQsIChlcnJvciwgcmVzdGF1cmFudCkgPT4ge1xyXG4gICAgICBzZWxmLnJlc3RhdXJhbnQgPSByZXN0YXVyYW50O1xyXG4gICAgICBpZiAoIXJlc3RhdXJhbnQpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdVbmFibGUgdG8gZmV0Y2ggcmVzdGF1cmFudDogJywgZXJyb3IpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBEQkhlbHBlci5mZXRjaFJldmlld3NCeVJlc3RhdXJhbnQoaWQsIChlcnJvciwgcmV2aWV3cykgPT4ge1xyXG4gICAgICAgIHNlbGYucmVzdGF1cmFudC5yZXZpZXdzID0gcmV2aWV3cztcclxuICAgICAgICBpZighcmV2aWV3cykge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcignUmV2aWV3czogJywgZXJyb3IpO1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmaWxsUmVzdGF1cmFudEhUTUwoKTtcclxuICAgICAgICBjYWxsYmFjayhudWxsLCByZXN0YXVyYW50KTt9KTtcclxuICAgIH0pOyBcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhdGUgcmVzdGF1cmFudCBIVE1MIGFuZCBhZGQgaXQgdG8gdGhlIHdlYnBhZ2VcclxuICovXHJcbmNvbnN0IGZpbGxSZXN0YXVyYW50SFRNTCA9IChyZXN0YXVyYW50ID0gc2VsZi5yZXN0YXVyYW50KSA9PiB7XHJcbiAgY29uc3QgbmFtZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXN0YXVyYW50LW5hbWUnKTtcclxuICBuYW1lLmlubmVySFRNTCA9IHJlc3RhdXJhbnQubmFtZTtcclxuXHJcbiAgY29uc3QgYWRkcmVzcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXN0YXVyYW50LWFkZHJlc3MnKTtcclxuICBhZGRyZXNzLmlubmVySFRNTCA9IHJlc3RhdXJhbnQuYWRkcmVzcztcclxuXHJcbiAgY29uc3QgaW1hZ2UgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVzdGF1cmFudC1pbWcnKTtcclxuICBpbWFnZS5jbGFzc05hbWUgPSAncmVzdGF1cmFudC1pbWcnXHJcbiAgaW1hZ2UuYWx0ID0gYFBpY3R1cmUgb2YgJHtyZXN0YXVyYW50Lm5hbWV9YDtcclxuICBpbWFnZS5zcmMgPSBEQkhlbHBlci5pbWFnZVVybEZvclJlc3RhdXJhbnQocmVzdGF1cmFudCk7XHJcbiAgaW1hZ2Uuc3Jjc2V0ID0gREJIZWxwZXIuaW1hZ2VTcmNTZXRGb3JSZXN0YXVyYW50KHJlc3RhdXJhbnQpO1xyXG4gIGltYWdlLnNpemVzID0gREJIZWxwZXIuaW1hZ2VTaXplc0ZvclJlc3RhdXJhbnQocmVzdGF1cmFudCk7XHJcblxyXG4gIGNvbnN0IGN1aXNpbmUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVzdGF1cmFudC1jdWlzaW5lJyk7XHJcbiAgY3Vpc2luZS5pbm5lckhUTUwgPSByZXN0YXVyYW50LmN1aXNpbmVfdHlwZTtcclxuXHJcbiAgLy8gZmlsbCBvcGVyYXRpbmcgaG91cnNcclxuICBpZiAocmVzdGF1cmFudC5vcGVyYXRpbmdfaG91cnMpIHtcclxuICAgIGZpbGxSZXN0YXVyYW50SG91cnNIVE1MKCk7XHJcbiAgfVxyXG4gIC8vIGZpbGwgcmV2aWV3c1xyXG4gIGZpbGxSZXZpZXdzSFRNTCgpO1xyXG59XHJcblxyXG4vKipcclxuICogQ3JlYXRlIHJlc3RhdXJhbnQgb3BlcmF0aW5nIGhvdXJzIEhUTUwgdGFibGUgYW5kIGFkZCBpdCB0byB0aGUgd2VicGFnZS5cclxuICovXHJcbmNvbnN0IGZpbGxSZXN0YXVyYW50SG91cnNIVE1MID0gKG9wZXJhdGluZ0hvdXJzID0gc2VsZi5yZXN0YXVyYW50Lm9wZXJhdGluZ19ob3VycykgPT4ge1xyXG4gIGNvbnN0IGhvdXJzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc3RhdXJhbnQtaG91cnMnKTtcclxuICBmb3IgKGxldCBrZXkgaW4gb3BlcmF0aW5nSG91cnMpIHtcclxuICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RyJyk7XHJcblxyXG4gICAgY29uc3QgZGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGQnKTtcclxuICAgIGRheS5pbm5lckhUTUwgPSBrZXk7XHJcbiAgICByb3cuYXBwZW5kQ2hpbGQoZGF5KTtcclxuXHJcbiAgICBjb25zdCB0aW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGQnKTtcclxuICAgIHRpbWUuaW5uZXJIVE1MID0gb3BlcmF0aW5nSG91cnNba2V5XTtcclxuICAgIHJvdy5hcHBlbmRDaGlsZCh0aW1lKTtcclxuXHJcbiAgICBob3Vycy5hcHBlbmRDaGlsZChyb3cpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENyZWF0ZSBhbGwgcmV2aWV3cyBIVE1MIGFuZCBhZGQgdGhlbSB0byB0aGUgd2VicGFnZS5cclxuICovXHJcbmNvbnN0IGZpbGxSZXZpZXdzSFRNTCA9IChyZXZpZXdzID0gc2VsZi5yZXN0YXVyYW50LnJldmlld3MpID0+IHtcclxuICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmV2aWV3cy1jb250YWluZXInKTtcclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2gyJyk7XHJcbiAgdGl0bGUuaW5uZXJIVE1MID0gJ1Jldmlld3MnO1xyXG4gIGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aXRsZSk7XHJcblxyXG4gIGlmICghcmV2aWV3cykge1xyXG4gICAgY29uc3Qgbm9SZXZpZXdzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xyXG4gICAgbm9SZXZpZXdzLmlubmVySFRNTCA9ICdObyByZXZpZXdzIHlldCEnO1xyXG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKG5vUmV2aWV3cyk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIGNvbnN0IHVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jldmlld3MtbGlzdCcpO1xyXG4gIFxyXG4gIHJldmlld3MuZm9yRWFjaChyZXZpZXcgPT4ge1xyXG4gICAgdWwuYXBwZW5kQ2hpbGQoY3JlYXRlUmV2aWV3SFRNTChyZXZpZXcpKTtcclxuICB9KTtcclxuICBjb250YWluZXIuYXBwZW5kQ2hpbGQodWwpO1xyXG59XHJcblxyXG4vKipcclxuICogQ3JlYXRlIHJldmlldyBIVE1MIGFuZCBhZGQgaXQgdG8gdGhlIHdlYnBhZ2UuXHJcbiAqL1xyXG5jb25zdCBjcmVhdGVSZXZpZXdIVE1MID0gKHJldmlldykgPT4ge1xyXG4gIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcclxuICBjb25zdCBuYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xyXG4gIG5hbWUuaW5uZXJIVE1MID0gcmV2aWV3Lm5hbWU7XHJcbiAgbGkuYXBwZW5kQ2hpbGQobmFtZSk7XHJcblxyXG4gIGNvbnN0IGRhdGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XHJcbiAgZGF0ZS5pbm5lckhUTUwgPSBuZXcgRGF0ZShyZXZpZXcudXBkYXRlZEF0KTtcclxuICBsaS5hcHBlbmRDaGlsZChkYXRlKTtcclxuXHJcbiAgY29uc3QgcmF0aW5nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xyXG4gIHJhdGluZy5pbm5lckhUTUwgPSBgUmF0aW5nOiAke3Jldmlldy5yYXRpbmd9YDtcclxuICBsaS5hcHBlbmRDaGlsZChyYXRpbmcpO1xyXG5cclxuICBjb25zdCBjb21tZW50cyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcclxuICBjb21tZW50cy5pbm5lckhUTUwgPSByZXZpZXcuY29tbWVudHM7XHJcbiAgbGkuYXBwZW5kQ2hpbGQoY29tbWVudHMpO1xyXG5cclxuICByZXR1cm4gbGk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBZGQgcmVzdGF1cmFudCBuYW1lIHRvIHRoZSBicmVhZGNydW1iIG5hdmlnYXRpb24gbWVudVxyXG4gKi9cclxuY29uc3QgZmlsbEJyZWFkY3J1bWIgPSAocmVzdGF1cmFudD1zZWxmLnJlc3RhdXJhbnQpID0+IHtcclxuICBjb25zdCBicmVhZGNydW1iID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2JyZWFkY3J1bWInKTtcclxuICBjb25zdCBsaSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XHJcbiAgbGkuaW5uZXJIVE1MID0gcmVzdGF1cmFudC5uYW1lO1xyXG4gIGJyZWFkY3J1bWIuYXBwZW5kQ2hpbGQobGkpO1xyXG59XHJcblxyXG4vKipcclxuICogR2V0IGEgcGFyYW1ldGVyIGJ5IG5hbWUgZnJvbSBwYWdlIFVSTC5cclxuICovXHJcbmNvbnN0IGdldFBhcmFtZXRlckJ5TmFtZSA9IChuYW1lLCB1cmwpID0+IHtcclxuICBpZiAoIXVybClcclxuICAgIHVybCA9IHdpbmRvdy5sb2NhdGlvbi5ocmVmO1xyXG4gIG5hbWUgPSBuYW1lLnJlcGxhY2UoL1tcXFtcXF1dL2csICdcXFxcJCYnKTtcclxuICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoYFs/Jl0ke25hbWV9KD0oW14mI10qKXwmfCN8JClgKSxcclxuICAgIHJlc3VsdHMgPSByZWdleC5leGVjKHVybCk7XHJcbiAgaWYgKCFyZXN1bHRzKVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgaWYgKCFyZXN1bHRzWzJdKVxyXG4gICAgcmV0dXJuICcnO1xyXG4gIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQocmVzdWx0c1syXS5yZXBsYWNlKC9cXCsvZywgJyAnKSk7XHJcbn1cclxuXHJcbi8vLy9TdWJtaXQgUmV2aWV3XHJcbmNvbnN0IHN1Ym1pdFJldmlldyA9IChldmVudCkgPT4ge1xyXG4gIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgbGV0IHJldmlldyA9IHt9O1xyXG4gIGxldCByZXZpZXdzTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXZpZXdzLWxpc3QnKTtcclxuXHJcbiAgcmV2aWV3WyduYW1lJ10gPSBldmVudC50YXJnZXRbMF0udmFsdWU7XHJcbiAgcmV2aWV3WydyYXRpbmcnXSA9IGV2ZW50LnRhcmdldFsxXS52YWx1ZTtcclxuICByZXZpZXdbJ2NvbW1lbnRzJ10gPSBldmVudC50YXJnZXRbMl0udmFsdWU7XHJcbiAgcmV2aWV3WydyZXN0YXVyYW50X2lkJ10gPSBnZXRQYXJhbWV0ZXJCeU5hbWUoJ2lkJyk7XHJcbiAgcmV2aWV3Wyd1cGRhdGVkQXQnXSA9IG5ldyBEYXRlKCk7XHJcblxyXG4gIHJldmlld3NMaXN0LmFwcGVuZChjcmVhdGVSZXZpZXdIVE1MKHJldmlldykpO1xyXG5cclxuICBpZih3aW5kb3cuV29ya2VyKXtcclxuICAgIHdvcmtlci5wb3N0TWVzc2FnZShyZXZpZXcpO1xyXG4gICAgY29uc29sZS5sb2coJ1JldmlldyBwb3N0ZWQgdG8gd29ya2VyJyk7XHJcbiAgICB3b3JrZXIub25tZXNzYWdlID0gZnVuY3Rpb24oZXZlbnQpe1xyXG4gICAgICBjb25zb2xlLmxvZygnTWVzc2FnZSByZWNpZXZlZCBmcm9tIHdvcmtlcjogJywgZXZlbnQuZGF0YSk7XHJcbiAgICB9XHJcbiAgfSBcclxufVxyXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBTRUNSRVQge1xyXG4gICAgc3RhdGljIGdldCBtYXBib3hfa2V5KCl7XHJcbiAgICAgICAgcmV0dXJuICdway5leUoxSWpvaVpHVnpaR1Z0YjI1b2RTSXNJbUVpT2lKamFtMXRabVo2TVhvd2FXNXJNM0Z3TldsMmNITm5jRGcwSW4wLktPOVVUZXk3LUFkN04wcWxQOTFDZ2cnO1xyXG4gICAgfVxyXG59Il19
