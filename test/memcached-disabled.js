var assert = require('assert')
  , fs = require('fs')
  , common = require('./common')
  , Memcached = require('../')
  , ERROR_NOT_ENABLED = 'ENOTENABLED';  // defined in memcached.js constants

global.testnumbers = global.testnumbers || +(Math.random(10) * 1000000).toFixed();

/**
 * Test all public functions to act properly with memcached.enabled = false
 */
describe("Memcached disabled", function() {
  /**
   * Check that changing the memcached.enabled option has effect in real time
   */
  it("memcached.enabled value change", function(done) {
    function test() {
      var enabled = memcached.enabled;
      memcached.get(testnr++, function(error, data) {
        if(enabled) {
          assert.ok(!error);
        } else {
          assert.equal(ERROR_NOT_ENABLED, error);
        }

        if(++callbacks === totalCalls) {
          done();
        }
      });
    }

    var memcached = new Memcached(common.servers.single)
      , testnr = ++global.testnumbers
      , callbacks = 0
      , totalCalls = 3
      , i = totalCalls;

    while(i--) {
      test();
      memcached.enabled = !memcached.enabled;
    }
  });

  /**
   * Instance can be created specifying the { enabled: false } option directly
   * All public methods should invoke the callback with error
   */
  it(ERROR_NOT_ENABLED + " error if enabled is false", function(done) {
    function test(fn, ary, done) {
      function callback(error, ok) {
        ++callbacks;
        assert.equal(ERROR_NOT_ENABLED, error);
        assert.equal(callbacks, 1);
        done();
      }

      var memcached = new Memcached(common.servers.single, { enabled: false })
        , callbacks = 0
        , args = [++global.testnumbers, 10, 10, 'casStringValue'];

      args.splice(ary);
      args[ary-1] = callback;

      memcached[fn].apply(memcached, args);
    }

    var fn2 = 'get,gets,getMulti,del'.split(',')
      , fn3 = 'touch,append,prepend,incr,decr'.split(',')
      , fn4 = 'set,replace,add'.split(',')
      , fn5 = 'cas'.split(',')
      , called = 0
      , total = fn2.length + fn3.length + fn4.length + fn5.length;

    function callback() {
      ++called;
      if(called === total) {
        done();
      }
    }

    for(var i=0; i<fn2.length; i++) {
      test(fn2[i], 2, callback);
    }
    for(var i=0; i<fn3.length; i++) {
      test(fn3[i], 3, callback);
    }
    for(var i=0; i<fn4.length; i++) {
      test(fn4[i], 4, callback);
    }
    for(var i=0; i<fn5.length; i++) {
      test(fn5[i], 5, callback);
    }
  });
});
