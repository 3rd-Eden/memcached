var sys = require( 'sys' ),
	HashRing = require( '../lib/hashring' ).HashRing;
	
var Ring = new HashRing(
		[ '192.168.0.102:11212', '192.168.0.103:11212', '192.168.0.104:11212' ],
		
		// Weights are optional, but can be usefull if you have memcached server that can use allot of memory
		{
			'192.168.0.102:11212': 1,
			'192.168.0.103:11212': 2,
			'192.168.0.104:11212': 1
		}
	);

// Return the server based on the key
sys.puts( Ring.getNode( "my-super-secret-cache-key" ) );
sys.puts( Ring.getNode( "hello-world" ) );
sys.puts( Ring.getNode( "my-super-secret-cache-key" ) );

// Different algorithms produce different hash maps. So choose wisely 
var sha1Ring  = new HashRing(
		[ '192.168.0.102:11212', '192.168.0.103:11212', '192.168.0.104:11212' ],
		
		// Weights are optional, but can be usefull if you have memcached server that can use allot of memory
		{
			'192.168.0.102:11212': 1,
			'192.168.0.103:11212': 2,
			'192.168.0.104:11212': 1
		}, 
		
		'sha1' // optional algorithm for key hashing
	);
	
sys.puts( sha1Ring.getNode( "my-super-secret-cache-key" ) );
sys.puts( sha1Ring.getNode( "hello-world" ) );
sys.puts( sha1Ring.getNode( "my-super-secret-cache-key" ) );