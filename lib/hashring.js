var CreateHash 	= require('crypto').createHash,
	Bisection 	= require('./utils').Bisection;
	
/*
	example usage:
	var sys = require( 'sys' ),
		hashing = require( '../lib/hashring' ),
		hashring = new hashing.hashRing(
			[ '192.168.0.102:11212', '192.168.0.103:11212', '192.168.0.104:11212' ],
			
			// Weights are optional, but can be usefull if you have memcached server that can use allot of memory
			{
				'192.168.0.102:11212': 1,
				'192.168.0.103:11212': 2,
				'192.168.0.104:11212': 1
			}
		);
		
	sys.puts( hashring.get_node( "my-super-secret-cache-key" ) )
	sys.puts( hashring.get_node( "hello-world" ) )
	sys.puts( hashring.get_node( "my-super-secret-cache-key" ) )
	
*/
function hashRing( nodes, weights, algorithm ){
	
	if( !nodes || !weights )
		throw new Error( "Not all required arguments are specified." );
	
	this.ring = {};
	this.sorted_keys = [];
	
	this.nodes = nodes;
	this.weights = weights || {};
	this.algorithm = algorithm || "md5";
	this.generate_ring();
};

var HashRing = hashRing.prototype;

	
// Generates the hashRing values based on the nodes and their weight
HashRing.generate_ring = function(){
	var totalweight = 0,
		len, i = len = this.nodes.length,
		tmp, node, weight, factor, j, k, key;
	
	// Generate the total weight of all the nodes, each node weights 1 by default
	while( i-- ){
		tmp = this.weights[ this.nodes[i] ];
		totalweight += ( tmp || 1 );
	}
					
	// Calculate our hash-ring
	for( i = 0; i < len; i++ ){
		
		weight = 1;
		node = this.nodes[i];
		
		if( tmp = this.weights[ node ] )
			weight = tmp;
		
		// The factor is based on the weight, the more weight the more space a item will get in our
		// hash ring
		factor = Math.floor( ( 40 * len * weight ) / totalweight );
		
		for( j = 0; j < factor; j++ ){
			
			tmp = this.hash_key( node + "-" + j );
			for( k = 0; k < 3; k++ ){
				key = this.hash_value( tmp, function( x ){ return x + k * 4 } );
				this.ring[ key ] = node;
				this.sorted_keys.push( key );
			}
		}
		
	}
	
	// Sort the keys, nummeric !important. I forgot it at first and took me 2 hours to debug \o/
	this.sorted_keys.sort( function( a, b ){ return a - b } );
};

// returns the correct node for the key based on the hashing, or false if it fails to get
// the node.
HashRing.get_node = function( user_key ){
	var position = this.get_node_position( user_key );
	return position === false ? false : this.ring[ this.sorted_keys[ position ] ];
};

// returns the position of the key inside the keyring
HashRing.get_node_position = function( user_key ){
	if( !Object.keys( this.ring ).length )
		return false;
	
	var key = this.generate_key( user_key ),
		nodes = this.sorted_keys,
		position = Bisection( nodes, key );
	
	return position == nodes.length ? 0 : position;
};

// iterates over the nodes for a give key, distinct allows you to choose if you want duplicate nodes or not
HashRing.iterate_nodes = function( user_key, distinct, callback ){
	if( !Object.keys( this.ring ).length )
		return false;
	
	distinct = distinct === "undefined" ? true : distinct;
	
	var returnvalues = [],
		returnnodes = [],
		position = this.get_node_position(),
		slices = this.sorted_keys.slice( position ),
		
		// a small filter function that checks for duplicates
		distinct_filter = function( value ){
			if( returnvalues.indexOf( value ) != -1 ){
				returnvalues.push( value );
				return value;
			}
		}, node, i = 0, length = slices.length;
	
	for(; i < length; i++ ){
		node = distinct ? distinct_filter( this.ring[ slices[i] ] ) : this.ring[ slices[i] ];
		if( node )
			returnnodes.push( node );
	}
	
	i = 0; length = this.sorted_keys.length;
	for(; i < length; i++ ){
		if( i < pos ){
			node = distinct ? distinct_filter( this.ring[ this.sorted_keys[i] ] ) : this.ring[ this.sorted_keys[i] ];
			if( node )
				returnnodes.push( node );
		}
	}
	
	// now that we have collect all the nodes, we can iterate over them
	returnnodes.forEach( callback );
	
};

// generates a long value of the key that represents a place on the hash ring
HashRing.generate_key = function( key ){
	return this.hash_value( this.hash_key( key ), function( x ){ return x } );
};

// Creates a hash value based on our hash_key
HashRing.hash_value = function( key, compare ){
	return (
		( key[ compare( 3 ) ] << 24 ) |
		( key[ compare( 2 ) ] << 16 ) |
		( key[ compare( 1 ) ] << 8 ) |
		key[ compare( 0 ) ]
	)
};

// Creates our hash key
HashRing.hash_key = function( data ){
	var hash = CreateHash( this.algorithm ).update( data ).digest( 'hex' );
	return hash.split( '' ).map(function( v ){ return v.charCodeAt( 0 ) })
}

exports.HashRing = hashRing;