var	nMemcached = require( '../' ),
	memcached;

// connect to our memcached server on host 10.211.55.5, port 11211
memcached = new nMemcached( "10.211.55.5:11211" );

memcached.set( "hello", 1, 10000, function( err, result ){
	// it would be kinda pointless to get a value that doesn't exists.
	memcached.gets( "hello", function( err, result ){
		if( err ) console.error( err );
		
		console.dir( result );
		memcached.cas( "hello", 2, result.cas, 10000, function( err, result ){
			if( err ) console.error( err );
			
			// the result will be "false" if our "cas" number is lower than the cas value on the server. 
		
			console.dir( result );
			memcached.end(); // as we are 100% certain we are not going to use the connection again, we are going to end it
		})
	});
});