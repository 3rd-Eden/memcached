var sys = require( 'sys' ),
	net = require( 'net' ),
	hashRing = require( './lib/hashring' ).hashRing,
	nMemcached;

// our nMemcached class
nMemcached = function( memcached_servers ){
	
	var servers = [],
		weights = {},
		key;
	
	// To make it easier for users to get started with the memcached client we are going to allow them to send in different
	// server configuration formats. Not everybody requires multiple memcached clusters or even specify weights on the servers
	// so we support the follow formats:	
	
	if( Array.isArray( memcached_servers ) ){
		// var memcache = new memcached( [ '192.168.0.102:11212', '192.168.0.103:11212', '192.168.0.104:11212' ] )
		servers = memcached_servers;
	} else if( typeof memcached_servers == 'string' ){
		// var memcache = new memcached( '192.168.0.102:11212' )
		servers.push( memcached_servers )
	} else {
		// var memcache = new memcached( { '192.168.0.102:11212': 1, '192.168.0.103:11212': 2, '192.168.0.104:11212': 1 }) 
		weights = memcached_servers;
		for( key in weights ){
			servers.push( key );
		}
	}
	
	// This will store and map our net connections
	this.connectionpool = {};
	this.ring = new hashRing( servers, weights );
	
	// @TODO this isn't ideal, starting with all connecting all servers, what would be better to make a function that returns the correct connection for a key
	// eg: nMemcached.get_connection( user_key ); which looks up the server in the keyring, checks our connection pool, and connects if needed and returns the connection
	this.connect();
};

// It would be utterly pointless if you are going to include a memcached library and not connect 
// servers we just recieved ;)
nMemcached.prototype = {
	constructor:nMemcached,
	
	connect: function(){
		var self = this,
			// you might think doing a new RegExp is utterly pointless, I agree with you, but due to a bug in the V8 engine
			// it cannot re-use generated /regexp/ as it will fail to execute properly
			server_split_re = new RegExp( "(.*):(\\d+){1,}$" );
			
		this.ring.nodes.forEach( function( server ){
			// The regexp chunks down the server address for us, splitting host and port so we can set up a connection example chunks:
			// server_split_re.exec("3ffe:6a88:85a3:0:1319:8a2e:0370:7344") => ["3ffe:6a88:85a3:0:1319:8a2e:0370:7344", "3ffe:6a88:85a3:0:1319:8a2e:0370", "7344"]
			// server_split_re.exec("192.168.0.102:11212") => ["192.168.0.102:11212", "192.168.0.102", "11212"]
			
			var chunks = server_split_re.exec( server ),
				connection;
				
			if( chunks )
				connection = new net.createConnection( chunks[2], chunks[1] );
			
			// if the server exists, close the current connection before we overwrite it
			if( self.connectionpool[ server ] && self.connectionpool[ server ].readyState === 'open' )
				self.connectionpool[ server ].close();
			
			// add the connection to the connection pool so we can do quick loops when we get the correct node back from our hashRing
			self.connectionpool[ server ] = connection;
		});
	}
}

exports.client = nMemcached;