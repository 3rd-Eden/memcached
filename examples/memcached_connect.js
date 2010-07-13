var sys = require( 'sys' ),
	memcached = require( '../memcached' ).client,
	cache;
	
cache = new memcached( "10.211.55.5:112211" );