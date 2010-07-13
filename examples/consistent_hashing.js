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