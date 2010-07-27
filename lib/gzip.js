var child_process = require( 'child_process' );

// check if we have the compress module available, if so, we can leverage that to compress the data.
// see http://github.com/egorich239/node-compress
try{
	var compress = require( 'compress' ),
		gzip = new compress.Gzip(9),
		gunzip = new compress.Gunzip;

	exports.inflate = function( data, callback ){
		callback( gunzip.inflate( data ) + gunzip.end() );
	};
	
	exports.deflate = function( data, callback ){
		callback( gzip.deflate( data, 'binary' ) + gzip.end() );
	};

} catch( e ){
	if ( !/^Cannot find module /i.test( e.message ) )
		throw e;
	
	// we can't use the node-compress module, so we are going to leverage native processes to 
	// do the hard work for us. 
	
	exports.deflate = function( data, callback ){
		var gzipstream = child_process.spawn( 'gzip', ['-9']),
			buffer = '';
		
		gzipstream.on( 'data', function(){
			buffer += data;
		});
		
		gzipstream.on( 'err', function(){
			callback( data );
			gzipstream.close && gzipstream.close()
		});
		
		gzipstream.on( 'end', function(){
			callback( buffer );
		});
		
		gzipstream.write( data );
	};
	
	exports.inflate = function( data, callback ){
		var gunzipstream = child_process.spawn( 'gzip' ),
			buffer = '';
		
		gunzipstream.on( 'data', function(){
			buffer += data;
		});
		
		gunzipstream.on( 'err', function(){
			callback( data );
			gunzipstream.close && gunzipstream.close()
		});
		
		gunzipstream.on( 'end', function(){
			callback( buffer );
		})
		
		gunzipstream.write( data );
	};
}