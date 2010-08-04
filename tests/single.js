var	nMemcached = require( '../nMemcached' ),
	assert = require('./assert'),
	memcached;

// single server test runner, this test requires a empty Memcached server. So don't assign any live production
// servers to this test runner.
memcached = new nMemcached( "10.211.55.5:11211" );

// make sure we are working with a empty server
memcached.flush(function( err, res ){	
	assert.equal( res[0], true, "memcached.flush" );
	
	// set, incr, decr and deleting of values
	memcached.set( "test_set", "1", 0, function( err, res ){
		assert.equal( res, true, "memcached.set" );
		
		memcached.incr( "test_set", 2, function( err, res ){
			assert.equal( typeof res == "number" && res === 3, true, "memcached.incr" );
			
			memcached.decr( "test_set", 1, function( err, res ){
				assert.equal( typeof res == "number" && res === 2, true, "memcached.decr" );
				
				memcached.del( "test_set", function( err, res ){
					assert.equal( res, true, "memcached.delete" );
				});
			});
		});
	});
	
	// setting json 
	memcached.set( "test_json", { hello: 'world', foo:[ 'bar', 'bar'] }, 0, function( err, res ){
		memcached.get( "test_json", function( err, res ){
			assert.equal( JSON.stringify( res ), JSON.stringify({ hello: 'world', foo:[ 'bar', 'bar'] }), "memcached.set --json" );
		});
	});
	
	// test add functionality
	memcached.set( "test_add", "value", 0, function( err, res ){
		memcached.add( "test_add", "value", 0, function( err, res ){
			assert.equal( false, false, "memcached.add did not add value" );
			memcached.add( "test_add_new", "value", 0, function( err, res ){
				assert.equal( true, true, "memcached.add did add value" );
			});
		})
	});
	
	// resting pre & append methods
	memcached.set( "test_xxxpend", "value", 0, function( err, res ){
		memcached.append( "test_xxxpend", "ue", function( err, res ){
			assert.equal( res, true, "memcached.append" );
			
			memcached.prepend( "test_xxxpend", "val", function( err, res ){
				assert.equal( res, true, "memcached.prepend" );
				
				memcached.get( "test_xxxpend", function( err, res ){
					assert.equal( res, "valvalueue", "memcached.pre/append value check" );
				});
			});
		});
	});
	
	// test replace functionality
	memcached.set( "test_replace", "value", 0, function( err, res ){
		memcached.replace( "test_replace", "boogie", 0, function( err, res ){
			assert.equal( true, res, "memcached.replace" );
			memcached.get( "test_replace", function( err, res ){
				assert.equal( res, "boogie", "memcached.replace value check" );
			});
		})
	});
});