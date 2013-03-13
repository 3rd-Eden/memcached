/**
 * Test dependencies
 */

var assert = require('assert')
  , fs = require('fs')
  , common = require('./common')
  , Memcached = require('../');

global.testnumbers = global.testnumbers || +(Math.random(10) * 1000000).toFixed();

/**
 * Expresso test suite for all `get` related
 * memcached commands
 */
describe("Memcached tests with Namespaces", function() {
  /**
   * Make sure that the string that we send to the server is correctly
   * stored and retrieved. We will be storing random strings to ensure
   * that we are not retrieving old data.
   */
  it("set with one namespace and verify it can't be read in another", function(done) {
    var memcached = new Memcached(common.servers.single)
        , message = common.alphabet(256)
        , testnr = ++global.testnumbers
        , callbacks = 0;

    // Load an non-namespaced entry to memcached
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;

      assert.ok(!error);
      ok.should.be.true;

      var memcachedOther = new Memcached(common.servers.single, {namespace: 'mySegmentedMemcached:'});
      // Try to load that memcache key with the namespace prepended - this should fail
      memcachedOther.get("test:" + testnr, function(error, answer){
        ++callbacks;
        
        assert.ok(!error);
        ok.should.be.true;
        answer.should.be.false;
    
        // OK, now let's put it in with the namespace prepended
        memcachedOther.set("test:" + testnr, message, 1000, function(error, ok){
          ++callbacks;
    
          assert.ok(!error);
          ok.should.be.true;
    
          // Now when we request it back, it should be there
          memcachedOther.get("test:" + testnr, function(error, answer){
            ++callbacks;
      
            assert.ok(!error);
    
            assert.ok(typeof answer === 'string');
            answer.should.eql(message);
    
            memcachedOther.end(); // close connections
            assert.equal(callbacks, 4);
            done();
          });
        });
      });
    });
  });
});
