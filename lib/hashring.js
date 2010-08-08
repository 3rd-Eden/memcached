var CreateHash 	  = require('crypto').createHash,
	StringDecoder = require('string_decoder').StringDecoder,
	Bisection 	  = require('./utils').Bisection;
	
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
	
	if( !nodes )
		throw new Error( "Not all required arguments are specified." );
	
	this.ring = {};
	this.sortedKeys = [];
	
	this.nodes = nodes;
	this.weights = weights || {};
	this.algorithm = algorithm || "crc32";
	
	if( this.algorithm == "crc32" )
		this.hashKey = this.crc32HashKey;
	
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
HashRing.createRange = function( key, size, distinct ){
	if( !Object.keys( this.ring ).length )
		return false;
	
	distinct = distinct == "undefined" ? true : distinct;
	
	var returnvalues = {},
		returnnodes = [],
		position = this.getNodePosition( key ),
		slices = this.sortedKeys.slice( position ),
		
		// a small filter function that checks for duplicates
		distinctFilter = function( value ){
			if( !returnvalues[ value ] ){
				returnvalues[ value ] = true;
				return value;
			}
		}, value, i = 0, length = slices.length;
	
	for(; i < length; i++ ){
		value = distinct ? distinctFilter( this.ring[ slices[i] ] ) : this.ring[ slices[i] ];
		if( value )
			returnnodes.push( value );
		
		if( size && returnnodes.length >= size )
			break;
	};
	
	// as we might have reached the end of our sortedKeys array, and didn't fill our returnnodes completely:
	if( !size || returnnodes.length < size ){
		for(i = 0, length = this.sortedKeys.length; i < length; i++ ){
			if( i < position ){
				value = distinct ? distinctFilter( this.ring[ this.sortedKeys[i] ] ) : this.ring[ this.sortedKeys[i] ];
				if( value )
					returnnodes.push( value );
				
				if( size && returnnodes.length >= size )
					break;
			} else {
				break;
			}
		}
	}
	
	// now that we have collect all the nodes, we can return the range
	return returnnodes;
	
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
};

// Based on the crc32 of PHPJS, optimized for node.js
HashRing.crc32HashKey = function( str ){
	str = new StringDecoder( 'utf8' ).write( str );
	
	var crc = 0 ^ ( -1 ),
		i = 0, length = str.length,
		map = '00000000 77073096 EE0E612C 990951BA 076DC419 706AF48F E963A535 9E6495A3 0EDB8832 79DCB8A4 E0D5E91E 97D2D988 09B64C2B 7EB17CBD E7B82D07 90BF1D91 1DB71064 6AB020F2 F3B97148 84BE41DE 1ADAD47D 6DDDE4EB F4D4B551 83D385C7 136C9856 646BA8C0 FD62F97A 8A65C9EC 14015C4F 63066CD9 FA0F3D63 8D080DF5 3B6E20C8 4C69105E D56041E4 A2677172 3C03E4D1 4B04D447 D20D85FD A50AB56B 35B5A8FA 42B2986C DBBBC9D6 ACBCF940 32D86CE3 45DF5C75 DCD60DCF ABD13D59 26D930AC 51DE003A C8D75180 BFD06116 21B4F4B5 56B3C423 CFBA9599 B8BDA50F 2802B89E 5F058808 C60CD9B2 B10BE924 2F6F7C87 58684C11 C1611DAB B6662D3D 76DC4190 01DB7106 98D220BC EFD5102A 71B18589 06B6B51F 9FBFE4A5 E8B8D433 7807C9A2 0F00F934 9609A88E E10E9818 7F6A0DBB 086D3D2D 91646C97 E6635C01 6B6B51F4 1C6C6162 856530D8 F262004E 6C0695ED 1B01A57B 8208F4C1 F50FC457 65B0D9C6 12B7E950 8BBEB8EA FCB9887C 62DD1DDF 15DA2D49 8CD37CF3 FBD44C65 4DB26158 3AB551CE A3BC0074 D4BB30E2 4ADFA541 3DD895D7 A4D1C46D D3D6F4FB 4369E96A 346ED9FC AD678846 DA60B8D0 44042D73 33031DE5 AA0A4C5F DD0D7CC9 5005713C 270241AA BE0B1010 C90C2086 5768B525 206F85B3 B966D409 CE61E49F 5EDEF90E 29D9C998 B0D09822 C7D7A8B4 59B33D17 2EB40D81 B7BD5C3B C0BA6CAD EDB88320 9ABFB3B6 03B6E20C 74B1D29A EAD54739 9DD277AF 04DB2615 73DC1683 E3630B12 94643B84 0D6D6A3E 7A6A5AA8 E40ECF0B 9309FF9D 0A00AE27 7D079EB1 F00F9344 8708A3D2 1E01F268 6906C2FE F762575D 806567CB 196C3671 6E6B06E7 FED41B76 89D32BE0 10DA7A5A 67DD4ACC F9B9DF6F 8EBEEFF9 17B7BE43 60B08ED5 D6D6A3E8 A1D1937E 38D8C2C4 4FDFF252 D1BB67F1 A6BC5767 3FB506DD 48B2364B D80D2BDA AF0A1B4C 36034AF6 41047A60 DF60EFC3 A867DF55 316E8EEF 4669BE79 CB61B38C BC66831A 256FD2A0 5268E236 CC0C7795 BB0B4703 220216B9 5505262F C5BA3BBE B2BD0B28 2BB45A92 5CB36A04 C2D7FFA7 B5D0CF31 2CD99E8B 5BDEAE1D 9B64C2B0 EC63F226 756AA39C 026D930A 9C0906A9 EB0E363F 72076785 05005713 95BF4A82 E2B87A14 7BB12BAE 0CB61B38 92D28E9B E5D5BE0D 7CDCEFB7 0BDBDF21 86D3D2D4 F1D4E242 68DDB3F8 1FDA836E 81BE16CD F6B9265B 6FB077E1 18B74777 88085AE6 FF0F6A70 66063BCA 11010B5C 8F659EFF F862AE69 616BFFD3 166CCF45 A00AE278 D70DD2EE 4E048354 3903B3C2 A7672661 D06016F7 4969474D 3E6E77DB AED16A4A D9D65ADC 40DF0B66 37D83BF0 A9BCAE53 DEBB9EC5 47B2CF7F 30B5FFE9 BDBDF21C CABAC28A 53B39330 24B4A3A6 BAD03605 CDD70693 54DE5729 23D967BF B3667A2E C4614AB8 5D681B02 2A6F2B94 B40BBE37 C30C8EA1 5A05DF1B 2D02EF8D';
	
	for(; i < length; i++ ){
		crc = ( crc >>> 8 ) ^ ('0x' + map.substr( (( crc ^ str.charCodeAt( i ) ) & 0xFF) * 9, 8 ));
	}
	
	crc = crc ^ ( -1 );
	return ( crc < 0 ? crc += 4294967296 : crc ).toString().split( '' ).map(function( v ){ return v.charCodeAt( 0 ) })
};

exports.HashRing = hashRing;