var sys = require( 'sys' ),
	nMemcached = require( '../' ),
	memcached;

// Set a global configuration:
nMemcached.config.poolSize = 25;

// the options in the constructor allows you overwrite the globals
memcached3 = new nMemcached( "10.211.55.5:11213", { poolSize: 35 } );
memcached2 = new nMemcached( "10.211.55.5:11211" );
memcached1 = new nMemcached( "10.211.55.5:11212" );

// test the output
sys.puts( memcached1.poolSize ); // 25
sys.puts( memcached2.poolSize == memcached1.poolSize ); // true
sys.puts( memcached3.poolSize == 35 ); // true