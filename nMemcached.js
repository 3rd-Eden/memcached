var EventEmitter = require('events').EventEmitter,
	Stream		 = require('net').Stream,
	Buffer		 = require('buffer').Buffer;

var HashRing 	 = require('./lib/hashring').HashRing,
	Connection	 = require('./lib/connection'),
	Utils		 = require('./lib/utils'),
	Compression	 = require('./lib/zip'),
	Manager		 = Connection.Manager,
	IssueLog	 = Connection.IssueLog,
	Available	 = Connection.Available;

exports.Client = Client;

function Client( args, options ){
	var servers = [],
		weights = {},
		key;

	// parse down the connection arguments	
	switch( Object.prototype.toString.call( args ) ){
		case '[object String]':
			servers.push( args );
			break;
		case '[object Object]':
			weights = args;
			servers = Object.keys( args );
		case '[object Array]': 
		default:
			servers = args;
			break;
	}

	// merge with global and user config
	Utils.merge( this, Client.config );
	Utils.merge( this, options );
	EventEmitter.call( this );

	this.servers = servers;
	this.HashRing = new HashRing( servers, weights, this.algorithm );
	this.connections = {};
	this.issues = [];
};

// Allows users to configure the memcached globally or per memcached client
Client.config = {
	max_key_size: 251,			 // max keysize allowed by Memcached
	max_expiration: 2592000,	 // max expiration duration allowed by Memcached
	max_value: 1048576,			 // max length of value allowed by Memcached
	
	algorithm: 'md5',			 // hashing algorithm that is used for key mapping  

	pool_size: 10,				 // maximal parallel connections
	reconnect: 18000000,		 // if dead, attempt reconnect each xx ms
	retries: 5,					 // amount of retries before server is dead
	retry: 30000,				 // timeout between retries, all call will be marked as cache miss
	remove: false,				 // remove server if dead if false, we will attempt to reconnect

	compression_threshold: 10240,// only than will compression be usefull
	key_compression: true		 // compress keys if they are to large (md5)
};

// There some functions we don't want users to touch so we scope them
(function( nMemcached ){
	const LINEBREAK				= '\r\n',
		  FLUSH					= 1E3,
		  BUFFER				= 1E2,
		  CONTINUE				= 1E1,
		  FLAG_JSON 			= 1<<1,
		  FLAG_BINARY			= 2<<1,
		  FLAG_COMPRESSION 		= 3<<1,
		  FLAG_JCOMPRESSION 	= 4<<1,
		  FLAG_BCOMPRESSION		= 5<<1;

	var memcached = nMemcached.prototype = new EventEmitter,
		private = {};
		undefined;

	memcached.connect = function( server, callback ){
		if( server in this.issues && this.issues[ server ].failed )
			return callback( false, false );
		
		if( server in this.connections )
			return this.connections[ server ].allocate( callback );
		
		var server_tokens = /(.*):(\d+){1,}$/.exec( server ).reverse(),
			memcached = this;
			server_tokens.pop();
		
		this.connections[ server ] = new Manager( server, this.pool_size, function( callback ){
			var S = new Stream,
				Manager = this;
			
			// config the Stream
			S.setTimeout(50);
			S.setNoDelay(true);
			S.metaData = [];
			S.server = server;
			S.tokens = server_tokens;
			
			Utils.fuse( S, {
				connect	: function(){ callback( false, this ) },
				close	: function(){ Manager.remove( this ) },
				error	: function( err ){ memcached.connectionIssue( err, S, callback ) },
				data	: Utils.curry( memcached, memcached.rawDataReceived, S ),
				end		: S.end
			});
			
			// connect the net.Stream [ port, hostname ]
			S.connect.apply( S, server_tokens );
			return S;
		});
		
		this.connections[ server ].allocate( callback );
	};
	
	memcached.command = function( query ){
		if( !Utils.validate_arg( query, this ))  return;
				
		var server = this.HashRing.get_node( query.key );
		
		if( server in this.issues && this.issues[ server ].failed )
			return callback( false, false );
		
		this.connect( server, function( error, S ){
			
			if( !S ) return query.callback( false, false );
			if( error ) return query.callback( error );
			if( S.readyState !== 'open' ) return query.callback( 'Connection readyState is set to ' + S.readySate );
			
			S.metaData.push( query );
			S.write( query.command + LINEBREAK );
		});
	};
	
	memcached.connectionIssue = function( error, S, callback ){
		// end connection and mark callback as cache miss
		if( S && S.end )
			S.end();
				
		if( callback )
			callback( false, false );
		
		var issues,
			server = S.server,
			memcached = this;
		
		// check for existing issue logs, or create a new	
		if( server in this.issues ){
			issues = this.issues[ server ];
		} else {
			issues = this.issues[ server ] = new IssueLog({
				server: 	server,
				tokens: 	S.tokens,
				reconnect: 	this.reconnect,
				retries: 	this.retries,
				retry: 		this.retry,
				remove: 	this.remove
			});
			
			// proxy the events
			Utils.fuse( issues, {
				issue:			function( details ){ memcached.emit( 'issue', details ) },
				failure: 		function( details ){ memcached.emit( 'failure', details ) },
				reconnecting: 	function( details ){ memcached.emit( 'reconnecting', details ) },
				reconnected: 	function( details ){ memcached.emit( 'reconnect', details ) },
				remove: 		function( details ){
									// emit event and remove servers
									memcached.emit( 'remove', details );
									memcached.connections[ server ].end();
									
									if( this.failOverServers && this.failOverServers.length )
										memcached.HashRing.replaceServer( server, this.failOverServers.shift() );
									else
										memcached.HashRing.removeServer( server );
								}
			});
		}
		
		// log the issue
		issues.log( error );
	};
	
	memcached.end = function(){
		var memcached = this;
		Object.keys( this.connections ).forEach(function( key ){ memcached.connections[ key ].free(0) });
	};
	
	// these do not need to be publicly available as it's one of the most important
	// parts of the whole client.
	private.parsers = {
		// handle error respones
		NOT_FOUND: 		function( tokens, dataSet, err ){ return [ CONTINUE, false ] },
		NOT_STORED: 	function( tokens, dataSet, err ){ return [ CONTINUE, false ] },
		ERROR: 			function( tokens, dataSet, err ){ err = 'Recieved a nonexistent command name'; return [ CONTINUE, false ] },
		CLIENT_ERROR: 	function( tokens, dataSet, err ){ err = tokens.splice(1).join(' ');	return [ CONTINUE, false ] },
		SERVER_ERROR: 	function( tokens, dataSet, err, queue, S, memcached ){ memcached.connectionIssue( tokens.splice(1).join(' '), S ); return [ CONTINUE, false ] },
		
		// keyword based responses
		STORED: 		function( tokens, dataSet ){ return [ CONTINUE, true ] },
		DELETED: 		function( tokens, dataSet ){ return [ CONTINUE, true ] },
		OK: 			function( tokens, dataSet ){ return [ CONTINUE, true ] },
		EXISTS: 		function( tokens, dataSet ){ return [ CONTINUE, true ] },
		END: 			function( tokens, dataSet ){ return [ FLUSH, true ] },
		
		// value parsing:
		VALUE: 			function( tokens, dataSet, err, queue ){
							var key = tokens[1], flag = +tokens[2], expire = tokens[3],
								tmp;
							
							// check for compression
							if( flag >= FLAG_COMPRESSION ){
								switch( flag ){
									case FLAG_BCOMPRESSION: flag = FLAG_JSON; break;
									case FLAG_JCOMPRESSION:	flag = FLAG_BINARY; break;
								}
								
								dataSet = Compression.Inflate( dataSet );
							}
							
							switch( +flag ){
								case FLAG_JSON:
									dataSet = JSON.parse( dataSet );
									break;
								
								case FLAG_BINARY:
									tmp = new Buffer( dataSet.length );
									tmp.write( dataSet, 0, 'ASCII' );
									dataSet = tmp;
									break;
							}
							
							// Add to queue as multiple get key key key key key returns multiple values
							queue.push( dataSet );
							return [ BUFFER ] 
						},
		STAT: 			function( tokens, dataSet ){ return [ BUFFER, true ] },
		VERSION:		function( tokens, dataSet ){
							var version_tokens = /(\d+)(?:\.)(\d+)(?:\.)(\d+)$/.exec( tokens.pop() );
							return [ CONTINUE, 
									{ 
										version:version_tokens[0],
										major: 	version_tokens[1] || 0,
										minor: 	version_tokens[2] || 0,
										bugfix: version_tokens[3] || 0
									}];
						}
	};
	
	// parses down result sets
	private.resultParsers = {
		// result set parsing
		stats: function( resultSet ){ return resultSet }
	};
	
	private.commandReceived = new RegExp( '^(?:' + Object.keys( private.parsers ).join( '|' ) + ')' );
		
	memcached.rawDataReceived = function( S, BufferStream ){
		var queue = [], buffer_chunks = BufferStream.toString().split( LINEBREAK ),
			token, tokenSet, command, dataSet = '', resultSet, metaData, err;
					
		buffer_chunks.pop();
				
		while( buffer_chunks.length ){
			token = buffer_chunks.shift();
			tokenSet = token.split( ' ' );
			
			// check for dedicated parser
			if( private.parsers[ tokenSet[0] ] ){
				
				// fetch the response content
				while( buffer_chunks.length ){
					if( private.commandReceived.test( buffer_chunks[0] ) )
						break;
					
					dataSet += ( dataSet.length > 0 ? LINEBREAK : '' ) + buffer_chunks.shift();
				};
								
				resultSet = private.parsers[ tokenSet[0] ]( tokenSet, dataSet || token, err, queue, S, this );
				
				switch( resultSet.shift() ){
					case BUFFER:
						break;
						
					case FLUSH:
						metaData = S.metaData.shift();
						resultSet = queue;
						
						// see if optional parsing needs to be applied to make the result set more readable
						if( private.resultParsers[ metaData.type ] )
							resultSet = private.resultParsers[ metaData.type ]( resultSet, err, S );
							
						metaData.callback.call( metaData, err, queue );
						queue.length = 0;
						err = false;
						break;
						
					case CONTINUE:	
					default:
						metaData = S.metaData.shift();
						metaData.callback.call( metaData, err, resultSet[0] );
						err = false;
						break;
				}
			} else {
				// handle unkown responses
				metaData = S.metaData.shift();
				metaData.callback.call( metaData, 'Unknown response from the memcached server: ' + token, false );
			}
			
			// cleanup
			dataSet = ''
			tokenSet = undefined;
			metaData = undefined;
			command = undefined;
		};
	};
	
	private.errorResponse = function error( error, callback ){
		if( typeof callback == "function" )
			callback( error, false );
		
		return false;
	};
	
	// get, gets all the same
	memcached.gets = memcached.get = function( key, callback ){
		if( Array.isArray( key ) )
			return this.get_multi.apply( this, arguments );
			
		this.command({
			key: key, callback: callback,
			
			// validate the arguments
			validate: [[ 'key', String ], [ 'callback', Function ]],
			
			// used for the query
			type: 'get',
			command: 'get ' + key
		});
	};
	
	memcached.set = function( key, value, lifetime, callback ){
		if( Array.isArray( key ) )
			return this.set_multi.apply( this, arguments );
		
		var flag = 0;
		
		if( Buffer.isBuffer( value ) ){
			flag = FLAG_BINARY;
			value = value.toString( 'ASCII' );
		
		} else if( typeof value !== 'string' ){
			flag = FLAG_JSON;
			value = JSON.stringify( value );
		}
		
		if( value.length > this.compression_threshold ){
			flag = flag == FLAG_JSON ? FLAG_JCOMPRESSION : flag == FLAG_BINARY ? FLAG_BCOMPRESSION : FLAG_COMPRESSION;
			value = Compression.Deflate( value );
			
			if( value.length > this.compression_threshold )
				return private.errorResponse( 'The length of the value is greater-than ' + this.compression_threshold, callback );
			
		}
		
		this.command({
			key: key, callback: callback, lifetime: lifetime,
			
			// validate the arguments
			validate: [[ 'key', String ], [ 'lifetime', Number ], [ 'callback', Function ]],
			
			type: 'set',
			command: [ 'set', key, flag, lifetime, value.length ].join( ' ' ) + LINEBREAK + value
		})
	};
	
	private.incrdecr = function incrdecr( type, key, value, callback ){
		this.command({
			key: key, callback: callback, value: value,
			
			// validate the arguments
			validate: [[ 'key', String ], [ 'value', Number ], [ 'callback', Function ]],
			
			// used for the query
			type: type,
			command: [ type, key, value ].join( ' ' )
		});
	};
	
	memcached.increment = Utils.curry( false, private.incrdecr, "incr" );
	memcached.decrement = Utils.curry( false, private.incrdecr, "decr" );
	
	memcached.version = function( callback ){
		this.command({
			key: 'hello', callback: callback,
			
			// validate the arguments
			validate: [[ 'callback', Function ]],
			
			type: 'version',
			command: 'version'
		})
	};
})( Client )