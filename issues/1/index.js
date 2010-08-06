/*
 * Test case for github issue #1 : http://github.com/3rd-Eden/node-memcached/issues#issue/1
 * After testing highload, they recieved un parsed response strings from the nMemcached client.
 * 
 * This is a near exact replicate of the issue, with buildin progress reporting.
 * To run the test fire start the node.js index:
 *
 * 		> node index.js
 *
 * After node is running execute the test.sh suite
 *
 * 		> ./test.sh
 *
 * Monitor node for any error responses. 
 */
var	nMemcached = require( '../../nMemcached' ),
	count = 0,
	originalString = 'abcdefghijklmnopqrstuvwxyz0123456789',
	memcached;

// connect to our memcached server on host 10.211.55.5, port 11211
memcached = new nMemcached( '10.211.55.5:11211' );

memcached.set( 'issue_1', originalString, 3600, function( err, result ){
	if( err ) console.error( err );
	
	require( 'http' ).createServer(function (request, response){
		memcached.get( 'issue_1', function( err, result ){
			
			// error reporting
			if( err ) console.error( err );
			if( result !== originalString ) console.log( result );
			
			// progress reporting
			if( ++count % 100 == 0 ) console.log( "Passed %d tests.", count );
			
			memcached.end();
		});
		
		response.writeHead( 200, { 'Content-Type': 'text/html' });
		response.end();
		
	}).listen( 8124, 'localhost' );
});