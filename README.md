#nMemcached

nMemcached is a fully featured Memcached client for node.js. nMemcached is build with scaling, high availablity and exceptional performance in mind. We use consistent hashing to store the data across different nodes. Consistent hashing is a scheme that provides a hash table functionality in a way that adding or removing a server node does not significantly change the mapping of the keys to server nodes. The algorithm that is used for consistent hashing is the same as libketama.

There are different ways to handle errors for example, when a server becomes unavailable you can configure the client to see all requests to that server as cache misses untill it goes up again. It's also possible to automatically remove the affected server from the consistent hashing algorithm or provide nMemcached with a failover server that can take the place of the unresponsive server.

When these issues occure the nMemcached client will emit different events where you can subscribe to containing detailed information about the issues.

The client is configurable on different levels. There's a global configuration that you update so all you Memcached clusters will use the same failure configuration for example, but it's also possible to overwrite these changes per nMemcached instance.

## Setting up the client

The constructor of the nMemcached client is designed to work with different formats. These formats are all internally parsed to the correct format so our consistent hashing scheme can work with it. You can either use:

1.	**String**, this only works if you have are running a single server instance of Memcached.
	It's as easy a suppling a string in the following format: `hostname:port`. For example
	`192.168.0.102:11212` This would tell the client to connect to host `192.168.0.102` on
	port number `11212`.

2.	**Array**, if you are running a single server you would only have to supply one item in the array.
	The array format is particually usefull if you are running a cluster of Memcached servers. This will
	allow you to spread the keys and load between the different servers. Giving you higher availablity for
	when one of your Memcached servers goes down.

3	**Object**, when you are running a cluster of Memcached servers it could happen to not all server can
	allocate the same amount of memory. You might have a Memcached server with 128mb, 512, 128mb. If you would
	the array structure all servers would have the same weight in the consistent hashing scheme. Spreading the
	keys 33/33/33 over the servers. But as server 2 has more memory available you might want to give it more weight
	so more keys get stored on that server. When you are using a object, the `key` should represent the server
	location and the value the weight of the server. By default all servers have a weight of 1. 
	`{ '192.168.0.102:11212': 1, '192.168.0.103:11212': 2, '192.168.0.104:11212': 1 }` would generate a 25/50/25 
	distirbution of the keys.