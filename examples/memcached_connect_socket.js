var nMemcached = require( '../' ),
	memcached;

// connect to our memcached server listening on Unix socket /tmp/.memcached.sock
memcached = new nMemcached( '/tmp/.memcached.sock' );
