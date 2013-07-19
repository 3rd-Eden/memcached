//global it

'use strict';

/**
 * Test dependencies
 */

var assert = require('assert')
  , fs = require('fs')
  , common = require('./common')
  , Memcached = require('../');

global.testnumbers = global.testnumbers || +(Math.random(10) * 1000000).toFixed();

/**
 * Test connection issues
 */
describe('Memcached connections', function () {
  it('should call the callback only once if theres an error', function (done) {
    var memcached = new Memcached('127.0.1:1234', { retries: 3 })
      , calls = 0;

    this.timeout(60000);

    memcached.get('idontcare', function (err) {
      calls++;

      // it should only be called once
      assert.equal(calls, 1);

      memcached.end();
      done();
    });
  });
  it('should remove a failed server', function(done) {
    var memcached = new Memcached('127.0.1:1234', {
      timeout: 1000,
      retries: 3,
      retry: 100,
      remove: true });

    this.timeout(60000);

    memcached.get('idontcare', function (err) {
        function noserver() {
          memcached.get('idontcare', function(err) {
              throw err;
          });
        };
        assert.throws(noserver, /Server not available/);
        memcached.end();
        done();
    });
  });
  it('should rebalance to remaining healthy server', function(done) {
    var memcached = new Memcached(['127.0.1:1234', common.servers.single], {
      timeout: 1000,
      retries: 3,
      retry: 100,
      remove: true,
      redundancy: true });

    this.timeout(60000);

    // 'a' goes to fake server. first request will cause server to be removed
    memcached.get('a', function (err) {
      // second request should be rebalanced to healthy server
      memcached.get('a', function (err) {
        assert.ifError(err);
        memcached.end();
        done();
      });
    });
  });
  it('should not schedule to reconnect if already scheduled', function(done) {
    var memcached = new Memcached('127.0.1:1234', {
      retries: 3,
      remove: false,
      retry: 0,
      reconnect: 100 })
    , reconnectionAttempts = 0;

    this.timeout(60000);

    memcached.on('reconnecting', function(details) {
      reconnectionAttempts++;
    });

    memcached.get('idontcare', function (err) {
      setTimeout(function() {
        assert.deepEqual(reconnectionAttempts, 1);
          memcached.end();
          done();
      }, 1000);
    });
  });
});
