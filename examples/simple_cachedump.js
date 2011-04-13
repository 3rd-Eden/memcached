var	nMemcached = require( '../' ),
	memcached;

// connect to our memcached server on host 10.211.55.5, port 11211
memcached = new nMemcached( "10.211.55.6:11211" );

memcached.items( function( err, result ){
	if( err ) console.error( err );
	
	// for each server... 
	result.forEach(function( itemSet ){
		var keys = Object.keys( itemSet );
			keys.pop(); // we don't need the "server" key, but the other indicate the slab id's
			
		keys.forEach(function( stats ){
			
			// get a cachedump for each slabid and slab.number
			memcached.cachedump( itemSet.server, stats, itemSet[stats].number, function( err, response ){
				// dump the shizzle
				console.info( JSON.stringify( response ) );
				console.log( response.key );
			})
		})
	})
});