//global it

'use strict';

/**
 * Test dependencies
 */

var assert = require('assert')
  , fs = require('fs')
  , net = require('net')
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
  it('should fire `failure` event when server removed and has no fallbacks', function(done) {
    var connectionAttempOk = false
      , mockSocket = null
      , mock = net.createServer(function(socket) {
          mockSocket = socket;
          connectionAttempOk = true;
        })
      , memcached = new Memcached(['127.0.0.1:11219'], {
          timeout: 3000,
          idle: 1000,
          retries: 0,
          remove: true
        })
      , emittedErrors = [];

    [
      'issue',
      'remove',
      'reconnecting',
      'reconnected',
      'failure'
    ].forEach(function(event) {
      memcached.on(event, function() {
        if (emittedErrors[event]) {
          ++emittedErrors[event];
        } else {
          emittedErrors[event] = 1;
        }
      });
    });

    mock.listen(11219, function() {
      memcached.get('y', function(err) {
        var events = Object.keys(emittedErrors);

        // memcached instance must emit `remove` and `failure` events
        assert.strictEqual(events.length, 2);
        assert.ok(~events.indexOf('remove'));
        assert.ok(~events.indexOf('failure'));
        assert.ok(connectionAttempOk);
        assert.strictEqual(err.message, 'Connection timeout');

        memcached.end();
        mockSocket.destroy();
        mock.close();
        done();
      });
    });
  });
});
