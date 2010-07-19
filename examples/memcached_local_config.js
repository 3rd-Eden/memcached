var sys = require( 'sys' ),
	nMemcached = require( '../nMemcached' ).Client,
	memcached;

// Set a global configuration:
nMemcached.config.pool_size = 25;

/*
	All options:
		
		property: 				default, 	// descriptions
		------------------------------------------------------------------------------------------------------
		max_key_size: 			251,		// max keysize allowed by Memcached
		max_expiration: 		2592000,	// max expiration duration allowed by Memcached
		max_value: 				1048576,	// max length of value allowed by Memcached
	
		pool_size: 				10,			// maximal parallel connections
		reconnect: 				18000000,	// if dead, attempt reconnect each xx ms
		retries: 				5,			// amount of retries before server is dead
		retry: 					30000,		// timeout between retries, all call will be marked as cache miss
		remove: 				false,		// remove server if dead if false, we will attempt to reconnect
	
		compression_threshold: 10240,		// only than will compression be usefull
		key_compression: true		 		// compress keys if they are to large (md5)
	
*/

// the options in the constructor allows you overwrite the globals
memcached3 = new nMemcached( "10.211.55.5:11213", { pool_size: 35 } );
memcached2 = new nMemcached( "10.211.55.5:11211" );
memcached1 = new nMemcached( "10.211.55.5:11212" );

// test the output
sys.puts( memcached1.pool_size ); // 25
sys.puts( memcached2.pool_size == memcached1.pool_size ); // true
sys.puts( memcached3.pool_size == 35 ); // true