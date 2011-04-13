var sys = require( 'sys' ),
	nMemcached = require( '../' ),
	memcached;

// connect to our memcached server on host 10.211.55.5, port 11211
memcached = new nMemcached( "10.211.55.5:11211" );