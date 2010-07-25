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
	
	if( !servers.length )
		throw new Error( 'No servers where supplied in the arguments' );

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
	timeout: 5000,				 // after x ms the server should send a timeout if we can't connect
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
		response_buffer = [],
		private = {},
		undefined;
	
	// creates or generates a new connection for the give server, the callback will recieve the connection
	// if the operation was sucessfull
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
			S.setTimeout( memcached.timeout );
			S.setNoDelay(true);
			S.metaData = [];
			S.server = server;
			S.tokens = server_tokens;
			
			Utils.fuse( S, {
				connect	: function(){ callback( false, this ) },
				close	: function(){ Manager.remove( this ) },
				error	: function( err ){ memcached.connectionIssue( err, S, callback ) },
				data	: Utils.curry( memcached, private.buffer, S ),
				timeout : function(){ Manager.remove( this ) },
				end		: S.end
			});
			
			// connect the net.Stream [ port, hostname ]
			S.connect.apply( S, server_tokens );
			return S;
		});
		
		this.connections[ server ].allocate( callback );
	};
	
	// creates a multi stream
	memcached.multi = function( keys, callback ){
		var map = {}, memcached = this, servers, i;
		
		// gets all servers based on the supplied keys,
		// or just gives all servers if we don't have keys
		if( keys ){
			keys.forEach(function( key ){
				var server = memcached.HashRing.get_node( key );
				if( map[ server ] )
					map[ server ].push( key );
				else
					map[ server ] = [ key ];
			});
			servers = Object.keys( map );
		} else {
			servers = this.servers;
		}
		
		i = servers.length;
		while( i-- )
			callback.call( this, servers[i], map[ servers[i] ], i, servers.length );
	};
	
	// executes the command on the net.Stream, if no server is supplied it will use the query.key to get 
	// the server from the HashRing
	memcached.command = function( query, server ){
		if( query.validation && !Utils.validate_arg( query, this ))  return;
				
		server = server || this.HashRing.get_node( query.key );
		
		if( server in this.issues && this.issues[ server ].failed )
			return query.callback( false, false );
		
		this.connect( server, function( error, S ){
			
			if( !S ) return query.callback( false, false );
			if( error ) return query.callback( error );
			if( S.readyState !== 'open' ) return query.callback( 'Connection readyState is set to ' + S.readySate );
			
			S.metaData.push( query );
			S.write( query.command + LINEBREAK );
		});
	};
	
	// logs all connection issues, and handles them off. Marking all requests as cache misses.
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
	
	// kills all active connections
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
		ERROR: 			function( tokens, dataSet, err ){ err.push( 'Received an ERROR response'); return [ FLUSH, false ] },
		CLIENT_ERROR: 	function( tokens, dataSet, err ){ err.push( tokens.splice(1).join(' ') ); return [ BUFFER, false ] },
		SERVER_ERROR: 	function( tokens, dataSet, err, queue, S, memcached ){ memcached.connectionIssue( tokens.splice(1).join(' '), S ); return [ CONTINUE, false ] },
		
		// keyword based responses
		STORED: 		function( tokens, dataSet ){ return [ CONTINUE, true ] },
		DELETED: 		function( tokens, dataSet ){ return [ CONTINUE, true ] },
		OK: 			function( tokens, dataSet ){ return [ CONTINUE, true ] },
		EXISTS: 		function( tokens, dataSet ){ return [ CONTINUE, true ] },
		END: 			function( tokens, dataSet, err, queue ){ if( !queue.length) queue.push( false ); return [ FLUSH, true ] },
		
		// value parsing:
		VALUE: 			function( tokens, dataSet, err, queue ){
							var key = tokens[1], flag = +tokens[2], expire = tokens[3],
								tmp;
							
							// check for compression
							if( flag >= FLAG_COMPRESSION ){
								switch( flag ){
									case FLAG_BCOMPRESSION: flag = FLAG_BINARY; break;
									case FLAG_JCOMPRESSION:	flag = FLAG_JSON; break;
								}
								
								dataSet = Compression.Inflate( dataSet );
							}
							
							switch( flag ){
								case FLAG_JSON:
									dataSet = JSON.parse( dataSet );
									break;
								
								case FLAG_BINARY:
									tmp = new Buffer( dataSet.length );
									tmp.write( dataSet, 0, 'ascii' );
									dataSet = tmp;
									break;
							}
							
							// Add to queue as multiple get key key key key key returns multiple values
							queue.push( dataSet );
							return [ BUFFER ] 
						},
		INCRDECR:		function( tokens ){ return [ CONTINUE, +tokens[1] ] },
		STAT: 			function( tokens, dataSet, err, queue ){
							queue.push([tokens[1], /^\d+$/.test( tokens[2] ) ? +tokens[2] : tokens[2] ]); return [ BUFFER, true ] 
						},
		VERSION:		function( tokens, dataSet ){
							var version_tokens = /(\d+)(?:\.)(\d+)(?:\.)(\d+)$/.exec( tokens.pop() );
							return [ CONTINUE, 
									{
										server: this.server, 
										version:version_tokens[0],
										major: 	version_tokens[1] || 0,
										minor: 	version_tokens[2] || 0,
										bugfix: version_tokens[3] || 0
									}]
						}
	};
	
	// parses down result sets
	private.resultParsers = {
		// combines the stats array, in to an object
		stats: function( resultSet ){
			var response = {};
			
			// add references to the retrieved server
			response.server = this.server;
			
			// Fill the object 
			resultSet.forEach(function( statSet ){
				response[ statSet[0] ] =  statSet[1];
			});
			
			return response;
		},
		
		'stats settings': function(){
			return private.resultParsers.stats.apply( this, arguments );
		},
		
		'stats slabs': function(){
		
		}
	};
	
	private.commandReceived = new RegExp( '^(?:' + Object.keys( private.parsers ).join( '|' ) + ')' );
	
	private.buffer = function( S, BufferStream ){
		var chunks = BufferStream.toString().split( LINEBREAK );
		this.rawDataReceived( S, response_buffer = response_buffer.concat( chunks ) );
	};
	
	memcached.rawDataReceived = function( S, buffer_chunks ){
		var queue = [],	token, tokenSet, command, dataSet = '', resultSet, metaData, err = [];
											
		while( buffer_chunks.length && private.commandReceived.test( buffer_chunks[0] ) ){
			token = buffer_chunks.shift();
			tokenSet = token.split( ' ' );
			
			// special case for digit only's these are responses from INCR and DECR
			if( /\d+/.test( tokenSet[0] ))
				tokenSet.unshift( 'INCRDECR' );
			
			// special case for value, it's required that it has a second response!
			// add the token back, and wait for the next response, we might be handling a big 
			// ass response here. 
			if( tokenSet[0] == 'VALUE' && buffer_chunks.indexOf( 'END') == -1 )
				return buffer_chunks.unshift( token );
			
			// check for dedicated parser
			if( private.parsers[ tokenSet[0] ] ){
				
				// fetch the response content
				while( buffer_chunks.length ){
					if( private.commandReceived.test( buffer_chunks[0] ) )
						break;
						
					dataSet += ( dataSet.length > 0 ? LINEBREAK : '' ) + buffer_chunks.shift();
				};
				
				resultSet = private.parsers[ tokenSet[0] ].call( S, tokenSet, dataSet || token, err, queue, this );
				
				// check how we need to handle the resultSet response
				switch( resultSet.shift() ){
					case BUFFER:
						break;
						
					case FLUSH:
						metaData = S.metaData.shift();
						resultSet = queue;
						
						// see if optional parsing needs to be applied to make the result set more readable
						if( private.resultParsers[ metaData.type ] )
							queue = private.resultParsers[ metaData.type ].call( S, resultSet, err );
							
						if( metaData.callback )	
							metaData.callback.call( metaData, err.length ? err : err[0], !Array.isArray( queue ) || queue.length > 1 ? queue : queue[0] );
							
						queue = [];
						err = [];
						break;
						
					case CONTINUE:	
					default:
						metaData = S.metaData.shift();
						
						if( metaData.callback )
							metaData.callback.call( metaData, err.length > 1 ? err : err[0], resultSet[0] );
							
						err = [];
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
			
			// check if we need to remove an empty item from the array, as splitting on /r/n might cause an empty
			// item at the end.. 
			if( response_buffer[0] == '' )
				response_buffer.shift();
		};
	};
	
	// small wrapper function that only executes errors when we have a callback
	private.errorResponse = function error( error, callback ){
		if( typeof callback == 'function' )
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
	
	// handles get's with multiple keys
	memcached.get_multi = function( keys, callback ){
		var memcached = this, responses = [], errors = [], calls,
			handle = function( err, results ){
				if( err ) errors.push( err );
				if( results ) responses = responses.concat( results );
				if( !--calls ) callback( errors, responses );
			};
		
		this.multi( keys, function( server, keys, index, totals ){
			if( !calls ) calls = totals;
			
			memcached.command({
					callback: handle,
					type: 'get',
					command: 'get ' + keys.join( ' ' )
				},
				server
			);
		});
	};
	
	// as all command nearly use the same syntax we are going to proxy them all to this 
	// function to ease maintainance. 
	private.setters = function( type, validate, key, value, lifetime, callback, cas ){
		var flag = 0;
		
		if( Buffer.isBuffer( value ) ){
			flag = FLAG_BINARY;
			value = value.toString( 'ascii' );
		} else if( typeof value !== 'string' ){
			flag = FLAG_JSON;
			value = JSON.stringify( value );
		} else {
			value = value.toString();	
		}
		
		if( value.length > this.compression_threshold ){
			flag = flag == FLAG_JSON ? FLAG_JCOMPRESSION : flag == FLAG_BINARY ? FLAG_BCOMPRESSION : FLAG_COMPRESSION;
			value = Compression.Deflate( value );
		}
		
		if( value.length > this.max_value )
			return private.errorResponse( 'The length of the value is greater-than ' + this.compression_threshold, callback );
				
		this.command({
			key: key, callback: callback, lifetime: lifetime, value: value, cas: cas,
			
			// validate the arguments
			validate: validate,
			
			type: type,
			command: [ type, key, flag, lifetime, Buffer.byteLength( value ) ].join( ' ' ) + ( cas ? cas : '' ) + LINEBREAK + value
		})
	
	};
	
	// these commands speak for them selfs
	memcached.set = Utils.curry( false, private.setters, 'set', [[ 'key', String ], [ 'lifetime', Number ], [ 'value', String ], [ 'callback', Function ]] );
	memcached.replace = Utils.curry( false, private.setters, 'replace', [[ 'key', String ], [ 'lifetime', Number ], [ 'value', String ], [ 'callback', Function ]] );
	
	memcached.add = function( key, value, callback ){
		private.setters.call( this, 'add', [[ 'key', String ], [ 'value', String ], [ 'callback', Function ]], key, value, 0, callback );
	};
	
	memcached.cas = function( key, value, cas, lifetime, callback ){
		private.setters.call( this, 'add', [[ 'key', String ], [ 'lifetime', Number ], [ 'value', String ], [ 'callback', Function ]], key, value, lifetime, callback, cas );
	};
	
	memcached.append = function( key, value, callback ){
		private.setters.call( this, 'append', [[ 'key', String ], [ 'lifetime', Number ], [ 'value', String ], [ 'callback', Function ]], key, value, 0, callback );
	};
	
	memcached.prepend = function( key, value, callback ){
		private.setters.call( this, 'prepend', [[ 'key', String ], [ 'lifetime', Number ], [ 'value', String ], [ 'callback', Function ]], key, value, 0, callback );
	};
	
	// small handler for incr and decr's
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
	
	memcached.increment = Utils.curry( false, private.incrdecr, 'incr' );
	memcached.decrement = Utils.curry( false, private.incrdecr, 'decr' );
	
	// deletes the keys from the servers
	memcached.del = function( key, callback ){
		this.command({
			key: key, callback: callback,
			
			// validate the arguments
			validate: [[ 'key', String ], [ 'callback', Function ]],
			
			// used for the query
			type: 'delete',
			command: 'delete ' + key
		});
	};
	
	
	// small wrapper that handle single keyword commands such as FLUSH ALL, VERSION and STAT
	private.singles = function( type, callback ){
		var memcached = this, responses = [], errors = [], calls,
			handle = function( err, results ){
				if( err ) errors.push( err );
				if( results ) responses = responses.concat( results );
				if( !--calls ) callback( errors, responses.length > 1 ? responses : responses[0] );
			};
		
		this.multi( false, function( server, keys, index, totals ){
			if( !calls ) calls = totals;
			
			memcached.command({
					callback: handle,
					type: type,
					command: type
				},
				server
			);
		});
	};
	
	memcached.version = Utils.curry( false, private.singles, 'version' );
	memcached.flush = Utils.curry( false, private.singles, 'flush_all' );
	memcached.stats = Utils.curry( false, private.singles, 'stats' );
	memcached.settings = Utils.curry( false, private.singles, 'stats settings' );
	memcached.slabs = Utils.curry( false, private.singles, 'stats slabs' );
	
})( Client )