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
		
	sys.puts( hashring.getNode( "my-super-secret-cache-key" ) )
	sys.puts( hashring.getNode( "hello-world" ) )
	sys.puts( hashring.getNode( "my-super-secret-cache-key" ) )
	
*/
function hashRing( nodes, weights, algorithm ){
	
	if( !nodes || !weights )
		throw new Error( "Not all required arguments are specified." );
	
	this.ring = {};
	this.sortedKeys = [];
	
	this.nodes = nodes;
	this.weights = weights || {};
	this.algorithm = algorithm || "md5";
	this.generateRing();
};

var HashRing = hashRing.prototype;

	
// Generates the hashRing values based on the nodes and their weight
HashRing.generateRing = function(){
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
			
			tmp = this.hashKey( node + "-" + j );
			for( k = 0; k < 3; k++ ){
				key = this.hashValue( tmp, function( x ){ return x + k * 4 } );
				this.ring[ key ] = node;
				this.sortedKeys.push( key );
			}
		}
		
	}
	
	// Sort the keys, nummeric !important. I forgot it at first and took me 2 hours to debug \o/
	this.sortedKeys.sort( function( a, b ){ return a - b } );
};

// returns the correct node for the key based on the hashing, or false if it fails to get
// the node.
HashRing.getNode = function( key ){
	var position = this.getNodePosition( key );
	return position === false ? false : this.ring[ this.sortedKeys[ position ] ];
};

// returns the position of the key inside the keyring
HashRing.getNodePosition = function( key ){
	if( !Object.keys( this.ring ).length )
		return false;
	
	var keys = this.generateKey( key ),
		nodes = this.sortedKeys,
		position = Bisection( nodes, keys );
	
	return position == nodes.length ? 0 : position;
};

// replaces a assigned server of the ring with a new server
// hot swapping servers
HashRing.replaceServer = function( oldServer, newServer ){
	var HashRIng = this;
	Object.key( this.ring ).forEach(function( key ){
		if( HashRIng.ring[ key ] == oldServer )
			HashRIng.ring[ key ] = newServer;
	});
	
	// remove the server from this.nodes and replace it with new server as well
	this.nodes.splice( this.nodes.indexOf( oldServer ), 1, newServer );
};

// adds a server and regenerates the ring
HashRing.addServer = function( server, weights ){
	if( this.nodes.indexOf( server ) !== -1 ) return; // prevents duplicates
	
	// add weights 
	if( weights )
		for( var key in weights )
			this.weights[ key ] = weights[ key ];
	
	this.nodes.push( server );
	this.sortedKeys.length = 0;
	this.ring = {};
	this.generateRing();
};

// iterates over the nodes for a give key, distinct allows you to choose if you want duplicate nodes or not
HashRing.iterateNodes = function( key, distinct, callback ){
	if( !Object.keys( this.ring ).length )
		return false;
	
	distinct = distinct === "undefined" ? true : distinct;
	
	var returnvalues = [],
		returnnodes = [],
		position = this.getNodePosition(),
		slices = this.sortedKeys.slice( position ),
		
		// a small filter function that checks for duplicates
		distinctFilter = function( value ){
			if( returnvalues.indexOf( value ) != -1 ){
				returnvalues.push( value );
				return value;
			}
		}, node, i = 0, length = slices.length;
	
	for(; i < length; i++ ){
		node = distinct ? distinctFilter( this.ring[ slices[i] ] ) : this.ring[ slices[i] ];
		if( node )
			return nodes.push( node );
	}
	
	i = 0; length = this.sortedKeys.length;
	for(; i < length; i++ ){
		if( i < pos ){
			node = distinct ? distinctFilter( this.ring[ this.sortedKeys[i] ] ) : this.ring[ this.sortedKeys[i] ];
			if( node )
				returnnodes.push( node );
		}
	}
	
	// now that we have collect all the nodes, we can iterate over them
	returnnodes.forEach( callback );
	
};

// generates a long value of the key that represents a place on the hash ring
HashRing.generateKey = function( key ){
	return this.hashValue( this.hashKey( key ), function( x ){ return x } );
};

// Creates a hash value based on our hash_key
HashRing.hashValue = function( key, compare ){
	return (
		( key[ compare( 3 ) ] << 24 ) |
		( key[ compare( 2 ) ] << 16 ) |
		( key[ compare( 1 ) ] << 8 ) |
		key[ compare( 0 ) ]
	)
};

// Creates our hash key
HashRing.hashKey = function( data ){
	var hash = CreateHash( this.algorithm ).update( data ).digest( 'hex' );
	return hash.split( '' ).map(function( v ){ return v.charCodeAt( 0 ) })
}

exports.HashRing = hashRing;