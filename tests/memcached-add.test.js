/**
 * Test dependencies
 */

var assert = require('assert')
  , fs = require('fs')
  , common = require('./common')
  , Memcached = require('../');

global.testnumbers = global.testnumbers || +(Math.random(10) * 1000000).toFixed();

/**
 * Expresso test suite for all `add` related
 * memcached commands
 */
describe("Memcached ADD", function() {
  /**
   * Make sure that adding a key which already exists returns an error.
   */
  it("fail to add an already existing key", function(done) {
    var memcached = new Memcached(common.servers.single)
        , message = common.alphabet(256)
        , testnr = ++global.testnumbers
        , callbacks = 0;

      memcached.set("test:" + testnr, message, 1000, function(error, ok){
        ++callbacks;

        assert.ok(!error);
        ok.should.be.true;

        memcached.add("test:" + testnr, message, 1000, function(error, answer){
          ++callbacks;

          assert.ok(error);

          memcached.end(); // close connections
          assert.equal(callbacks, 2);
          done();

        });
      });
  });

});
