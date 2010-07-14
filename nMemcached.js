var sys = require('sys'),
	net = require('net'),
	crypto = require( 'crypto' ),
	
	buffer = require('buffer').Buffer,
	hashring = require('./lib/hashring').hashRing;

// line ending that is used for sending and compiling Memcached commands
var _nMemcached_end = '\r\n';

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
	
	// current restrictions of memcached
	this.max_key = 250;
	this.max_expiration = 2592000;
	
	this.servers = servers;
	this.hashring = new hashring( servers, weights );
	this.pool = {};
};

nMemcached.prototype.__received_data = function( data, connection ){

};

nMemcached.prototype.__query = function( connection, query, callback ){
	if( connection.readyState !== 'open' )
		return callback( "Error sending Memcached command, connection's readyState is set to " + connection.readyState, connection );
	
	connection._nmcallbacks.push( callback );
	connection.write( query + _nMemcached_end )
};

nMemcached.prototype.__connect = function( node, callback ){
	// check if we already created a connection for that server
	if( node in this.pool )
		return callback( false, this.pool[ node ] );
	
	var servertkn = /(.*):(\d+){1,}$/.exec( node ),
		connection = this.pool[ node ] = net.createConnection( servertkn[2], servertkn[1] ),
		nM = this;
		
	// stores connection specific callbacks
	connection._nmcallbacks = [];
	
	// attach the events
	connection.addListener( 'connect', function(){
		this.setTimeout( 0 );
		this.setNoDelay();
		callback( false, this );
	});
	
	connection.addListener( 'data', function( data ){
		self._received_data( data, this );
	});
	
	connection.addListener( 'end', function(){
		if( this.readyState ){
			this.end();
		}
	});
	
	connection.addListener( 'close', function(){
		delete nM.pool[ node ];
	});
};

// checks if the user_key is allowed for memcached key (size wise). Or we will convert it to a md5 hash
nMemcached.prototype.__validate_key = function( user_key ){
	return user_key.length <= this.max_key ? user_key : crypto.createHash( 'md5' ).update( data ).digest( 'hex' )
};

// public API methods for nMemcached:

// returns a connection that is ready to be used
nMemcached.prototype.get_connection = function( user_key, callback ){
	var node = this.hashring.get_node( user_key );
	
	if( !node )
		return callback( "Failed to get the correct node from our hash ring" )
	
	this.__connect( node, callback );
};

nMemcached.prototype.get = function( user_key, callback ){
	var nM = this;
	this.get_connection( user_key, function( err, connection ){
		if( err )
			return callback( "Unable to start or retrieve a TCP connection", connection );
		
		nM.__query( connection, 'get ' + user_key, callback );
	});
};

nMemcached.prototype.get_multi = function( user_keys, callback ){
	return callback( "Command not implemented" );
};

nMemcached.prototype.gets = function( user_key, callback ){
	return callback( "Command not implemented" );
};

nMemcached.prototype.set = function( user_key, value, lifetime, callback ){
	var nM = this;
	this.get_connection( user_key, function( err, connection ){
		if( err )
			return callback( "Unable to start or retrieve a TCP connection", connection );
		
		// automatically convert the code
		if( typeof value !== 'string' )
			value = JSON.stringify( value );
		
		// Prepare set-query
		var expire = lifetime || 0,
			length = value.length || 0,
			flags = 0;		
		
		nM.__query( connection, [ 'set', user_key, flags, expire, length ].join(' ') + _nMemcached_end + value, callback );
	});
};

nMemcached.prototype.set_multi = function( user_key, callback ){
	return callback( "Command not implemented" );
};

nMemcached.prototype.add = function( user_key, value, lifetime, callback ){
	return callback( "Command not implemented" );
};

nMemcached.prototype.replace = function( user_key, value, lifetime, callback ){
	return callback( "Command not implemented" );
};

nMemcached.prototype.append = function( user_key, value, lifetime, callback ){
	return callback( "Command not implemented" );
};

nMemcached.prototype.prepend = function( user_key, value, lifetime, callback ){
	return callback( "Command not implemented" );
};

nMemcached.prototype.cas = function( user_key, value, lifetime, callback ){
	return callback( "Command not implemented" );
};

nMemcached.prototype['delete'] = function( user_key, callback ){
	var nM = this;
	this.get_connection( user_key, function( err, connection ){
		if( err )
			return callback( "Unable to start or retrieve a TCP connection", connection );
		
		nM.__query( connection, 'delete ' + user_key, callback );
	});
};

// Note, these should query all available nodes, if they all retrieve the same version return a string
// if not, a JSON object with as key: the node, and as value the version, it does not do this atm
nMemcached.prototype.version = function( callback ){
	var nM = this;
	this.servers.forEach(function( server ){
		nM.__connect( server, function(){
			nM.__query( connection, 'version', callback );
		})
	});
};

nMemcached.prototype.stats = function( callback ){
	var nM = this;
	this.servers.forEach(function( server ){
		nM.__connect( server, function(){
			nM.__query( connection, 'stats', callback );
		})
	});
};