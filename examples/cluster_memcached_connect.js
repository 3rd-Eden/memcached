var sys = require( 'sys' ),
	nMemcached = require( '../' ),
	assert = require('assert'),
	memcached;

// connect to our memcached server on host 10.211.55.5, port 11211
memcached = new nMemcached( ["10.211.55.5:11211","10.211.55.5:11212","10.211.55.5:11213"] );
memcached.set( "hello_world", "greetings from planet node", 1000, function( err, success ){
	
	// check if the data was stored
	assert.equal( success, true, "Successfully stored data" )
	
	memcached.get( "hello_world", function( err, success ){
		assert.equal( success, "greetings from planet node", "Failed to fetched data" )
		sys.puts( success );
		memcached.end()
	});
});