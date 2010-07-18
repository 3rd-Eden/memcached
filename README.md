#nMemcached

nMemcached is a fully featured Memcached client for node.js. nMemcached is build with scaling, high availability and exceptional performance in mind. We use consistent hashing to store the data across different nodes. Consistent hashing is a scheme that provides a hash table functionality in a way that adding or removing a server node does not significantly change the mapping of the keys to server nodes. The algorithm that is used for consistent hashing is the same as libketama.

There are different ways to handle errors for example, when a server becomes unavailable you can configure the client to see all requests to that server as cache misses until it goes up again. It's also possible to automatically remove the affected server from the consistent hashing algorithm or provide nMemcached with a failover server that can take the place of the unresponsive server.

When these issues occur the nMemcached client will emit different events where you can subscribe to containing detailed information about the issues.

The client is configurable on different levels. There's a global configuration that you update so all you Memcached clusters will use the same failure configuration for example, but it's also possible to overwrite these changes per nMemcached instance.

## Setting up the client

The constructor of the nMemcached client take 2 different arguments `server locations` and `options`.

### Server locations
The server locations is designed to work with different formats. These formats are all internally parsed to the correct format so our consistent hashing scheme can work with it. You can either use:

1.	**String**, this only works if you have are running a single server instance of Memcached.
	It's as easy a suppling a string in the following format: `hostname:port`. For example
	`192.168.0.102:11212` This would tell the client to connect to host `192.168.0.102` on
	port number `11212`.

2.	**Array**, if you are running a single server you would only have to supply one item in the array.
	The array format is particularly useful if you are running a cluster of Memcached servers. This will
	allow you to spread the keys and load between the different servers. Giving you higher availability for
	when one of your Memcached servers goes down.
	
3.	**Object**, when you are running a cluster of Memcached servers it could happen to not all server can
	allocate the same amount of memory. You might have a Memcached server with 128mb, 512, 128mb. If you would
	the array structure all servers would have the same weight in the consistent hashing scheme. Spreading the
	keys 33/33/33 over the servers. But as server 2 has more memory available you might want to give it more weight
	so more keys get stored on that server. When you are using a object, the `key` should represent the server
	location and the value the weight of the server. By default all servers have a weight of 1. 
	`{ '192.168.0.102:11212': 1, '192.168.0.103:11212': 2, '192.168.0.104:11212': 1 }` would generate a 25/50/25 
	distribution of the keys.

If you would implement one of the above formats, your constructor would something like this:

	var memcache = new nMemcached({ '192.168.0.102:11212': 1, '192.168.0.103:11212': 2, '192.168.0.104:11212': 1 });
	var memcache = new nMemcached([ '192.168.0.102:11212', '192.168.0.103:11212', '192.168.0.104:11212' ]);
	var memcache = new nMemcached('192.168.0.102:11212');

### Options

There 2 kinds of options that can be configured. A global configuration that will be inherited by all Memcached servers instances and a client specific configuration that can be used to overwrite the globals. The options should be formatted in an JavaScript `object`. They both use the same object structure:

* `max_key_size`: *250*, the max size of they key allowed by the Memcached server.
* `max_expiration`: *2592000*, the max expiration of keys by the Memcached server in milliseconds.
* `max_value`: *1048576*, the max size of a value that is allowed by the Memcached server.
* `pool_size`: *10*, the maximum connections we can allocate in our connection pool.
* `reconnect`: *18000000*, when the server is marked as dead we will attempt to reconnect every x milliseconds.
* `retrys`: *5*, amount of tries before we mark the server as dead.
* `retry`: *30000*, timeout between each retry in x milliseconds
* `remove`: *false*, when the server is marked as dead you can remove it from the pool so all other will receive the keys instead.
* `failOverServers`: *undefined*, the ability use these servers as failover when the dead server get's removed from the consistent hashing scheme. This must be an array of servers confirm the server_locations specification.
* `compression_threshold`: *10240*, minimum length of value before we start using compression for the value.
* `key_compression`: *true*, compress keys using md5 if they exceed the max_key_size option.

Example usage:

	var memcache = new nMemcached('localhost:11212', {retrys:10,retry:10000,remove:true,failOverServers:['192.168.0.103:11212']});
