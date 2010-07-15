var sys = require('sys'),
	net = require('net'),
	crypto = require( 'crypto' ),
	
	buffer = require('buffer').Buffer,
	hashring = require('./lib/hashring').hashRing,
	connectionPool = require('./lib/connectionPool').manager;

// line ending that is used for sending and compiling Memcached commands
const $line_ending = '\r\n';

// set flags that identifys the datastructure we retrieve
const $flags = {
		JSON: 1,
		COMPRESSION: 2,
		BOTH: 3
	};
	
// error responses from the Memcached server
const $errors = ['ERROR', 'NOT_FOUND', 'CLIENT_ERROR', 'SERVER_ERROR'];

// responses from the Memcached server, grouped by command
const $response = {
		get: ['VALUE', 'END'],
		set: ['STORED', 'NOT_STORED', 'EXISTS'],
		stats: ['STAT', 'END'],
		del: ['DELETED'],
		version: ['VERSION'],
		flush: ['OK']
	};

// empty callback function
const $empty = function(){};

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
	this.compress_threshold = 10240;// at how many bytes should we compress (using zip)
	
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

// Dedicated parsers for each request type so we know get the most well performing and correctly parsed down format
// ofcourse these parsers are only needed when the response isn't one word such as storing
nMemcached.parsers = {
	get: function( peices ){
		var header = peices.shift(),
			footer = peices.pop(),
			response = peices.join( $line_ending );
		
		return response;
	}
};

// parses the data
nMemcached.prototype.__received_data = function( data, connection ){
	var chunks = data.toString().split( $line_ending ),
		query_config = connection.metadata.shift(),
		length = chunks.pop(),
		response;
		
	// check for errors, do this early so we don't have to fully parse the contents if it's not needed
	if( $errors.some( function( value ){ return chunks[0] === value || chunks[ length -1] === value } ) )
		query_config.callback( "Memcached command produced an error", query_config.query );
	
	sys.puts("mew")
	
	// do we have a dedicated parser available? if so, parse it
	if( nMemcached.parsers[ query_config.type ] )
		response = nMemcached.parsers[ query_config.type ]( chunks );
		
	// we always have a callback
	query_config.callback( false, response ? response : true );
};

// sends the actual query to memcached server
nMemcached.prototype.__query = function( connection, query, query_config, callback ){
	// we have no connection, we are going to fail silently the server might be borked
	if( !connection )
		return callback( false, false );
	
	if( connection.readyState !== 'open' )
		return callback( 'Error sending Memcached command, connection readyState is set to ' + connection.readyState, connection );
	
	// add information to our query_config object and push it to the metadata
	query_config.callback = callback;
	query_config.query = query;
	connection.metadata.push( query_config );
	
	// write the query to the net.Stream
	connection.write( query + $line_ending );
};

// fetches or generates a new connection & connection pool for a server node
nMemcached.prototype.__connect = function( node, callback ){
	// check if we already created a connection pool for that server
	if( node in this.pool )
		return this.pool[ node ].fetch( callback );
		
	var servertkn = /(.*):(\d+){1,}$/.exec( node ),
		nM = this;
		
	// no connections found, so create a new poolManager and add the connection constructor.
	nM.pool[ node ] = new connectionPool( node, nM.max_connection_pool, function( callback ){
		var connection = net.createConnection( servertkn[2], servertkn[1] ),
			pool = this;
		
		// stores connection specific metadata
		connection.metadata = [];		
		// the connection is ready for usage
		connection.addListener( 'connect', function(){
			this.setTimeout( 0 );
			this.setNoDelay();
			callback( false, this );
		});
		
		// the connect recieved data from the Memcached server
		connection.addListener( 'data', function( data ){
			nM.__received_data( data, this );
		});
		
		// something happend to the Memcached serveer sends a 'FIN' packet, so we will just close the connection
		connection.addListener( 'end', function(){
			return this.destroy ? this.destroy() : false;
		});
		
		// something happend while connecting to the server
		connection.addListener( 'error', function( error ){
			callback( false, false ); // don't emit an error, just mark dead and continue
			nM.death( node, error );
			sys.error( error );
			return this.destroy ? this.destroy() : false;
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
		user_key = crypto.createHash( 'md5' ).update( user_key ).digest( 'hex' );
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

nMemcached.prototype.death = function( node ){};

// shuts down all current connections
nMemcached.prototype.disconnect = function(){
	for( var key in this.pool )
		this.pool[ key ].destroy();
	
};

// public Memcached API's

nMemcached.prototype.get = function( user_key, callback ){
	var nM = this;
	
	if( !nM.__validate_key( user_key ) )
		return;
		
	nM.get_connection( user_key, function( err, connection ){
		if( err )
			return callback( 'Unable to start or retrieve a TCP connection', connection );
		
		nM.__query( connection, 'get ' + user_key, { key: user_key, type: 'get' }, callback );
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
	
	// validate the user_key, stop if it fails
	if( !nM.__validate_key( user_key ) )
		return;
	
	nM.get_connection( user_key, function( err, connection ){
		if( err )
			return callback( 'Unable to start or retrieve a TCP connection', connection );
		
		var flags = 0;
		
		// automatically convert the code
		if( typeof value !== 'string' ){
			value = JSON.stringify( value );
			flags = $flags.JSON;
		}
		
		if( value.length > this.compress_threshold ){
			// @todo, implement compression
		}
		
		// the length it large, so we are going to fail silently 
		if( value.length > this.max_value )
			return callback( false, false );		
		
		nM.__query( connection, [ 'set', user_key, flags, lifetime || 0 , value.length  ].join(' ') + $line_ending + value, { key: user_key, type: 'set' }, callback );
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