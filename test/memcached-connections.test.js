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
      retries: 0,
      failures: 0,
      retry: 100,
      remove: true });

    this.timeout(60000);

    memcached.get('idontcare', function (err) {
        function noserver() {
          memcached.get('idontcare', function(err) {
              throw err;
          });
        };
        assert.throws(noserver, new RegExp('Server at 127.0.1.1234 not available'));
        memcached.end();
        done();
    });
  });
  it('should rebalance to remaining healthy server', function(done) {
    var memcached = new Memcached(['127.0.1:1234', common.servers.single], {
      timeout: 1000,
      retries: 0,
      failures: 0,
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
  it('should properly schedule failed server retries', function(done) {
    var server = '127.0.0.1:1234';
    var memcached = new Memcached(server, {
      retries: 0,
      failures: 5,
      retry: 100 });

    // First request will schedule a retry attempt, and lock scheduling
    memcached.get('idontcare', function (err) {
      assert.throws(function() { throw err }, /connect ECONNREFUSED/);
      assert.deepEqual(memcached.issues[server].failures, 5);
      assert.deepEqual(memcached.issues[server].locked, true);
      assert.deepEqual(memcached.issues[server].failed, true);
      // Immediate request should not decrement failures
      memcached.get('idontcare', function(err) {
        assert.throws(function() { throw err }, /not available/);
        assert.deepEqual(memcached.issues[server].failures, 5);
      assert.deepEqual(memcached.issues[server].locked, true);
      assert.deepEqual(memcached.issues[server].failed, true);
        // Once `retry` time has passed, failures should decrement by one
        setTimeout(function() {
          // Server should be back in action
          assert.deepEqual(memcached.issues[server].locked, false);
          assert.deepEqual(memcached.issues[server].failed, false);
          memcached.get('idontcare', function(err) {
            // Server should be marked healthy again, though we'll get this error
            assert.throws(function() { throw err }, /connect ECONNREFUSED/);
            assert.deepEqual(memcached.issues[server].failures, 4);
            memcached.end();
            done();
          });
        }, 100); // `retry` is 100 so wait 100
      });
    });
  });
  it('should properly schedule server reconnection attempts', function(done) {
    var server = '127.0.0.1:1234'
    , memcached = new Memcached(server, {
      retries: 3,
      minTimeout: 0,
      maxTimeout: 100,
      failures: 0,
      reconnect: 100 })
    , reconnectAttempts = 0;

    memcached.on('reconnecting', function() {
      reconnectAttempts++;
    });

    // First request will mark server dead and schedule reconnect
    memcached.get('idontcare', function (err) {
      assert.throws(function() { throw err }, /connect ECONNREFUSED/);
      // Second request should not schedule another reconnect
      memcached.get('idontcare', function (err) {
        assert.throws(function() { throw err }, /not available/);
        // Allow enough time to pass for a connection retries to occur
        setTimeout(function() {
          assert.deepEqual(reconnectAttempts, 1);
          memcached.end();
          done();
        }, 400);
      });
    });
  });
  it('should reset failures after reconnecting to failed server', function(done) {
    var server = '127.0.0.1:1234'
    , memcached = new Memcached(server, {
      retries: 0,
      minTimeout: 0,
      maxTimeout: 100,
      failures: 1,
      retry: 1,
      reconnect: 100 })

    this.timeout(60000);

    // First request will mark server failed
    memcached.get('idontcare', function(err) {
      assert.throws(function() { throw err }, /connect ECONNREFUSED/);
      // Wait 10ms, server should be back online
      setTimeout(function() {
        // Second request will mark server dead
        memcached.get('idontcare', function(err) {
          assert.throws(function() { throw err }, /connect ECONNREFUSED/);
            // Third request should find no servers
            memcached.get('idontcare', function(err) {
            assert.throws(function() { throw err }, /not available/);
              // Give enough time for server to reconnect
              setTimeout(function() {
                // Server should be reconnected, but expect ECONNREFUSED
                memcached.get('idontcare', function(err) {
                  assert.throws(function() { throw err }, /connect ECONNREFUSED/);
                  assert.deepEqual(memcached.issues[server].failures,
                    memcached.issues[server].config.failures);
                  memcached.end();
                  done();
                });
              }, 150);
            });
          });
      },10);
    });
  });
  it('should default to port 11211', function(done) {
    // Use an IP without port
    var server = '127.0.0.1'
    , memcached = new Memcached(server);

    memcached.get('idontcare', function(err) {
      assert.ifError(err);
      assert.equal(Object.keys(memcached.connections)[0], '127.0.0.1:11211');
      memcached.end();
      done();
    });
  });
  it('should return error on connection timeout', function(done) {
    // Use a non routable IP
    var server = '10.255.255.255:1234'
    , memcached = new Memcached(server, {
      retries: 0,
      timeout: 100,
      idle: 1000,
      failures: 0 });

    memcached.get('idontcare', function(err) {
      assert.throws(function() { throw err }, /Timed out while trying to establish connection/);
      memcached.end();
      done();
    });
  });
  it('should remove connection when idle', function(done) {
    var memcached = new Memcached(common.servers.single, {
      retries: 0,
      timeout: 100,
      idle: 100,
      failures: 0 });

    memcached.get('idontcare', function(err) {
      assert.deepEqual(memcached.connections[common.servers.single].pool.length, 1);
      setTimeout(function() {
        assert.deepEqual(memcached.connections[common.servers.single].pool.length, 0);
        memcached.end();
        done();
      }, 100);
    });
  });
  it('should remove server if error occurs after connection established', function(done) {
    var memcached = new Memcached(common.servers.single, {
      poolSize: 1,
      retries: 0,
      timeout: 1000,
      idle: 5000,
      failures: 0 });

    // Should work fine
    memcached.get('idontcare', function(err) {
      assert.ifError(err);
      // Fake an error on the connected socket which should mark server failed
      var S = memcached.connections[common.servers.single].pool.pop();
      S.emit('error', new Error('Dummy error'));
      memcached.get('idontcare', function(err) {
        assert.throws(function() { throw err; }, /not available/);
        done();
      });
    });
  });
  it('should reset failures if all failures do not occur within failuresTimeout ms', function(done) {
    var server = '10.255.255.255:1234'
    , memcached = new Memcached(server, {
      retries: 0,
      timeout: 10,
      idle: 1000,
      retry: 10,
      failures: 2,
      failuresTimeout: 100 });

    memcached.get('idontcare', function(err) {
      assert.throws(function() { throw err }, /Timed out while trying to establish connection/);
      // Allow `retry` ms to pass, which will decrement failures
      setTimeout(function() {
        assert.deepEqual(memcached.issues[server].failures, 1);
        // Allow failuresTimeout ms to pass, which should reset failures
        setTimeout(function() {
          assert.deepEqual(memcached.issues[server].failures,
            memcached.issues[server].config.failures);
          memcached.end();
          done();
        }, 100);
      }, 15);
    });
  });
});
