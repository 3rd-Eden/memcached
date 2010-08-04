var spawn = require( 'child_process' ).spawn;

// check if we have the compress module available, if so, we can leverage that to compress the data.
// see http://github.com/egorich239/node-compress
try{
	var compress = require( 'compress' ),
		gzip = new compress.Gzip( 9 ),
		gunzip = new compress.Gunzip;

	exports.inflate = function gzipDeflate( data, callback ){
		callback( false, gunzip.inflate( data ) + gunzip.end() );
	};
	
	exports.deflate = function gzipInflate( data, callback ){
		callback( false, gzip.deflate( data, 'binary' ) + gzip.end() );
	};

} catch( e ){
	if ( !/^Cannot find module /i.test( e.message ) )
		throw e;
	
	// we can't use the node-compress module, so we are going to leverage native processes to 
	// do the hard work for us. 
	
	exports.deflate = function gzipDeflate( data, callback ){
		var gzip = spawn( 'gzip', [ '-9' ]),
			buffer = '';
				
		gzip.stdout.on( 'data', function( data ){
			buffer += data.toString('binary');
		});
		
		gzip.on( 'exit', function(){
			callback( false, buffer );
		});
		
		gzip.stdin.write( data );
		gzip.stdin.end();
	};
	
	exports.inflate = function gzipInflate( data, callback ){
		var gunzip = spawn( 'gunzip', [ '-9' ] ),
			buffer = '';
		
		gunzip.stdout.on( 'data', function( data ){
			buffer += data;
		});
		
		gunzip.on( 'exit', function(){
			callback( buffer );
		});
		
		gunzip.stdin.write( data );
		gunzip.stdin.end();
	};
};