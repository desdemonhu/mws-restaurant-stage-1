import DBHelper from './dbhelper';

onmessage = function(event) {
    console.log('Message received from main script');
    console.log(event.data);
    DBHelper.submitReviewByRestaurant(event.data);
    console.log('Posting message back to main script');
    postMessage(event.data.name);
}