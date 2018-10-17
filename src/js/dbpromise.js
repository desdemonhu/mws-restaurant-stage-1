import IDB from 'idb';

const dbPromise = {
    db : IDB.open('restaurant-reviews-db', 2, (upgradeDB) =>{
        switch(upgradeDB.oldVersion){
            case 0:
                upgradeDB.createObjectStore('restaurants', {keyPath: 'id'})
            break;
        }
    }),
    putRestaurants(restaurants) {
        if (!restaurants.push){ restaurants = [restaurants]};
        return this.db.then(db => {
        const store = db.transaction('restaurants', 'readwrite').objectStore('restaurants');
        Promise.all(restaurants.map(networkRestaurant => {
            return store.get(networkRestaurant.id).then(idbRestaurant => {
            if (!idbRestaurant || networkRestaurant.updatedAt > idbRestaurant.updatedAt) {
                return store.put(networkRestaurant);  
            } 
            });
        })).then(function () {
            return store.complete;
        });
        });
    },
    putReviews(id, reviews){
        if(id){
            return this.db.then(db => {
                const store = db.transaction('restaurants', 'readwrite').objectStore('restaurants')
                return store.get(Number(id)).then((restaurant) => {
                    restaurant.reviews = reviews;
                    return store.put(restaurant);
                }).then(function() {
                    return store.complete;
                })
            })
        }
    },
    getRestaurants(id = undefined) {
        return this.db.then(db => {
          const store = db.transaction('restaurants').objectStore('restaurants');
          if (id) return store.get(Number(id));
          return store.getAll();
        });
      },
    getReviews(id = undefined){
        return this.db.then((db) => {
            const store = db.transaction('restaurants').objectStore('restaurants');
            if(id) return store.get(Number(id)).then(restaurant => {
                return restaurant.reviews
            })
            return null;
        })
    },
};

export default dbPromise;