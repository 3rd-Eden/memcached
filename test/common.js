'use strict';

/**
 * Server ip addresses that get used during the tests
 * NOTE! Make sure you configure empty servers as they
 * will get flushed!.
 *
 * If your memcache hosts is not the default one
 * (10.211.55.5), you can pass another one using the
 * environment variable MEMCACHED__HOST. E.g.:
 *
 * MEMCACHED__HOST=localhost npm test
 *
 * @type {Object}
 * @api public
 */
var testMemcachedHost = process.env.MEMCACHED__HOST || '10.211.55.5';

exports.servers = {
    single: testMemcachedHost + ':11211'
  , multi: [
      testMemcachedHost + ':11211'
    , testMemcachedHost + ':11212'
    , testMemcachedHost + ':11213'
  ]
};

/**
 * Generate a random alphabetical string.
 *
 * @param {Number} n The length of the generated string
 * @returns {String} a random generated string
 * @api public
 */
exports.alphabet = function alphabet(n){
  for (var a = '', i = 0; i < n; i++) {
    a += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  }

  return a;
};

/**
 * Generate a bunch of random numbers
 *
 * @param {Number} n the amount of numbers
 * @returns {Number}
 * @api public
 */
exports.numbers = function numbers(n){
  for (var a = 0, i = 0; i < n; i++) {
    a += Math.floor(Math.random() * 26);
  }

  return a;
};
