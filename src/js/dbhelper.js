import dbPromise from './dbpromise';
/**
 * Common database helper functions.
 */
export default class DBHelper {

  /**
   * Database URL.
   * Change this to restaurants.json file location on your server.
   */
  static get DATABASE_URL() {
    const port = 8000 // Change this to your server port
    return `http://localhost:${port}/data/restaurants.json`;
  }

  static get API_URL(){
    const port = 1337;
    return `http://localhost:${port}`
  }

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
  static fetchRestaurants(callback){
    fetch(`${DBHelper.API_URL}/restaurants`).then((response)=> {
        const r = response.json();
        r.then((restaurants) => {
          dbPromise.putRestaurants(restaurants);
          callback(null, restaurants);
        })
    }).catch((error) => {
      dbPromise.getRestaurants().then((restaurants)=>{
        if(restaurants.length > 0){
          callback(null, restaurants);
        } else {
          const errorMessage = 'Unable to get restaurants from IndexDB: '
          callback(errorMessage, error, null);
        }
      })
    })
  }

  /**
   * Fetch a restaurant by its ID.
   */
  static fetchRestaurantById(id, callback) {
    fetch(`${DBHelper.API_URL}/restaurants/${id}`).then(response => {
      if (!response.ok) return Promise.reject("Restaurant couldn't be fetched from network");
      return response.json();
    })
    .then((restaurant)=> {
      dbPromise.putRestaurants(restaurant)
      return callback(null, restaurant);
    }).catch((error) => {
      console.log(id, error);
      dbPromise.getRestaurants(id).then((restaurant)=>{
        return callback(null, restaurant);
      });
    });
  }

  static fetchReviewsByRestaurant(id, callback){
    fetch(`${DBHelper.API_URL}/reviews/?restaurant_id=${id}`).then(response => {
      if (!response.ok) return Promise.reject("Restaurant Reviews couldn't be fetched from network");
      return response.json();
    }).then((reviews)=> {
      dbPromise.getReviews(id).then((dbReviews)=>{
        if(!dbReviews || reviews.length >= dbReviews.length){
          dbPromise.putReviews(id, reviews).then(() =>{
            return callback(null, reviews);
          })
        }else {
          dbPromise.getReviews(id).then((reviews)=>{
            return callback(null, reviews);
          });
        }
      })
    }).catch((error) => {
      dbPromise.getReviews(id).then((reviews)=>{
        if(reviews){
          return callback(null, reviews);
        }
        else {
          return callback(error, null);
        }
      });
    });
  }

  /**
   * Fetch restaurants by a cuisine type with proper error handling.
   */
  static fetchRestaurantByCuisine(cuisine, callback) {
    // Fetch all restaurants  with proper error handling
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Filter restaurants to have only given cuisine type
        const results = restaurants.filter(r => r.cuisine_type == cuisine);
        callback(null, results);
      }
    });
  }

  /**
   * Fetch restaurants by a neighborhood with proper error handling.
   */
  static fetchRestaurantByNeighborhood(neighborhood, callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Filter restaurants to have only given neighborhood
        const results = restaurants.filter(r => r.neighborhood == neighborhood);
        callback(null, results);
      }
    });
  }

  /**
   * Fetch restaurants by a cuisine and a neighborhood with proper error handling.
   */
  static fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        let results = restaurants
        if (cuisine != 'all') { // filter by cuisine
          results = results.filter(r => r.cuisine_type == cuisine);
        }
        if (neighborhood != 'all') { // filter by neighborhood
          results = results.filter(r => r.neighborhood == neighborhood);
        }
        callback(null, results);
      }
    });
  }

  /**
   * Fetch all neighborhoods with proper error handling.
   */
  static fetchNeighborhoods(callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Get all neighborhoods from all restaurants
        const neighborhoods = restaurants.map((v, i) => restaurants[i].neighborhood)
        // Remove duplicates from neighborhoods
        const uniqueNeighborhoods = neighborhoods.filter((v, i) => neighborhoods.indexOf(v) == i)
        callback(null, uniqueNeighborhoods);
      }
    });
  }

  /**
   * Fetch all cuisines with proper error handling.
   */
  static fetchCuisines(callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Get all cuisines from all restaurants
        const cuisines = restaurants.map((v, i) => restaurants[i].cuisine_type)
        // Remove duplicates from cuisines
        const uniqueCuisines = cuisines.filter((v, i) => cuisines.indexOf(v) == i)
        callback(null, uniqueCuisines);
      }
    });
  }

  /**
   * Restaurant page URL.
   */
  static urlForRestaurant(restaurant) {
    return (`./restaurant.html?id=${restaurant.id}`);
  }

  /**
   * Restaurant image URL.
   */
  static imageUrlForRestaurant(restaurant) {
    return (`/img/${restaurant.photograph || restaurant.id}-medium.jpg`);
  }

  static imageSrcSetForRestaurant(restaurant){
    const imgSrc = `/img/${restaurant.photograph || restaurant.id}`;
    return `${imgSrc}-small.jpg 300w,
            ${imgSrc}-medium.jpg 600w,
            ${imgSrc}-large.jpg 800w`
  }

  static imageSizesForRestaurant(restaurant) {
    return `(max-width: 360px) 280px,
            (max-width: 600px) 600px,
            400px`;
  }

  /**
   * Map marker for a restaurant.
   */
   static mapMarkerForRestaurant(restaurant, map) {
    // https://leafletjs.com/reference-1.3.0.html#marker  
    const marker = new L.marker([restaurant.latlng.lat, restaurant.latlng.lng],
      {title: restaurant.name,
      alt: restaurant.name,
      url: DBHelper.urlForRestaurant(restaurant)
      })
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

  static submitReviewByRestaurant(review) {
    fetch(`${DBHelper.API_URL}/reviews`, {
      method:'POST',
      body: JSON.stringify({
        "restaurant_id": review.restaurant_id,
        "name": review.name,
        "rating": review.rating,
        "comments": review.comments
    })
    }).then((response) => {
      return response;
    }).catch((error) => {
      dbPromise.getReviews(review.restaurant_id).then((reviews)=>{
        let allReviews = reviews.concat(review);
        console.log(allReviews);
        
        dbPromise.putReviews(review.restaurant_id, allReviews);
      })
    }) 
  }

  static updateDatabase(){
    dbPromise.getRestaurants().then((restaurants)=> {
      restaurants.forEach(restaurant => {
        if(restaurant.reviews){
          restaurant.reviews.forEach((review) => {
            if(!review.id){
              console.log('in updateDatabase: ',review);
              
              this.submitReviewByRestaurant(review);
            }
          })
        }
      });
    })
  }

  static submitFavorite(id, value){
    fetch(`${DBHelper.API_URL}/restaurants/${id}`, {
      method: 'POST',
      body: JSON.stringify({
        "favorite": value,
    })
    }).then((response) => {
      return response;
    })
  }

}