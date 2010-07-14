# nMemcached

nMemcached is a fully featured Memcached client for node.js. nMemcached implements consistent hashing to store the data across server nodes. Consistent hashing is a scheme that provides a hash table functionality in a way that adding or removing of node slot does not significantly change the mapping of the keys to nodes. You can use nMemcached if you have single or a cluster of Memcached servers.

## nMemcached vs ..

### Single server interfaces

There are Memcached clients available for node.js that only provide you with a single server interface. This might be great if you only have one Memcached server, but what if your project becomes successful and you need *more* Memcached servers to function in a fast and responsive manner. Than you are usually f*ck'd, you would need to find a new Memcached client and change countless lines of code because the API's aren't consistent between libraries. nMemcached does not suffer from this limitation, the client is constructed with scaling in mind, it sees no difference between a single or clustered Memcached server. The only change required would be updating the constructor of nMemcached with the new servers:

	// Arrays, Strings or Objects it doesn't matter we all parse it down internally to the format we need
	var memcache = new nMemcached('192.168.0.102:11212');
	var memcache = new nMemcached([ '192.168.0.102:11212' ]);
	var memcache = new nMemcached({ '192.168.0.102:11212': 1 });

Would become:

	var memcache = new nMemcached([ '192.168.0.102:11212', '192.168.0.103:11212', '192.168.0.104:11212' ]);
	var memcache = new memcached({ '192.168.0.102:11212': 1, '192.168.0.103:11212': 2, '192.168.0.104:11212': 1 });
	

### Basic commands only

Most Memcached clients only support the most basic commands of the Memcached server. These are primary GET/SET/ADD INCR/DECR and REPLACE/DELETE. But there are much more commands available for Memcached our goal is provide support for them all. Including the multi GET/SET.

## Project status

"Work in progress" is probably the best to describe the current state of the project. Feel free to contribute for / watch and comment on the changes.