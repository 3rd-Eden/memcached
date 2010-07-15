var sys = require('sys'),
	net = require('net'),
	crypto = require( 'crypto' ),
	
	buffer = require('buffer').Buffer,
	hashring = require('./lib/hashring').hashRing;

// line ending that is used for sending and compiling Memcached commands
var _nMemcached_end = '\r\n';

// Allows us to manage multiple net connection for client
var poolManager = exports.poolManager = function( name, max, constructor ){
	
	this.name = name;
	this.max = max;
	this.constructor = constructor;
	this.list = [];
};

// allocates a availble connection, the opposite of the Freelist plugin, this actually creates many of the same
poolManager.prototype.fetch = function( callback ){
	var i = this.list.length, construct, self = this;
	
	// search for an inactive open connection
	while( i-- )
		if( !this.list[i].active && this.list[i].readyState == 'open' )
			return callback( false, this.list[i] );
	
	// the constructor now handles off the callback
	if( this.list.length < this.max ){
		construct = this.constructor.apply( this, arguments );
		return this.list.push( construct );
	
	// no connections ready to be used, check again later
	} else {
		process.nextTick( function(){ self.alloc( callback ) } );
	}
};

// removes a item from the connection pool
poolManager.prototype.remove = function( list_item ){
	var index = this.list.indexOf( list_item );
	if( index !== -1 )
		this.list.splice( index, 1 );
};

// closes all connections in the pool and removes them from the queue
poolManager.prototype.destroy = function(){
	var i = this.list.length;
	while( i-- )
		this.list[i].end();
		
	this.list.length = 0;
	this.constructor = null;
};

var nMemcached = exports.client = function( memcached_servers, options ){
	
	var servers = [],
		weights = {},
		key;
		
	// To make it easier for users to get started with the memcached client we are going to allow them to send in different
	// server configuration formats. Not everybody requires multiple memcached clusters or even specify weights on the servers
	// so we support the follow formats:	
	
	// var memcache = new memcached( [ '192.168.0.102:11212', '192.168.0.103:11212', '192.168.0.104:11212' ] )
	if( Array.isArray( memcached_servers ) )
		servers = memcached_servers;
		
	// var memcache = new memcached( '192.168.0.102:11212' )
	else if( typeof memcached_servers == 'string' )
		servers.push( memcached_servers );
		
	// var memcache = new memcached( { '192.168.0.102:11212': 1, '192.168.0.103:11212': 2, '192.168.0.104:11212': 1 }) 
	else {
		weights = memcached_servers;
		for( key in weights ){
			servers.push( key );
		}
	}
	
	// current restrictions of a unmodified Memcached server
	// these can be overwritten with the options parameter
	this.max_key = 250;
	this.max_expiration = 2592000;
	this.max_value = 1024*1024;
	
	// other options
	this.max_connection_pool = 10;	// The max amount connections we can make to the same server, used for multi commands and async requests
	this.retry_dead = 30000;		// The nr of ms before retrying a dead server
	this.remove_dead = false;		// Ability to remove a server for the hashring if it's been marked dead more than x times. Or false to disabled
	this.compress_keys = true;		// compreses the key to a md5 if it's larger than the max_key size
	
	// fuse the options with our configuration
	this.__fuse( options );
	
	this.servers = servers;
	this.hashring = new hashring( servers, weights );
	this.pool = {};
	this.dead = {};
};

// allows us to emit events when needed, for example when a server is dead,
// you might want to get notified when this happens.
sys.inherits( nMemcached, process.EventEmitter );

// fuses an object with our internal properties, allowing users to further configure the client to their needs
nMemcached.prototype.__fuse = function( options, ignoreUndefinedProps ){
	if( !options )
		return;
		
	var key, undefined;
	
	for( key in options ){
		if( ignoreUndefinedProps && this[ key ] == undefined )
			continue;
			
		this[ key ] = options[ key ];
	}
};

nMemcached.prototype.__received_data = function( data, connection ){

};

// sends the actual query to memcached server
nMemcached.prototype.__query = function( connection, query, callback ){
	
	// we have no connection, we are going to fail silently the server might be borked
	if( !connection )
		return callback( false, false );
	
	if( connection.readyState !== 'open' )
		return callback( 'Error sending Memcached command, connection readyState is set to ' + connection.readyState, connection );
	
	connection._nMcallbacks.push( callback );
	connection.active = true;
	connection.write( query + _nMemcached_end );
};

nMemcached.prototype.__connect = function( node, callback ){
	// check if we already created a connection pool for that server
	if( node in this.pool )
		return this.pool[ node ].fetch( callback );
	
	var servertkn = /(.*):(\d+){1,}$/.exec( node ),
		nM = this;
	
	//
	nM.pool[ node ] = new poolManager( node, nM.max_connection_pool, function( callback ){
		var connection = net.createConnection( servertkn[2], servertkn[1] ),
			pool = this;
		
		// stores connection specific callbacks
		connection._nMcallbacks = [];
		
		// attach the events:
		// the connection is ready for usage
		connection.addListener( 'connect', function(){
			this.setTimeout( 0 );
			this.setNoDelay();
			callback( false, this );
		});
		
		// the connect recieved data from the Memcached server
		connection.addListener( 'data', function( data ){
			nM._received_data( data, this );
			this.active = false;
		});
		
		// something happend to the Memcached serveer sends a 'FIN' packet, so we will just close the connection
		connection.addListener( 'end', function(){
			this.end();
		});
		
		// something happend while connecting to the server
		connection.addListener( 'error', function( error ){
			callback( false, false ); // don't emit an error, just mark dead and continue
			nM.death( node );
		});
		
		// connection no-longer in use, remove from our pool
		connection.addListener( 'close', function(){
			pool.remove( this );
		});
		
		return connection;
	});
	
	this.pool[ node ].fetch( callback );
};

// validates the integrity of the key
nMemcached.prototype.__validate_key = function( user_key, callback ){
	if( !user_key || user_key == undefined || user_key == null ){
		callback( 'Key cannot be null', false );
		return false;
	}
	
	if( typeof user_key !== 'string' ){
		callback( 'Key must be a string', false );
		return false;
	}
	
	if( user_key.length > this.max_key && !this.compress_keys ){
		callback( 'Key length is > ' + this.max_key, false );
		return false;
	} else {
		user_key = crypto.createHash( 'md5' ).update( data ).digest( 'hex' );
	}
	
	return true;
};

// public API methods for nMemcached:

// returns a connection that is ready to be used
nMemcached.prototype.get_connection = function( user_key, callback ){
	var node = this.hashring.get_node( user_key );
	
	if( !node )
		return callback( 'Failed to get the correct node from our hash ring' )
	
	this.__connect( node, callback );
};

nMemcached.prototype.death = function( node ){
	
};

// public Memcached API's

nMemcached.prototype.get = function( user_key, callback ){
	var nM = this;
	
	if( !nM.__validate_key( user_key ) )
		return;
		
	nM.get_connection( user_key, function( err, connection ){
		if( err )
			return callback( 'Unable to start or retrieve a TCP connection', connection );
		
		nM.__query( connection, 'get ' + user_key, callback );
	});
};

nMemcached.prototype.get_multi = function( user_keys, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.gets = function( user_key, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.set = function( user_key, value, lifetime, callback ){
	var nM = this;
	
	if( !nM.__validate_key( user_key ) )
		return;
		
	nM.get_connection( user_key, function( err, connection ){
		if( err )
			return callback( 'Unable to start or retrieve a TCP connection', connection );
		
		// automatically convert the code
		if( typeof value !== 'string' )
			value = JSON.stringify( value );
		
		// the length it large, so we are going to fail silently 
		if( value.length > this.max_value )
			return callback( false, false );
		
		
		// Prepare set-query
		var expire = lifetime || 0,
			length = value.length || 0,
			flags = 0;		
		
		nM.__query( connection, [ 'set', user_key, flags, expire, length ].join(' ') + _nMemcached_end + value, callback );
	});
};

nMemcached.prototype.set_multi = function( user_key, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.add = function( user_key, value, lifetime, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.replace = function( user_key, value, lifetime, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.append = function( user_key, value, lifetime, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.prepend = function( user_key, value, lifetime, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.cas = function( user_key, value, lifetime, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.del = function( user_key, callback ){
	var nM = this;
	
	if( !nM.__validate_key( user_key ) )
		return;
		
	nM.get_connection( user_key, function( err, connection ){
		if( err )
			return callback( 'Unable to start or retrieve a TCP connection', connection );
		
		nM.__query( connection, 'delete ' + user_key, callback );
	});
};

nMemcached.prototype.del_multi = function( user_keys, callback ){
	return callback( 'Command not implemented' );
};

// Note, these should query all available nodes, if they all retrieve the same version return a string
// if not, a JSON object with as key: the node, and as value the version, it does not do this atm
nMemcached.prototype.version = function( callback ){
	var nM = this;
	
	if( !nM.__validate_key( user_key ) )
		return;
		
	nM.servers.forEach(function( server ){
		nM.__connect( server, function(){
			nM.__query( connection, 'version', callback );
		})
	});
};

nMemcached.prototype.stats = function( callback ){
	var nM = this;
	
	if( !nM.__validate_key( user_key ) )
		return;
	
	nM.servers.forEach(function( server ){
		nM.__connect( server, function(){
			nM.__query( connection, 'stats', callback );
		})
	});
};

nMemcached.prototype.flush = function( callback ){
	return callback( 'Command not implemented' );
};