var sys = require('sys'),
	net = require('net'),
	crypto = require( 'crypto' ),
	
	buffer = require('buffer').Buffer,
	hashring = require('./lib/hashring').hashRing,
	connectionPool = require('./lib/connectionPool').manager;

const $line_ending = '\r\n';
const $flags = {
		JSON: 1<<1,
		COMPRESSION: 2<<1,
		COMPRESSEDJSON: 3<<1,
		BINARY: 4<<1,
		COMPRESSEDBINARY: 5<<1
	};
const $errors = ['ERROR', 'NOT_FOUND', 'CLIENT_ERROR', 'SERVER_ERROR'];
const $response = {
		set: ['STORED', 'NOT_STORED', 'EXISTS'],
		stats: ['STAT', 'END'],
		del: ['DELETED'],
		version: ['VERSION'],
		flush: ['OK']
	};
const $empty = function(){};
const $response_split = new RegExp();

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
	this.fuse( options );
	
	this.servers = servers;
	this.hashring = new hashring( servers, weights );
	this.pool = {};
	this.dead = {};
};

// allows us to emit events when needed, for example when a server is dead,
// you might want to get notified when this happens.
sys.inherits( nMemcached, process.EventEmitter );

// fuses an object with our internal properties, allowing users to further configure the client to their needs
nMemcached.prototype.fuse = function( options, ignoreUndefinedProps ){
	if( !options )
		return;
		
	var key, undefined;
	
	for( key in options ){
		if( ignoreUndefinedProps && this[ key ] == undefined )
			continue;
			
		this[ key ] = options[ key ];
	}
};

// dedicated parsers for each request type so we know get the most well performing and correctly parsed down format
// ofcourse these parsers are only needed when the response isn't one word such as storing
nMemcached.parsers = {
	
	// handles get requests, parses back the data to the correct format based on $flags provided
	get: function( peices, query_config ){
		var header = peices.shift(),
			footer = peices.pop(),
			response = peices.join( $line_ending );
		
		return response;
	},
	
	// parses out the version information
	version: function( peices ){
		return /(\d+)(?:\.)(\d+)(?:\.)(\d+)$/.exec( peices.shift() );
	},
	
	// parse the stats to an object
	stats: function( peices ){
		var footer = peices.pop(),
			response = {};
		
		peices.forEach(function( stat ){
			var chunk = stat.replace( "STAT ", '' ).split( ' ' );
			response[ chunk[0] ] = Number( chunk[1] );
		});
		
		return response;
	}
};

// handles the responses we recieve from the net.Stream
nMemcached.prototype.response = function( data, connection ){
	var response = data.toString().split( $line_ending ),
		meta = connection.metadata.shift(),
		size = response.pop();
			
	data = false;
	
	// check for errors, do this early so we don't have to fully parse the contents if it's not needed
	if( $errors.some( function( value ){ return response[0] === value || response[ size -1 ] === value } ) )
		return meta.callback( "Memcached command produced an error", meta.query );
	
	// do we have a dedicated parser available? if so, parse it
	if( nMemcached.parsers[ meta.type ] )
		data = nMemcached.parsers[ meta.type ]( response, meta, connection );
	
	// some Memcached command respond with a single statement, so we can just take advantage of that
	if( !data && size == 1 )
		data = $response[ meta.type ].indexOf( response[0] ) !== -1;
	
	// report back to the user, if the user
	meta.callback( false, data || response );
};

// sends the actual query to memcached server
nMemcached.prototype.query = function( connection, query, query_config, callback ){
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
nMemcached.prototype.connect = function( node, callback ){
	// check if we already created a connection pool for that server
	if( node in this.pool )
		return this.pool[ node ].fetch( callback );
		
	var servertkn = /(.*):(\d+){1,}$/.exec( node ),
		that = this;
		
	// no connections found, so create a new poolManager and add the connection constructor.
	that.pool[ node ] = new connectionPool( node, that.max_connection_pool, function( callback ){
		var connection = new net.Stream(),
			pool = this;
		
		// stores connection specific metadata
		connection.metadata = [];		
		
		// the connection is ready for usage
		connection.addListener( 'connect', function(){
			// configure the connection to be open and stay open and push the data directly to the connection
			this.setTimeout( 0 );
			this.setNoDelay( true );
			callback( false, this );
		});
		
		// the connect recieved data from the Memcached server
		connection.addListener( 'data', function( data ){
			that.response( data, this );
		});
		
		// something happend to the Memcached serveer sends a 'FIN' packet, so we will just close the connection
		connection.addListener( 'end', function(){
			return this.destroy ? this.destroy() : false;
		});
		
		// something happend while connecting to the server
		connection.addListener( 'error', function( error ){
			that.death( node, error, callback );
			return this.destroy ? this.destroy() : false;
		});
		
		// connection no-longer in use, remove from our pool
		connection.addListener( 'close', function(){
			pool.remove( this );
		});
		
		// everything is attached, connecting.. 1.. 2.. 3.. Open sesame
		connection.connect( servertkn[2], servertkn[1] );
		return connection;
	});
	
	this.pool[ node ].fetch( callback );
};

// validates and replaces arguments when needed. some big assumptions are made here:
// * 	if theres only one argument, it will be a callback
// *	if there are more arguments, the first is the key, the last will be callback
// *	min indicates the minimal length of arguments
// *	max indicates the maximal length of arguments
nMemcached.prototype.validate_arguments = function( args, min, max ){
	var length = args.length,
		callback = args[ length - 1 ],
		err;
	
	// set a correct callback function
	if( length == 1 ){
		args[0] = typeof args[0] == 'function' ? args[1] : $empty;
	}
	
	// validate the argument size
	if( length < min || length > max )
		err = "Invalid arguments supplied, this function requires a minimum of " + min + " and maximum of " + max + " arguments";
	
	// we could ofcourse do a args[1].toString(), but I feel it's up to the developer to provide us wit the
	// correct arguments. You don't expect your car to run properly if you fill your tank with sand instead of gas.. 
	if( !err && typeof args[0] !== 'string' )
		err = 'The value of the key must be a string';
	
	// replace the key with a md5 if it's longer than the allowed size, if not throw an error	
	if( !err && args[0].length > this.max_key ){
		if( !this.compress_keys )
			err = 'The length of the key is to long. It should not be greater than ' + this.max_key;
		else
			args[0] = crypto.createHash( 'md5' ).update( args[0] ).digest( 'hex' );
	}
	
	// send the error, and tell that we marked the arguments as failed.
	if( err ){
		callback( err );
		return false;
	}
	
	// no issues here;
	return true;
};

// returns a connection that is ready to be used
nMemcached.prototype.get_connection = function( key, callback ){
	var node = this.hashring.get_node( key );
	
	if( !node )
		return callback( 'Failed to get the correct node from our hash ring' );
	
	this.connect( node, callback );
};

nMemcached.prototype.death = function( node, err, callback ){
	sys.puts('Connection death due: ' + err );
	callback( err, false );
};

// shuts down all current connections
nMemcached.prototype.disconnect = function(){
	for( var key in this.pool )
		this.pool[ key ].destroy();
	
};

/*
	
	The following batch of methods represent the actual interface to the
	Memcached command, if you have no clue what you are doing you should no
	touch, or even think about the methods mentioned above. Unless you like to 
	break things, than go a head :)!

*/
nMemcached.prototype.get = function( key, callback ){
	var that = this;
	if( !that.validate_arguments( arguments, 2, 2 ) )
		return;
		
	// fetch the correct connection
	that.get_connection( key, function( err, conn ){
		if( err ) return callback( err );
		
		that.query( conn, 'get ' + key, { key: key,	type: 'get' }, callback );
	})
};

nMemcached.prototype.get_multi = function( keys, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.gets = function( key, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.set = function( key, value, lifetime, callback ){
	var that = this;
	if( !that.validate_arguments( arguments, 4, 4 ) )
		return;
	
	// fetch the correct connection
	that.get_connection( key, function( err, conn ){
		if( err ) return callback( err );
		
		// construct the command and parse down the value if needed
		var flag = 0;
		
		// convert the value down to a JSON object
		if( typeof value !== 'string' ){
			value = JSON.stringify( value );
			// update the flag
			flag = $flags.JSON;
		}
		
		// check if we need to compress the data
		if( value.length > this.compress_threshold ){
			// update the flag
			flag = flag == $flags.JSON ? $flags.COMPRESSEDJSON : flag == $flags.BINARY ? $flags.COMPRESSEDBINARY : $flags.COMPRESSION;
		}
		
		that.query( conn, [ 'set', key, flag, lifetime || 0 , value.length  ].join(' ') + $line_ending + value, { key: key, type: 'set' }, callback );
	})	
};

nMemcached.prototype.set_multi = function( key, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.add = function( key, value, lifetime, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.replace = function( key, value, lifetime, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.append = function( key, value, lifetime, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.prepend = function( key, value, lifetime, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.cas = function( key, value, lifetime, callback ){
	return callback( 'Command not implemented' );
};

nMemcached.prototype.del = function( key, callback ){
	var nM = this;
	
	if( !nM.__validate_key( key ) )
		return;
		
	nM.get_connection( key, function( err, connection ){
		if( err )
			return callback( 'Unable to start or retrieve a TCP connection', connection );
		
		nM.__query( connection, 'delete ' + key, callback );
	});
};

nMemcached.prototype.del_multi = function( keys, callback ){
	return callback( 'Command not implemented' );
};

// Note, these should query all available nodes, if they all retrieve the same version return a string
// if not, a JSON object with as key: the node, and as value the version, it does not do this atm
nMemcached.prototype.version = function( callback ){
	var nM = this;
	
	if( !nM.__validate_key( key ) )
		return;
		
	nM.servers.forEach(function( server ){
		nM.__connect( server, function(){
			nM.__query( connection, 'version', callback );
		})
	});
};

nMemcached.prototype.stats = function( callback ){
	var nM = this;
	
	if( !nM.__validate_key( key ) )
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