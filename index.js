'use strict';

var Parser = require('memcached-stream').Parser
  , parse = require('connection-parse');
  , ConnectionPool = require('jackpot')
  , HashRing = require('hashring')
  , Failover = require('failover')

var EventEmitter = require('events').EventEmitter
  , net = require('net');

/**
 * A Memcached-client.
 *
 * @constructor
 * @param {Mixed} servers A list of memcached servers.
 * @param {Object} opts Configuration.
 * @api public
 */
function Memcached(servers, opts) {
  servers = parse(servers);
  opts = opts || {};

  this.algorithm = 'md5';                         // Default algorithm.
  this.size = 20;                                 // Connections per server.
  this.timeout = 0;                               // Inactivity timeout.
  this.debug = false;                             // Emit extra debug information.

  this.strict = false;                            // Strict Mode, validate everything.
  this.maxKeySize = 251;                          // Maximum length of a key.
  this.maxExpiration = 2592000;                   // Maximum expiration duration.
  this.maxValue = 1048576;                        // Maximum byte length of a value.

  Object.keys(opts).forEach(function setup(key) {
    this[key] = opts[key];
  }, this);

  this.ring = opts.ring || new HashRing(
      servers.weights || servers.regular          // Default to weighted servers.
    , this.algorithm                              // Algorithm used for hashing.
    , opts.hashring || {}                         // Control the hashring.
  );

  var failovers = parse(opts.failover || []).servers;
  this.failover = new Failover(
      failovers
    , opts.failover || {}
  );

  // Private properties that should never be overwritten by options.
  this.servers = servers.servers;
  this.length = this.servers.length;

  this.addresses = Object.create(null);
  this.pool = Object.create(null);

  // Fill up our addresses hash.
  this.servers.concat(failovers).forEach(function servers(server) {
    this.addresses[server.string] = server;
  }, this);
}

Memcached.prototype.__proto__ = EventEmitter.prototype;

/**
 * Simple template engine that we use to generate different function bodies.
 *
 * @param {String} args The arguments for this function template.
 * @param {String} str The actual function template.
 * @param {Object} data Data for the function compiler.
 * @returns {Function} The compiled function.
 * @api private
 */
Memcached.compile = function compile(args, str, data) {
  data = data || {};

  var compiler = new Function('locals',
      'var p = [];'

    // Introduce the data as local variables using with(){}
    + 'with (locals) { p.push("'

    // Convert the template into pure JavaScript
    + str
        .replace(/[\r\t\n]/g, ' ')
        .split('<%').join('\t')
        .replace(/((^|%>)[^\t]*)"/g, '$1\r')
        .replace(/\t=(.*?)%>/g, '",$1,"')
        .split('\t').join('");')
        .split('%>').join('p.push("')
        .split('\r').join('\\"')
    + '");}return p.join("");'
  );

  return new Function(args, compiler(data));
};

/**
 * Configure the Memcached Client. Start preparing for fail over.
 *
 * @api private
 */
Memcached.prototype.configure = function configure() {
  var self = this;

  //
  // A Memcached server has become unresponsive and we had to fail over to
  // different server.
  //
  this.failover.on('failover', function failover(from, to, connection) {
    self.hashring.replace(from.string, to.string);

    //
    // As a fail over occurred, we need to update our internal pool as we changed
    // our hashring above, so it will point to the new server location. Normally
    // you wouldn't need to change your hashring and update the pool to reflect
    // these changes, but I like to keep my internals clear and know that
    // everything pool `x` actually connect `x`.
    //
    self.pool[to.string] = self.pool[to.string] || [];
    self.pool[from.string].forEach(function each(connection) {
      // Reset the Protocol parser's internals.
      connection.parser.reset();
      self.pool[to.string].push(connection);
    });

    delete self.pool[from.string];
  });

  //
  // A Memcached server has been unresponsive, but we don't have any fail over
  // servers left or in place. Mark it as dead and remove it from the pool
  this.failover.on('death', function death(server) {
    var jackpot = self.pool[server.string];

    // Shut down the connection pool so all connections are released from
    // memory.
    if (jackpot) jackpot.end();

    // Remove the server from the hashring, as the server seems to have died
    // off.
    self.hashring.remove(server.string);
  });

  return this;
};

/**
 * Select a server from the pool.
 *
 * @param {String} address The server address we need a TCP connection for.
 * @param {Function} callback Called when we have a working connection.
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

/**
 * Memcached connection factory. This is called for each connections, we should
 * setup our:
 *
 * - Failover
 * - Parser
 *
 * Before we are active.
 *
 * @api private
 */
Memcached.prototype.factory = function factory(address) {
  var parser = new Parser()
    , connection = address.path
        ? net.connect(address.path)
        : net.connect(address.port, address.host)
    , self = this
    , queue = {}
    , undefined;

  /**
   * Parse JSON flags.
   *
   * @TODO handle parse failures, maybe wrap
   * @api private
   */
  parser.flag(2, function parse(value) {
    return JSON.parse(value);
  });

  /**
   * Parse Binary flags.
   *
   * @api private
   */
  parser.flag(4, function parse(value, binary) {
    return binary;
  });

  /**
   * Parser Number flags.
   *
   * @api private
   */
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
      return queue = {};
    }

    if ('boolean' === type || 'number' === type || 'VERSION' === command) {
      return connection.callbacks.pop()(undefined, arg1);
    }

    // The data needs to be queued, we are dealing with a possible multiple
    // responses like multiple VALUE or STAT's this data needs to be queued
    // until we get the END response.
    if ('VALUE' === command) {

    } else if ('STAT' === command) {

    } else if ('KEY' === command) {

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
    self.pool[address].remove(connection);

    connection.callbacks.forEach(function forEach(callback) {
      callback(err);
    });

    // Clear the callback so they cannot be called again.
    connection.callbacks.length = 0;
  });

  // Configure the stream.
  connection.setEncoding('utf-8');        // Required for the parser to fix utf-8.
  connection.setTimeout(this.timeout);    // To keep the connections low.
  connection.setNoDelay(true);            // No Nagel algorithm.

  // Add addition properties to the connection for callback handling etc.
  connection.callbacks = [];
  connection.parser = parser;

  // @TODO figure out how we are going to handle the connection pool here, we
  // don't really want to handle it our selfs...
  //this.failover.connect(connection).pipe(parser);
  connection.pipe(parser);

  return connection;
};

/**
 * Write a response to the memcached server.
 *
 * @param {String} hash Either key or custom hash to fetch from hashring.
 * @param {String} command Command string for the server.
 * @param {String|undefined} data Optional data fragment.
 * @param {Function} callback Optional callback.
 * @api private
 */
Memcached.prototype.send = function send(hash, command, data, callback, server) {
  if (!server) {
    // The fastest and most common case, we only have one single server by
    // checking the internal length server saves even more performance.
    if (this.length === 1) server = this.servers[0];
    else server = this.addresses[server] = this.hashring.get(hash);
  }

  this.select(server, function selected(err, connection) {
    if (err) return callback && callback(err);

    // Complete the command string, if we don't have a callback we assume that
    // the user wanted to do a fire and forget. To make this faster, we are just
    // gonna append noreply to the command so we don't receive a server
    // response. Please note that this can cause errors to bubble up and they
    // can put the parser in to an unknown state.
    if (!callback) command += ' noreply';
    command += '\r\n';

    // Add the data frame if we need to
    if (data) command += data + '\r\n';

    if (callback) connection.callbacks.unshift(callback);
    connection.write(command);
  });
};

/**
 * Reduces a bunch of keys to a server mapping so we can fetch the keys in
 * parallel from different servers.
 *
 * @param {Array} keys The keys that need to be reduced to server addresses
 * @returns {Object} servers locations
 * @api private
 */
Memcached.prototype.reduce = function reduce(keys) {
  var ring = this.hashring;

  return keys.reduce(function reducer(servers, key) {
    var server = ring.get(key);

    if (!servers[server]) servers[server] = [];
    servers[server].push(key);

    return servers;
  }, {});
};

/* * * * * * * * * * * * * * * * * * § MAGIC § * * * * * * * * * * * * * * * * * */
/* THIS IS WHERE ALL THE MAGIC HAPPENS, IT'S SO MAGICAL THAT I'M GOING TO WRITE  */
/*     ALL OF THIS IN CAPS LOCK. WE ARE GOING TO GENERATE NEW FUNCTIONS USING    */
/*        A FUNCTION TEMPLATE AND BOOM, LESS CODE AND HIGHER PERFORMANCE.        */
/* * * * * * * * * * * * * * * * * * § MAGIC § * * * * * * * * * * * * * * * * * */

[
    'get'
  , 'gets'
  , 'delete'
].forEach(function compiling(command) {
  Memcached.prototype[command] = new Function('key, callback', [
      "var hash = key;"

      // If an object is supplied the user wants to be in control on how
      // a server is selected, for example to load a set of data from the same
      // server to improve performance.
    , "if ('object' === typeof key) {"
    , "  hash = key.hash;"
    , "  key = key.key;"
    , "}"

    , "this.send(hash, '"+ command +" '+key, undefined, callback);"
  ].join(''));
});

[
    'incr'
  , 'decr'
  , 'touch'
].forEach(function compiling(command) {
  Memcached.prototype[command] = new Function('key, value, callback', [
      "var hash = key;"

      // If an object is supplied the user wants to be in control on how
      // a server is selected, for example to load a set of data from the same
      // server to improve performance.
    , "if ('object' === typeof key) {"
    , "  hash = key.hash;"
    , "  key = key.key;"
    , "}"

    , "if ('function' === value) {"
    , "  callback = value;"
    , "  value = 0;"
    , "}"
    , "this.send(hash, '"+ command +" '+ key +' '+ value, undefined, callback);"
  ].join(''));
});

[
    { command: 'set', args: 'key, value, exptime, callback' }
  , { command: 'add', args: 'key, value, exptime, callback' }
  , { command: 'cas', args: 'key, value, exptime, cas, callback' }
  , { command: 'append', args: 'key, value, callback' }
  , { command: 'prepend', args: 'key, value, callback'}
  , { command: 'replace', args: 'key, value, callback' }
].forEach(function compiling(details) {
  Memcached.prototype[details.command] = Memcached.compile(details.args, [
      "var args = Array.prototype.slice.call(arguments, 0)"
    , "  , hash = key"
    , "  , flag = this.flagged || 0"
    , "  , bytes"
    , "  , type;"

    // The last argument is always the callback.
    , "callback = args.pop();"

    // The default argument order that applies for every command.
    , "key = args[0];"
    , "value = args[1];"

    // The CAS command receives an extra argument to set.
    , "<% if (~args.indexOf('cas')) { %>"
    , "cas = args[2];"
    , "exptime = args[3];"
    , "<% } else { %>"
    , "exptime = args[2];"
    , "<% } %>"

    // If an object is supplied the user wants to be in control on how
    // a server is selected, for example to load a set of data from the same
    // server to improve performance.
    , "if ('object' === typeof key) {"
    , "  hash = key.hash || key.key;"
    , "  exptime = key.expiration || key.expire;"
    , "  value = key.value;"
    , "  flag = key.flag || flag;"

    , "  <% if (~args.indexOf('cas')) { %>"
    , "  cas = key.cas;"
    , "  <% } %>"

    , "  key = key.key;"
    , "}"

    , "if ('function' !== typeof callback) {"
    , "  <% if (~args.indexOf('cas')) { %>"
    , "  cas = callback;"
    , "  callback = undefined;"
    , "  <% } else { %>"
    , "  exptime = callback;"
    , "  callback = undefined;"
    , "  <% } %>"
    , "}"

    // No value, so there's expiration argument missing
    // @TODO make sure that this works for CAS calls
    , "if (!exptime) {"
    , "  exptime = 0;"
    , "}"

    // Check if we need to apply some default flags to this
    , "type = typeof value;"
    , "if (!flag) {"
    , "  if (Buffer.isBuffer(value)) {"
    , "    value = value.toString('binary');"
    , "    flag = 4;"
    , "  } else if ('object' === type) {"
    , "    value = JSON.stringify(value);"
    , "    flag = 2;"
    , "  } else if ('number' === type) {"
    , "    flag = 8;"
    , "  }"
    , "}"

    // Correct set the shizzle
    , "value = value.toString();"
    , "bytes = Buffer.byteLength(value);"

    , "this.send("
    , "    hash"
    , "  <% if (~args.indexOf('exptime')) { %>"
    , "  , '<%= command %> '+ key +' '+ flag +' '+ exptime +' '+ bytes"
    , "  <% } else { %>"
    , "  , '<%= command %> '+ key +' '+ bytes"
    , "  <% } %>"
    , "  , value, callback);"
  ].join(''), details);
});

[
    'stats'
  , 'stats settings'
  , 'stats slabs'
  , 'stats items'
].forEach(function compiling(command) {
  var api = command;

  if (~command.indexOf(' ')) api = command.split(' ')[1];

  Memcached.prototype[api] = new Function('callback', [
      "var completed = 0, responses = {}, length = this.length, error;"

      // These commands should be executed and aggregated from every server as
      // the stats affect every server.
    , "this.servers.forEach(function servers(server) {"
    , "  this.send(hash, '"+ command +"', undefined, function done(err, res) {"
    , "    if (err) {"
    , "      callback(err);"
    , "      return callback = function () {};"
    , "    }"

    , "    responses[server.string] = res;"
    , "    if (++completed !== length) return;"
    , "    callback(undefined, responses);"
    , "  });"
    , "}, this);"
  ].join(''));
});

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

//
// Expose the module.
//
module.exports = Memcached;
