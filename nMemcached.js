var EventEmitter = require('events').EventEmitter,
	Stream		 = require('net').Stream,
	Buffer		 = require('buffer').Buffer;

var HashRing 	 = require('./lib/hashring').HashRing,
	Connection	 = require('./lib/connection'),
	Utils		 = require('./lib/utils'),
	Compression	 = require('./lib/gzip'),
	Manager		 = Connection.Manager,
	IssueLog	 = Connection.IssueLog;

// The constructor
function Client( args, options ){
	var servers = [],
		weights = {},
		key;
	
	// Parse down the connection arguments	
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
	maxKeySize: 251,			 // max keysize allowed by Memcached
	maxExpiration: 2592000,		 // max expiration duration allowed by Memcached
	maxValue: 1048576,			 // max length of value allowed by Memcached
	
	algorithm: 'crc32',			 // hashing algorithm that is used for key mapping  

	poolSize: 10,				 // maximal parallel connections
	reconnect: 18000000,		 // if dead, attempt reconnect each xx ms
	timeout: 5000,				 // after x ms the server should send a timeout if we can't connect
	retries: 5,					 // amount of retries before server is dead
	retry: 30000,				 // timeout between retries, all call will be marked as cache miss
	remove: false,				 // remove server if dead if false, we will attempt to reconnect
	redundancy: false,			 // allows you do re-distribute the keys over a x amount of servers

	compressionThreshold: 10240, // only than will compression be usefull
	keyCompression: true		 // compress keys if they are to large (md5)
};

// There some functions we don't want users to touch so we scope them
(function( nMemcached ){
	const LINEBREAK				= '\r\n',
		  NOREPLY				= ' noreply',
		  FLUSH					= 1E3,
		  BUFFER				= 1E2,
		  CONTINUE				= 1E1,
		  FLAG_JSON 			= 1<<1,
		  FLAG_BINARY			= 2<<1,
		  FLAG_COMPRESSION 		= 3<<1,
		  FLAG_JCOMPRESSION 	= 4<<1,
		  FLAG_BCOMPRESSION		= 5<<1;

	var memcached = nMemcached.prototype = new EventEmitter,
		private = {},
		undefined;
	
	// Creates or generates a new connection for the give server, the callback will recieve the connection
	// if the operation was sucessfull
	memcached.connect = function connect( server, callback ){
		if( server in this.issues && this.issues[ server ].failed )
			return callback( false, false );
		
		if( server in this.connections )
			return this.connections[ server ].allocate( callback );
		
		var serverTokens = /(.*):(\d+){1,}$/.exec( server ).reverse(),
			memcached = this;
			serverTokens.pop();
		
		this.connections[ server ] = new Manager( server, this.poolSize, function( callback ){
			var S = new Stream,
				Manager = this;
			
			// config the Stream
			S.setTimeout( memcached.timeout );
			S.setNoDelay(true);
			S.metaData = [];
			S.responseBuffer = "";
			S.bufferArray = [];
			S.server = server;
			S.tokens = serverTokens;
			
			Utils.fuse( S, {
				connect	: function(){ callback( false, this ) },
				close	: function(){ Manager.remove( this ) },
				error	: function( err ){ memcached.connectionIssue( err, S, callback ) },
				data	: Utils.curry( memcached, private.buffer, S ),
				timeout : function(){ Manager.remove( this ); },
				end		: S.end
			});
			
			// connect the net.Stream [ port, hostname ]
			S.connect.apply( S, serverTokens );
			return S;
		});
		
		this.connections[ server ].allocate( callback );
	};
	
	// Creates a multi stream, so it's easier to query agains
	// multiple memcached servers. 
	memcached.multi = function multi( keys, callback ){
		var map = {}, memcached = this, servers, i;
		
		// gets all servers based on the supplied keys,
		// or just gives all servers if we don't have keys
		if( keys ){
			keys.forEach(function( key ){
				var server = memcached.HashRing.getNode( key );
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
	
	memcached.command = function command( query, server ){
		// if theres an validation error, we do not need to do a callback, it handled inside of it
		if( query.validation && !Utils.validateArg( query, this ))  return;
		
		var memcached = this,
			setter = query.redundancySetter,
			getter = !setter,
			redundancy = this.redundancy,
			iterate;
		
		query.protocol = !redundancy ? query.command : query.command.replace( NOREPLY, '' );
		
		if( !server ){
			server = this.HashRing.createRange( query.key, redundancy ? redundancy + 1 : 1 , true );
			iterate = new Utils.Iterator( server, function( node, index, array ){
				
				// it seems the server failed, see if we have more servers we can iterate, if not we mark it as
				// cache miss.
				if( node in memcached.issues && memcached.issues[ node ].failed )
					return iterate.hasNext() ? iterate.next() : query.callback && query.callback( false, false );
					
				memcached.connect( node, function( error, S ){
					
					if( error ) return iterate.hasNext() ? iterate.next() : query.callback && query.callback( error, false );
					if( !S ) return query.callback && query.callback( false, false );
					if( S.readyState !== 'open' ) return iterate.hasNext() ? iterate.next() : query.callback && query.callback( 'Connection readyState is set to ' + S.readySate );
					
					if( query.protocol && query.callback ){
						query.start = +new Date; S.metaData.push( query );
					} 
					
					S.write( ( query.protocol || query.command ) + LINEBREAK );
					
					if( query.protocol ) delete query.protocol; // remove the protocol after we used it
					iterate.hasNext() && iterate.next()
				});
			});
						
			// start iterating
			iterate.hasNext() && iterate.next();
			
		} else {
			if( server in this.issues && this.issues[ server ].failed )
				return query.callback && query.callback( false, false );

			this.connect( server, function( error, S ){
				
				if( error ) return query.callback && query.callback( error );
				if( !S ) return query.callback && query.callback( false, false );
				if( S.readyState !== 'open' ) return query.callback && query.callback( 'Connection readyState is set to ' + S.readySate );
				
				// used for request timing
				query.start = +new Date;
				S.metaData.push( query );
				
				S.write( ( query.protocol || query.command ) + LINEBREAK );
			});	
		}
	};
	
	// Executes the command on the net.Stream, if no server is supplied it will use the query.key to get 
	/* the server from the HashRing
	memcached.command = function command( queryCompiler, server ){
		
		// generate a regular query, 
		var query = queryCompiler(),
			redundancy = this.redundancy && this.redundancy < this.servers.length,
			queryRedundancy = query.redundancySetter,
			memcached = this;
		
		if( query.validation && !Utils.validateArg( query, this ))  return;
				
		server = server || redundancy && queryRedundancy ? ( redundancy = this.HashRing.createRange( query.key, ( this.redundancy + 1 ), true )).shift() : this.HashRing.getNode( query.key );
		
		if( server in this.issues && this.issues[ server ].failed )
			return query.callback && query.callback( false, false );
		
		this.connect( server, function( error, S ){
			
			if( !S ) return query.callback && query.callback( false, false );
			if( error ) return query.callback && query.callback( error );
			if( S.readyState !== 'open' ) return query.callback && query.callback( 'Connection readyState is set to ' + S.readySate );
			
			// used for request timing
			query.start = +new Date;
			S.metaData.push( query );
			S.write( query.command + LINEBREAK );
		});
		
		// if we have redundancy enabled and the query is used for redundancy, than we are going loop over
		// the servers, check if we can reach them, and connect to the correct net connection.
		// because all redundancy querys are executed with "no reply" we do not need to store the callback
		// as there will be no value to parse. 
		if( redundancy && queryRedundancy ){
			queryRedundancy = queryCompiler( queryRedundancy );
			
			redundancy.forEach(function( server ){
				if( server in memcached.issues && memcached.issues[ server ].failed )
					return;
				
				memcached.connect( server, function( error, S ){
					if( !S || error || S.readyState !== 'open' ) return
					S.write( queryRedundancy.command + LINEBREAK );
				});
			})
		}
	};*/
	
	// Logs all connection issues, and handles them off. Marking all requests as cache misses.
	memcached.connectionIssue = function connectionIssue( error, S, callback ){
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
	
	// Kills all active connections
	memcached.end = function end(){
		var memcached = this;
		Object.keys( this.connections ).forEach(function( key ){ memcached.connections[ key ].free(0) });
	};
	
	// These do not need to be publicly available as it's one of the most important
	// parts of the whole client, the parser commands:
	private.parsers = {
		// handle error respones
		'NOT_FOUND': 	function( tokens, dataSet, err ){ return [ CONTINUE, false ] },
		'NOT_STORED': 	function( tokens, dataSet, err ){ return [ CONTINUE, false ] },
		'ERROR': 		function( tokens, dataSet, err ){ err.push( 'Received an ERROR response'); return [ FLUSH, false ] },
		'CLIENT_ERROR': function( tokens, dataSet, err ){ err.push( tokens.splice(1).join(' ') ); return [ BUFFER, false ] },
		'SERVER_ERROR': function( tokens, dataSet, err, queue, S, memcached ){ memcached.connectionIssue( tokens.splice(1).join(' '), S ); return [ CONTINUE, false ] },
		
		// keyword based responses
		'STORED': 		function( tokens, dataSet ){ return [ CONTINUE, true ] },
		'DELETED': 		function( tokens, dataSet ){ return [ CONTINUE, true ] },
		'OK': 			function( tokens, dataSet ){ return [ CONTINUE, true ] },
		'EXISTS': 		function( tokens, dataSet ){ return [ CONTINUE, true ] },
		'END': 			function( tokens, dataSet, err, queue ){ if( !queue.length) queue.push( false ); return [ FLUSH, true ] },
		
		// value parsing:
		'VALUE': 		function( tokens, dataSet, err, queue ){
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
									tmp.write( dataSet, 0, 'binary' );
									dataSet = tmp;
									break;
							}
								
							// Add to queue as multiple get key key key key key returns multiple values
							queue.push( dataSet );
							return [ BUFFER, false ] 
						},
		'INCRDECR':		function( tokens ){ return [ CONTINUE, +tokens[1] ] },
		'STAT': 			function( tokens, dataSet, err, queue ){
							queue.push([tokens[1], /^\d+$/.test( tokens[2] ) ? +tokens[2] : tokens[2] ]); return [ BUFFER, true ] 
						},
		'VERSION':		function( tokens, dataSet ){
							var versionTokens = /(\d+)(?:\.)(\d+)(?:\.)(\d+)$/.exec( tokens.pop() );
							return [ CONTINUE, 
									{
										server: this.server, 
										version:versionTokens[0],
										major: 	versionTokens[1] || 0,
										minor: 	versionTokens[2] || 0,
										bugfix: versionTokens[3] || 0
									}]
						},
		'ITEM':			function( tokens, dataSet, err, queue ){
							queue.push({
								key: tokens[1],
								b: +tokens[2].substr(1),
								s: +tokens[4]
							});
							return [ BUFFER, false ]
						}
	};
	
	// Parses down result sets
	private.resultParsers = {
		// combines the stats array, in to an object
		'stats': 		function( resultSet ){
							var response = {};
							
							// add references to the retrieved server
							response.server = this.server;
							
							// Fill the object 
							resultSet.forEach(function( statSet ){
								response[ statSet[0] ] =  statSet[1];
							});
							
							return response;
						},
		
		// the settings uses the same parse format as the regular stats
		'stats settings':function(){
							return private.resultParsers.stats.apply( this, arguments );
						},
						
		// Group slabs by slab id
		'stats slabs':	function( resultSet ){
							var response = {};
							
							// add references to the retrieved server
							response.server = this.server;
							
							// Fill the object 
							resultSet.forEach(function( statSet ){
								var identifier = statSet[0].split( ':' );
								
								if( !response[ identifier[0] ] )
									response[ identifier[0] ] = {};
								
								response[ identifier[0] ][ identifier[1] ] = statSet[1];
								
							});
							
							return response;
						},
		'stats items':	function( resultSet ){
							var response = {};
							
							// add references to the retrieved server
							response.server = this.server;
							
							// Fill the object 
							resultSet.forEach(function( statSet ){
								var identifier = statSet[0].split( ':' );
								
								if( !response[ identifier[1] ] )
									response[ identifier[1] ] = {};
								
								response[ identifier[1] ][ identifier[2] ] = statSet[1];
								
							});
							
							return response;
						}
	};
	
	// Generates a RegExp that can be used to check if a chunk is memcached response identifier	
	private.allCommands = new RegExp( '^(?:' + Object.keys( private.parsers ).join( '|' ) + '|\\d' + ')' );
	private.bufferedCommands = new RegExp( '^(?:' + Object.keys( private.parsers ).join( '|' ) + ')' );
	
	// When working with large chunks of responses, node chunks it in to peices. So we might have
	// half responses. So we are going to buffer up the buffer and user our buffered buffer to query
	// against. Also when you execute allot of .writes to the same stream, node will combine the responses
	// in to one response stream. With no indication where it had cut the data. So it can be it cuts inside the value response,
	// or even right in the middle of a linebreak, so we need to make sure, the last peice in the buffer is a LINEBREAK
	// because that is all what is sure about the Memcached Protocol, all responds end with them.
	private.buffer = function BufferBuffer( S, BufferStream ){
		S.responseBuffer += BufferStream;
		
		// only call transform the data once we are sure, 100% sure, that we valid response ending
		if( S.responseBuffer.substr( S.responseBuffer.length - 2 ) === LINEBREAK ){
			var chunks = S.responseBuffer.split( LINEBREAK );
			
			S.responseBuffer = ""; // clear!
			this.rawDataReceived( S, S.bufferArray = S.bufferArray.concat( chunks ) );
		} 
	};
	
	// The actual parsers function that scan over the responseBuffer in search of Memcached response
	// identifiers. Once we have found one, we will send it to the dedicated parsers that will transform
	// the data in a human readable format, deciding if we should queue it up, or send it to a callback fn. 
	memcached.rawDataReceived = function rawDataReceived( S ){
		var queue = [],	token, tokenSet, dataSet = '', resultSet, metaData, err = [], tmp;
		while( S.bufferArray.length && private.allCommands.test( S.bufferArray[0] ) ){

			token = S.bufferArray.shift();
			tokenSet = token.split( ' ' );
			
			// special case for digit only's these are responses from INCR and DECR
			if( /\d+/.test( tokenSet[0] ))
				tokenSet.unshift( 'INCRDECR' );
				
			// special case for value, it's required that it has a second response!
			// add the token back, and wait for the next response, we might be handling a big 
			// ass response here. 
			if( tokenSet[0] == 'VALUE' && S.bufferArray.indexOf( 'END' ) == -1 ){
				return S.bufferArray.unshift( token );
			}
			
			// check for dedicated parser
			if( private.parsers[ tokenSet[0] ] ){
				
				// fetch the response content
				while( S.bufferArray.length ){
					if( private.bufferedCommands.test( S.bufferArray[0] ) )
						break;
						
					dataSet += S.bufferArray.shift();
				};
								
				resultSet = private.parsers[ tokenSet[0] ].call( S, tokenSet, dataSet || token, err, queue, this );
				
				// check how we need to handle the resultSet response
				switch( resultSet.shift() ){
					case BUFFER:
						break;
						
					case FLUSH:
						metaData = S.metaData.shift();
						resultSet = queue;
						
						// if we have a callback, call it
						if( metaData && metaData.callback ){
							metaData.execution = +new Date - metaData.start;
							metaData.callback.call( 
								metaData, err.length ? err : err[0],
								
								// see if optional parsing needs to be applied to make the result set more readable
								private.resultParsers[ metaData.type ] ? private.resultParsers[ metaData.type ].call( S, resultSet, err ) :
								!Array.isArray( queue ) || queue.length > 1 ? queue : queue[0] 
							);
						}
							
						queue.length = 0;
						err.length = 0;
						break;
						
					case CONTINUE:	
					default:
						metaData = S.metaData.shift();
						
						if( metaData && metaData.callback ){
							
							metaData.execution = +new Date - metaData.start;
							metaData.callback.call( metaData, err.length > 1 ? err : err[0], resultSet[0] );
						}
							
						err.length = 0;
						break;
				}
			} else {
				// handle unkown responses
				metaData = S.metaData.shift();
				if( metaData && metaData.callback ){
					metaData.execution = +new Date - metaData.start;
					metaData.callback.call( metaData, 'Unknown response from the memcached server: "' + token + '"', false );
				}
			}
			
			// cleanup
			dataSet = ''
			tokenSet = undefined;
			metaData = undefined;
			
			// check if we need to remove an empty item from the array, as splitting on /r/n might cause an empty
			// item at the end.. 
			if( S.bufferArray[0] === '' )
				S.bufferArray.shift();
		};
	};
	
	// Small wrapper function that only executes errors when we have a callback
	private.errorResponse = function errorResponse( error, callback ){
		if( typeof callback == 'function' )
			callback( error, false );
		
		return false;
	};
	
	// This is where the actual Memcached API layer begins:
	
	// Get, gets all the same, no difference
	memcached.gets = memcached.get = function get( key, callback ){
		if( Array.isArray( key ) )
			return this.getMulti.apply( this, arguments );
			
		this.command({
			key: key, callback: callback,
			
			// validate the arguments
			validate: [[ 'key', String ], [ 'callback', Function ]],
			
			// used for the query
			type: 'get',
			command: 'get ' + key
		});
	};
	
	// Handles get's with multiple keys
	memcached.getMulti = function getMulti( keys, callback ){
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
	
	// As all command nearly use the same syntax we are going to proxy them all to this 
	// function to ease maintainance. This is possible because most set commands will use the same
	// syntax for the Memcached server. Some commands do not require a lifetime and a flag, but the
	// memcached server is smart enough to ignore those. 
	private.setters = function setters( type, validate, key, value, lifetime, callback, cas ){
		var flag = 0,
			memcached = this,
			process = function( err, value ){
				if( err )
					return private.errorResponse( err, callback );
					
				if( value.length > memcached.maxValue )
					return private.errorResponse( 'The length of the value is greater-than ' + memcached.compressionThreshold, callback );
						
				memcached.command({
					key: key, callback: callback, lifetime: lifetime, value: value, cas: cas,
					
					// validate the arguments
					validate: validate,
					
					type: type,
					redundancySetter: true,
					command: [ type, key, flag, lifetime, Buffer.byteLength( value ) ].join( ' ' ) + ( cas ? cas : '' ) + ( memcached.redundancy ? NOREPLY : '' ) + LINEBREAK + value
				})
			};
		
		if( Buffer.isBuffer( value ) ){
			flag = FLAG_BINARY;
			value = value.toString( 'binary' );
		} else if( typeof value !== 'string' ){
			flag = FLAG_JSON;
			value = JSON.stringify( value );
		} else {
			value = value.toString();	
		}
		
		if( value.length > this.compressionThreshold ){
			flag = flag == FLAG_JSON ? FLAG_JCOMPRESSION : flag == FLAG_BINARY ? FLAG_BCOMPRESSION : FLAG_COMPRESSION;
			Compression.deflate( value, process );
		} else {
			process( false, value );
		}
	};
	
	// Curry the function and so we can tell the type our private set function
	memcached.set = Utils.curry( false, private.setters, 'set', [[ 'key', String ], [ 'lifetime', Number ], [ 'value', String ], [ 'callback', Function ]] );
	memcached.replace = Utils.curry( false, private.setters, 'replace', [[ 'key', String ], [ 'lifetime', Number ], [ 'value', String ], [ 'callback', Function ]] );
	memcached.add = Utils.curry( false, private.setters, 'add', [[ 'key', String ], [ 'lifetime', Number ], [ 'value', String ], [ 'callback', Function ]] );
	
	memcached.cas = function checkandset( key, value, cas, lifetime, callback ){
		private.setters.call( this, 'cas', [[ 'key', String ], [ 'lifetime', Number ], [ 'value', String ], [ 'callback', Function ]], key, value, lifetime, callback, cas );
	};
	
	memcached.append = function append( key, value, callback ){
		private.setters.call( this, 'append', [[ 'key', String ], [ 'lifetime', Number ], [ 'value', String ], [ 'callback', Function ]], key, value, 0, callback );
	};
	
	memcached.prepend = function prepend( key, value, callback ){
		private.setters.call( this, 'prepend', [[ 'key', String ], [ 'lifetime', Number ], [ 'value', String ], [ 'callback', Function ]], key, value, 0, callback );
	};
	
	// Small handler for incr and decr's
	private.incrdecr = function incrdecr( type, key, value, callback ){
		this.command({
			key: key, callback: callback, value: value,
			
			// validate the arguments
			validate: [[ 'key', String ], [ 'value', Number ], [ 'callback', Function ]],
			
			// used for the query
			type: type,
			redundancySetter: true,
			command: [ type, key, value ].join( ' ' ) + ( this.redundancy ? NOREPLY : '' )
		});
	};
	
	// Curry the function and so we can tell the type our private incrdecr
	memcached.increment = memcached.incr = Utils.curry( false, private.incrdecr, 'incr' );
	memcached.decrement = memcached.decr = Utils.curry( false, private.incrdecr, 'decr' );
	
	// Deletes the keys from the servers
	memcached.del = function del( key, callback ){
		this.command({
			key: key, callback: callback,
			
			// validate the arguments
			validate: [[ 'key', String ], [ 'callback', Function ]],
			
			// used for the query
			type: 'delete',
			redundancySetter: true,
			command: 'delete ' + key + ( this.redundancy ? NOREPLY : '' )
		});
	};
	
	
	// Small wrapper that handle single keyword commands such as FLUSH ALL, VERSION and STAT
	private.singles = function singles( type, callback ){
		var memcached = this, responses = [], errors = [], calls,
			handle = function( err, results ){
				if( err ) errors.push( err );
				if( results ) responses = responses.concat( results );
				
				// multi calls should ALWAYS return an array!
				if( !--calls ) callback( errors, responses );
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
	
	// Curry the function and so we can tell the type our private singles
	memcached.version = Utils.curry( false, private.singles, 'version' );
	memcached.flush = Utils.curry( false, private.singles, 'flush_all' );
	memcached.stats = Utils.curry( false, private.singles, 'stats' );
	memcached.settings = Utils.curry( false, private.singles, 'stats settings' );
	memcached.slabs = Utils.curry( false, private.singles, 'stats slabs' );
	memcached.items = Utils.curry( false, private.singles, 'stats items' );
	
	// You need to use the items dump to get the correct server and slab settings
	// see simple_cachedump.js for an example
	memcached.cachedump = function cachedump( server, slabid, number, callback ){
		this.command({
				callback: callback,
				number: number,
				slabid: slabid,
				
				// validate the arguments
				validate: [[ 'number', Number ], [ 'slabid', Number ], [ 'callback', Function ]],
				
				type: 'stats cachedump',
				command: 'stats cachedump ' + slabid + ' ' + number
			},
			server
		);
	};
	
})( Client );

module.exports = Client;