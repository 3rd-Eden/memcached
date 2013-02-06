'use strict';

/**
 * Assertations.
 */
var chai = require('chai');
chai.Assertion.includeStack = true;

/**
 * If your memcached server isn't hosted on localhost you can set the
 * `MEMCACHED_HOST` environment variable.
 *
 * Make sure you specify empty Memcached servers as they do get flushed.
 *
 * Example:
 *
 *   MEMCACHED__HOST=10.211.55.5 npm test
 */
var host = process.env.MEMCACHED_HOST || 'localhost'
  , port = (process.env.MEMCACHED_PORT || '11211,11212,112123').split(',');

/**
 * Automatic increasing test numbers.
 *
 * Example:
 *   var port = portnumber
 *     , another = portnumber;
 *
 *   console.log(port, another); // 1025, 1026
 *
 * @api public
 */
var portnumbers = 1024;
Object.defineProperty(global, 'portnumber', {
  get: function get() {
    return portnumbers++;
  }
});

/**
 * Expose the expect assertations.
 *
 * @api public
 */
Object.defineProperty(global, 'expect', {
  value: chai.expect
});

/**
 * Expose the generated servers.
 *
 * @api public
 */
Object.defineProperty(global, 'servers', {
  value: {
      single: host +':'+ port[0]
    , multipe: port.map(function map(port) {
        return host +':'+ port;
      })
  }
});
