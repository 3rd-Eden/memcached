var	nMemcached = require( '../' );

// connect to our memcached server on host 10.211.55.5, port 11211
var memcached = new nMemcached( "10.211.55.5:11211" );

memcached.get( ["hello", "hello_json"], function( err, result ){
	if( err ) console.error( err );
	
	if( result.hello_json ){
		console.log( "we have a hello_json" );
	}
	
	if( result.hello ){
		console.log( "we have a hello" )
	}
	console.dir( result );
	memcached.end(); // as we are 100% certain we are not going to use the connection again, we are going to end it
});