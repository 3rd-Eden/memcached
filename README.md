# Memcached 
[![Build Status](https://secure.travis-ci.org/3rd-Eden/memcached.svg?branch=master)](http://travis-ci.org/3rd-Eden/memcached)
[![NPM Download](https://img.shields.io/npm/dw/memcached.svg)](https://www.npmjs.com/package/memcached)
![Node version support](https://img.shields.io/node/v/passport.svg)
[![NPM Version](https://img.shields.io/npm/v/memcached.svg)](https://www.npmjs.com/package/memcached)
[![NPM License](https://img.shields.io/npm/l/memcached.svg)](https://www.npmjs.com/package/memcached)
---

`memcached` is a fully featured Memcached client for Node.js. `memcached` is
built with scaling, high availability and exceptional performance in mind. We
use consistent hashing to store the data across different nodes. Consistent
hashing is a scheme that provides a hash table functionality in a way that
adding or removing a server node does not significantly change the mapping of
the keys to server nodes. The algorithm that is used for consistent hashing is
the same as `libketama`.

There are different ways to handle errors for example, when a server becomes
unavailable you can configure the client to see all requests to that server as
cache misses until it goes up again. It's also possible to automatically remove
the affected server from the consistent hashing algorithm or provide `memcached`
with a failover server that can take the place of the unresponsive server.

When these issues occur the `memcached` client will emit different events where
you can subscribe to containing detailed information about the issues.

The client is configurable on different levels. There's a global configuration
that you update so all your Memcached clusters will use the same failure
configuration for example, but it's also possible to overwrite these changes per
`memcached` instance.

### protocol

As in other databases and message queues, this module uses the ASCII protocol to communicate with
the server, which means that you can see what is send over the wire. For debugging this is easier
for both the users and the developers however this also means that SASL auth is not supported
because it demands the binary protocol.

## Installation

```
npm install memcached
```

## Setting up the client

The constructor of the `memcached` client take 2 different arguments `server
locations` and `options`. Syntax:

``` js
var Memcached = require('memcached');
var memcached = new Memcached(Server locations, options);
```

### Server locations

The server locations is designed to work with different formats. These formats
are all internally parsed to the correct format so our consistent hashing scheme
can work with it. You can either use:

1. **String**, this only works if you are running a single server instance
   of Memcached.  It's as easy a suppling a string in the following format:
   `hostname:port`. For example `192.168.0.102:11211` This would tell the client
   to connect to host `192.168.0.102` on port number `11211`.

2. **Array**, if you are running a single server you would only have to supply
  one item in the array.  The array format is particularly useful if you are
  running a cluster of Memcached servers. This will allow you to spread the keys
  and load between the different servers. Giving you higher availability
  when one of your Memcached servers goes down.

3. **Object**, when running a cluster of Memcached servers, some servers may allocate different amounts of memory, e.g. 128, 512, and 128mb. While by default all servers are equally important and dispatch consistently the keys between the servers (33/33/33%), it is possible to send more keys in servers having more memory. To do so, define an object whose `key` represents the server location and whose value represents a server weight, the default weight for a server being 1; so, for instance `{ '192.168.0.102:11211': 1, '192.168.0.103:11211': 2, '192.168.0.104:11211': 1 }` distributes 50% of the keys on server 103, but only 25% on 104 and 25% on 102.

To implement one of the above formats, your constructor would look like this:

```js
var memcached = new Memcached({ '192.168.0.102:11211': 1, '192.168.0.103:11211': 2, '192.168.0.104:11211': 1 });
var memcached = new Memcached([ '192.168.0.102:11211', '192.168.0.103:11211', '192.168.0.104:11211' ]);
var memcached = new Memcached('192.168.0.102:11211');
```

### Options

Memcached accepts two option schemes. The first one inherits of all Memcached server instances
while the second one is client specific and overwrites the globals. To define these options,
Memcached server uses the same properties:

* `maxKeySize`: *250*, the maximum key size allowed.
* `maxExpiration`: *2592000*, the maximum expiration time of keys (in seconds).
* `maxValue`: *1048576*, the maximum size of a value.
* `poolSize`: *10*, the maximum size of the connection pool.
* `algorithm`: *md5*, the hashing algorithm used to generate the `hashRing` values.
* `reconnect`: *18000000*, the time between reconnection attempts (in milliseconds).
* `timeout`: *5000*, the time after which Memcached sends a connection timeout (in milliseconds).
* `retries`: *5*, the number of socket allocation retries per request.
* `failures`: *5*, the number of failed-attempts to a server before it is regarded as 'dead'.
* `retry`: *30000*, the time between a server failure and an attempt to set it up back in service.
* `remove`: *false*, if *true*, authorizes the automatic removal of dead servers from the pool.
* `failOverServers`: *undefined*, an array of `server_locations` to replace servers that fail and
 that are removed from the consistent hashing scheme.
* `keyCompression`: *true*, whether to use `md5` as hashing scheme when keys exceed `maxKeySize`.
* `idle`: *5000*, the idle timeout for the connections.

Example usage:

```js
var memcached = new Memcached('localhost:11211', {retries:10,retry:10000,remove:true,failOverServers:['192.168.0.103:11211']});
```

If you wish to configure the options globally:

```js
var Memcached = require('memcached');
// all global configurations should be applied to the .config object of the Client.
Memcached.config.poolSize = 25;
```

## API

### Public methods

**memcached.touch** Touches the given key.

* `key`: **String** The key
* `lifetime`: **Number** After how long should the key expire measured in `seconds`

```js
await memcached.touch('key', 10)
```

**memcached.get** Get the value for the given key.

* `key`: **String**, the key

```js
const value = await memcached.get('key')
```

**memcached.gets** Get the value and the CAS id.

* `key`: **String**, the key

```js
const { cas, foo } = await memcached.gets('foo')
```
**memcached.getMulti** Retrieves a bunch of values from multiple keys.

* `keys`: **Array**, all the keys that needs to be fetched

```js
const { bar, foo } = await memcached.getMulti(['foo', 'bar'])
```

**memcached.set** Stores a new value in Memcached.

* `key`: **String** the name of the key
* `value`: **Mixed** Either a buffer, JSON, number or string that you want to store.
* `lifetime`: **Number**, how long the data needs to be stored measured in `seconds`

```js
await memcached.set('foo', 'bar', 10)
```

**memcached.replace** Replaces the value in memcached.

* `key`: **String** the name of the key
* `value`: **Mixed** Either a buffer, JSON, number or string that you want to store.
* `lifetime`: **Number**, how long the data needs to be replaced measured in `seconds`

```js
await memcached.replace('foo', 'bar', 10)
```

**memcached.add** Add the value, only if it's not in memcached already.

* `key`: **String** the name of the key
* `value`: **Mixed** Either a buffer, JSON, number or string that you want to store.
* `lifetime`: **Number**, how long the data needs to be replaced measured in `seconds`

```js
await memcached.add('foo', 'bar', 10)
```

**memcached.cas** Add the value, only if it matches the given CAS value.

* `key`: **String** the name of the key
* `value`: **Mixed** Either a buffer, JSON, number or string that you want to store.
* `lifetime`: **Number**, how long the data needs to be replaced measured in `seconds`
* `cas`: **String** the CAS value

```js
const { cas } = await memcached.gets('foo')
await memcached.cas('foo', 'bar', cas, 10)
```

**memcached.append** Add the given value string to the value of an existing item.

* `key`: **String** the name of the key
* `value`: **Mixed** Either a buffer, JSON, number or string that you want to store.

```js
await memcached.append('foo', 'bar');
```

**memcached.prepend** Add the given value string to the value of an existing item.

* `key`: **String** the name of the key
* `value`: **Mixed** Either a buffer, JSON, number or string that you want to store.

```js
await memcached.prepend('foo', 'bar');
```

**memcached.incr** Increment a given key.

* `key`: **String** the name of the key
* `amount`: **Number** The increment

```js
await memcached.incr('foo', 10);
```

**memcached.decr** Decrement a given key.

* `key`: **String** the name of the key
* `amount`: **Number** The increment

```js
await memcached.decr('foo', 10);
```

**memcached.del** Remove the key from memcached.

* `key`: **String** the name of the key

```js
await memcached.del('foo');
```

**memcached.version** Retrieves the version number of your server.

```js
const version = await memcached.version()
```

**memcached.flush** Flushes the memcached server.

```js
await memcached.flush()
```

**memcached.stats** Retrieves stats from your memcached server.

```js
const stats = await memcached.stats()
```

**memcached.settings** Retrieves your `stats settings`.

```js
const settings = await memcached.settings()
```

**memcached.slabs** Retrieves `stats slabs` information.

```js
const slabs = await memcached.slabs()
```

**memcached.items** Retrieves `stats items` information.

```js
const items = await memcached.items()
```

**memcached.cachedump** Inspect cache, see examples for a detailed explanation.

* `server`
* `slabid`
* `number`

```js
const cache = await memcached.cachedump('serverid', 0, 0)
```

**memcached.end** Closes all active memcached connections.

```js
memcached.end()
```

## Events

When connection issues occur we send out different notifications using the
`EventEmitter` protocol. This can be useful for logging, notification and
debugging purposes. Each event will receive details Object containing detailed
information about the issues that occurred.

### Details Object

The details Object contains the various of error messages that caused, the
following 3 will always be present in all error events:

* `server`: the server where the issue occurred on
* `tokens`: a array of the parsed server string in `[port, hostname]` format.
* `messages`: a array containing all error messages that this server received.
  As messages are added to the array using .push(), the first issue will at the
  beginning and the latest error at the end of the array.

The following properties depend on the type of event that is send. If we are
still in our retry phase the details will also contain:

* `failures`: the amount of failures left before we mark the server as dead.
* `totalFailures`: the total amount of failures that occurred on this server, as when the
  server has been reconnected after it's dead the `failures` will be rest to
  defaults and messages will be removed.

If the server is dead these details will be added:

* `totalReconnectsAttempted`: the total reconnects we have attempted. This is
the success and failure combined.
* `totalReconnectsSuccess`: the total successful reconnects we have made.
* `totalReconnectsFailed`: the total failed reconnects we have made.
* `totalDownTime`: the total down time that was generated. Formula: (
  totalReconnectsFailed * reconnect_timeout ) + ( totalRetries * retry_timeout).

### Events

There are `5` different events that the `memcached` client emits when connection
issues occur.

* `issue`: a issue occurred on one a server, we are going to attempt a retry next.
* `failure`: a server has been marked as failure or dead.
* `reconnecting`: we are going to attempt to reconnect the to the failed server.
* `reconnect`: successfully reconnected to the memcached server.
* `remove`: removing the server from our consistent hashing.

Example implementations:

```js
var memcached = new Memcached([ '192.168.0.102:11211', '192.168.0.103:11211' ]);
memcached.on('failure', function( details ){ sys.error( "Server " + details.server + "went down due to: " + details.messages.join( '' ) ) });
memcached.on('reconnecting', function( details ){ sys.debug( "Total downtime caused by server " + details.server + " :" + details.totalDownTime + "ms")});
```

# Compatibility
For compatibility with other [libmemcached](http://libmemcached.org/Clients.html) clients they need to have the behavior
`ketama_weighted` set to true and the `hash` set to the same as `node-memcached`'s
`algorithm`.

Due to client dependent type flags it is unlikely that any types other than `string` will work.

# Test
You may encounter several problems when run the test if you didn't start up `memcached` service. There are two ways for you to start.

## Manually
1. Make sure you have installed memcached service. (If in Mac env, you can install it via homebrew, and `brew install memcached`)
2. Start memcached service. `memcached -p 11211 -d && memcached -p 11212 -d &&  memcached -p 11213 -d`

## Docker
1. Install `docker CE`. [https://docs.docker.com/install/](https://docs.docker.com/install/)
2. `npm run docker`

After starting up `memcached` services. Simply run `npm test`.

# Contributors

This project wouldn't be possible without the hard work of our amazing
contributors. See the contributors tab in Github for an up to date list of
[contributors](https://github.com/3rd-Eden/memcached/graphs/contributors).

Thanks for all your hard work on this project!

# License

The driver is released under the MIT license. See the
[LICENSE](/3rd-Eden/node-memcached/blob/master/LICENSE) for more information.
