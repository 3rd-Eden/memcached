var	nMemcached = require( '../' ),
	memcached;

// connect to our memcached server on host 10.211.55.5, port 11211
memcached = new nMemcached( "10.211.55.5:11211" );

memcached.decrement( "hello", 1, function( err, result ){
	if( err ) console.error( err );
	
	console.log("result:" + result );
	memcached.end(); // as we are 100% certain we are not going to use the connection again, we are going to end it
});