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
      servers.weights || servers.regular          // Default to weighted servers
    , this.algorithm                              // Algorithm used for hasing
    , opts.hashring || {}                         // Control the hashring
  );

  var failovers = Memcached.parse(opts.failover || []).servers;
  this.failover = new Failover(
      failovers
    , opts.failover || {}
  );

  // Private properties that should never be overwritten by options.
  this.servers = servers.servers;
  this.length = this.servers.length;

  this.addresses = Object.create(null);
  this.pool = Object.create(null);

  // Fill up our addresses hash
  this.servers.concat(failovers).forEach(function servers(server) {
    this.addresses[server.string] = server;
  }, this);
}

Memcached.prototype.__proto__ = EventEmitter.prototype;

/**
 * Configure the Memcached Client. Start preparing for failover
 *
 * @api private
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

  pool = new ConnectionPool(this.size, this.factory.bind(this, address));

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

Memcached.prototype.factory = function factory(address) {
  var parser = new Parser()
    , connection = net.connect() // @TODO actually connect
    , queue = {}
    , undefined
    , self = this;

  parser.flag(2, function parse(value) {
    return JSON.parse(value);
  });

  parser.flag(4, function parse(value, binary) {
    return binary;
  });

  parser.flag(8, function parse(value) {
    return +value;
  });

  // Received a new response from the parser.
  parser.on('response', function response(command, arg1, arg2) {
    var type = typeof arg1;

    // The response is an indication that we need to flush our queued data and
    // send it to our callback.
    if ('END' === command && queue.length) {
      connection.callbacks.pop()(undefined, queue);
      queue = {};
    }

    // All responses that do not need to be queued have a Boolean as first
    // argument that indicates if the action was succesfull or not.
    if ('boolean' === type) {
      return connection.callbacks.pop()(undefined, arg1);
    } else if ('number' === type) {
      // If we have a pure number response, it was a INCR/DECR response.
      return connection.callbacks.pop()(undefined, arg1);
    } else if (arguments.length === 3) {
      return connection.callbacks.pop()(undefined, arg1, arg2);
    }

    // The data needs to be queued, we are dealing with a possible multiple
    // responses like multiple VALUE or STAT's this data needs to be queued
    // until we get the END response
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
    self.pool[address].remove(connection);

    connection.callbacks.forEach(function forEach(callback) {
      callback(err);
    });

    // Clear the callback so they cannot be called again.
    connection.callbacks.length = 0;
  });

  // Configure the stream.
  connection.setEncoding('utf-8');        // Required for the parser
  connection.setTimeout(this.timeout);    // To keep the connections low
  connection.setNoDelay(true);            // No Nagel algorithm

  // Add addition properties to the connection for callback handling etc.
  connection.callbacks = [];
  connection.parser = parser;

  // @TODO figure out how we are going to handle the connection pool here, we
  // don't really want to handle it our selfs...
  this.failover.connect(connection).pipe(parser);
  return connection;
};

/**
 * Write a response to the memcached server.
 *
 * @param {String} hash either key or custom hash to fetch from hashring
 * @param {String} command command string for the server
 * @param {String|undefined} data optional data fragment
 * @param {Function} callback optional callback
 */
Memcached.prototype.send = function send(hash, command, data, callback) {
  var server;

  // The fastest and most common case, we only have one single server by
  // checking the internal length server saves even more performance.
  if (this.length === 1) server = this.servers[0];
  else server = this.addresses[server] = this.hashring.get(hash);

  this.select(server, function selected(err, connection) {
    if (err) return callback && callback(err);

    // Complete the command string, if we don't have a callback we assume that
    // the user wanted to do a fire and forget. To make this faster, we are just
    // gonna append noreply to the command so we don't receive a server
    // response. Please note that this can cause errors..
    if (!callback) command += ' noreply';
    command += '\r\n';

    // Add the data frame if we need to
    if (data) command += data + '\r\n';

    if (callback) connection.callbacks(callback);
    connection.write(command);
  });
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
 * @param {Mixed} args
 * @returns {Object}
 * @api private
 */
Memcached.parse = function parse(args) {
  var servers;

  if (arguments.length > 1) {
    servers = Array.prototype.slice.call(arguments, 0).map(Memcached.address);
  } else if (Array.isArray(args)) {
    servers = args.map(Memcached.address);
  } else if('object' === typeof args) {
    servers = Object.keys(args).map(Memcached.address);
  } else {
    servers = [args].map(Memcached.address);
  }

  return {
      servers: servers
    , weights: 'object' === typeof args ? args : null
    , regular: servers.map(function regular(server) {
        return server.string;
      })
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

/**
 * Simple templating engine that we use to generate different function bodies.
 *
 * @param {String} str template
 * @param {Object} data optional data
 * @returns {Mixed} function if you don't supply it with data
 */
Memcached.compile = function compile(str, data) {
  var compiler = new Function('locals',
      'var p = []; function print(){ p.push.apply(p, arguments); };'
    + 'with (locals) {'
    + 'p.push(\''
    + str
        .replace(/[\r\t\n]/g, " ")
        .split("<%").join("\t")
        .replace(/((^|%>)[^\t]*)'/g, "$1\r")
        .replace(/\t=(.*?)%>/g, "',$1,'")
        .split("\t").join("');")
        .split("%>").join("p.push('")
        .split("\r").join("\\'")
    + '\');}'
    + 'return p.join("")'
  );

  return data ? compiler(data) : compiler;
};

//
// Expose the module.
//
module.exports = Memcached;
