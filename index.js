'use strict';

/**
 * Custom modules.
 */
var Parser = require('memcached-stream').Parser
  , ConnectionPool = require('jackpot')
  , HashRing = require('hashring')
  , Failover = require('failover');

/**
 * Node's native modules.
 */
var EventEmitter = require('eventemitter')
  , net = require('net');

function Memcached(servers, opts) {
  servers = Memcached.parse(servers);
  opts = opts || {};

  this.algorithm = 'crc32';                       // Default algorithm
  this.size = 20;                                 // Connections per server
  this.timeout = 0;                               // Inactivity timeout
  this.debug = false;                             // Emit extra debug information

  this.strict = false;                            // Strict Mode, validate everything
  this.maxKeySize = 251;                          // Maximum length of a key
  this.maxExpiration = 2592000;                   // Maximum expiration duration
  this.maxValue = 1048576;                        // Maximum bytelength of a value

  Object.keys(opts).forEach(function setup(key) {
    this[key] = opts[key];
  }, this);

  this.ring = opts.ring || new HashRing(
      servers.weights || servers.servers          // Default to weighted servers
    , this.algorithm                              // Algorithm used for hasing
    , opts.hashring || {}                         // Control the hashring
  );

  this.failover = new Failover(
      (opts.failover || []).map(Memcached.address)
    , opts.failover || {}
  );

  // Private properties that should never be overwritten by options.
  this.servers = servers.servers;
  this.pool = Object.create(null);
}

Memcached.prototype.__proto__ = EventEmitter.prototype;

/**
 * Configure the Memcached Client. Start preparing for failover
 */
Memcached.prototype.configure = function configure() {
  var self = this;

  //
  // A Memcached server has become unresponsive and we had to failover to
  // different server.
  //
  this.failover.on('failover', function failover(from, to) {
    self.hashring.replace(from.string, to.string);
  });

  //
  // A Memcached server has been unresponsive, but we don't have any failover
  // servers left or in place. Mark it as dead and remove it from the pool
  this.failover.on('death', function death(server) {
    var jackpot = self.pool[server.string];

    // Shut down the connection pool so all connections are released from
    // memory.
    if (jackpot) jackpot.end();

    // Remove the server from the HashRing, as the server seems to have died
    // off.
    self.hashring.remove(server.string);
  });
};

/**
 * Select a server from the pool.
 *
 * @param {String} address
 * @param {Function} callback
 * @api private
 */
Memcached.prototype.select = function select(address, callback) {
  var pool = this.pool[address]
    , self = this;

  // We are using an Jackpot#pull operation here so we can retry getting an
  // connection as it could callback with an error when the connection pool is
  // full, so we basically want to retry it a bit later.
  if (pool) {
    pool.pull(callback);
    return this;
  }

  pool = new ConnectionPool(this.size, function factory() {
    var parser = new Parser()
      , connection = net.connect()
      , queue = []
      , undefined;

    // Received a new response from the parser.
    parser.on('response', function response(command, arg1) {
      var type = typeof arg1;

      // All responses that do not need to be queued have a Boolean as first
      // argument that indicates if the action was succesfull or not.
      if (type === 'boolean') {
        return connection.callback.pop()(undefined, arg1);
      } else if (type === 'number') {
        // If we have a pure number response, it was a INCR/DECR response.
        return connection.callback.pop()(undefined, arg1);
      }
    });

    // Received a new error response from the server, maybe the server broke
    // down or the client messed up..
    parser.on('error:response', function response(err) {
      connection.callbacks.pop()(err);
    });

    // The parser received a response from the server that is unknown to him, so
    // this means we parse the data further. We need to destroy this connection
    // and mark all callbacks as error'd out. One of the reasons of this Error
    // is that the `memcached-stream` parser parsed something incorrectly and
    // did not remove all data from it's internal queue.
    parser.on('error', function error(err) {
      pool.remove(connection);
      connection.callbacks.forEach(function forEach(callback) {
        callback(err);
      });

      // Clear the callback so they cannot be called again.
      connection.callbacks.length = 0;
    });

    // Configure the stream.
    connection.setEncoding('utf-8');        // Required for the parser
    connection.setTimeout(self.timeout);    // To keep the connections low
    connection.setNoDelay(true);            // No Nagel algorithm

    // Add addition properties to the connection for callback handling etc.
    connection.callbacks = [];
    connection.parser = parser;

    // @TODO figure out how we are going to handle the connection pool here, we
    // don't really want.
    self.failover.connect(connection).pipe(parser);
    return connection;
  });

  pool.on('error', function error(err) {
    // The pool got an error.. o dear.
    // @TODO handle this? Or just assume that it will be handled by connection
    // pool as it will remove the connection and generate a new one.
    if (self.debug) {
      self.emit('error:connection', 'Connection failed and emitted an error.', err);
    }
  });

  // Allocate a new connection from the pool.
  pool.pull(callback);
  this.pool[address] = pool;

  return this;
};

/**
 * Shut down the memcached client.
 *
 * @api public
 */
Memcached.prototype.end = function end() {
  this.hashring.end();
  this.failover.end();

  Object.keys(this.pool).forEach(function shutdown(address) {
    var jackpot = this.pool[address];

    // @TODO we might need to iterate over the internal connections of our pool
    // and trigger every callback (if this is not done automatically)
    jackpot.forEach(function forEach(connection) {
      // @TODO maybe destroy the parser when the connection ends?
      // if ('parser' in connection) connection.parser.end();
    });

    jackpot.end();
  }, this);
};

/**
 * Parse the server argument to a uniform format.
 *
 * @param {Mixed} servers
 * @returns {Object}
 * @api private
 */
Memcached.parse = function parse(servers) {
  if (arguments.length > 1) return {
      servers: Array.prototype.slice.call(arguments, 0).map(Memcached.address)
  };

  if (Array.isArray(servers)) return {
      servers: servers.map(Memcached.address)
  };

  if ('object' === typeof servers) return {
      weights: servers
    , servers: Object.keys(servers).map(Memcached.address)
  };

  return {
      servers: [servers].map(Memcached.address)
  };
};

/**
 * Transforms the server in to an Object containing the port number and the
 * hostname.
 *
 * @param {Mixed} server
 * @returns {Object}
 * @api private
 */
Memcached.address = function address(server) {
  if ('string' !== typeof server) {
    server.string = server.host +':'+ server.port;
    return server;
  }

  var pattern = server.split(':');

  return {
      host: pattern[0]
    , port: +pattern[1]
    , string: pattern
  };
};

//
// Expose the module.
//
module.exports = Memcached;
