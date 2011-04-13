var	nMemcached = require( '../' ),
	memcached;
	
// connect to a unknown server
memcached = new nMemcached( "10.211.55.6:11211" );

// each time a server fails
memcached.on( "issue", function( issue ){
	console.log( "Issue occured on server " + issue.server + ", " + issue.retries  + " attempts left untill failure" );
});

memcached.on( "failure", function( issue ){
	console.log( issue.server + " failed!" );
});

memcached.on( "reconnecting", function( issue ){
	console.log( "reconnecting to server: " + issue.server + " failed!" );
})

// execute a memcached command
setInterval(function(){
	memcached.get( "hello", function( err, result ){
		if( err ) console.error( err );
		if( result ) console.log( 'received results: ' + result );
		if( !result ) console.log( 'memcached detected a cache miss' );
	});
	
}, 5010 );