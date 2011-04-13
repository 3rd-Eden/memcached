var sys = require( 'sys' ),
	nMemcached = require( '../' ),
	memcached;

// Set a global configuration
nMemcached.config.poolSize = 25;

memcached2 = new nMemcached( "10.211.55.5:11211" );
memcached1 = new nMemcached( "10.211.55.5:11212" );

sys.puts( memcached1.poolSize ); // 25
sys.puts( memcached2.poolSize == memcached1.poolSize ); // true