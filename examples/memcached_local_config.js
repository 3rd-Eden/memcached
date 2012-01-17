var nMemcached = require( '../' ),
	memcached1,
	memcached2,
	memcached3;

// Set a global configuration:
nMemcached.config.poolSize = 25;

// the options in the constructor allows you overwrite the globals
memcached3 = new nMemcached( "10.211.55.5:11213", { poolSize: 35 } );
memcached2 = new nMemcached( "10.211.55.5:11211" );
memcached1 = new nMemcached( "10.211.55.5:11212" );

// test the output
process.stdout.write( memcached1.poolSize ); // 25
process.stdout.write( memcached2.poolSize == memcached1.poolSize ); // true
process.stdout.write( memcached3.poolSize == 35 ); // true
