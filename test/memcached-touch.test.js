/**
 * Test dependencies
 */

var assert = require('assert')
  , fs = require('fs')
  , common = require('./common')
  , Memcached = require('../');

global.testnumbers = global.testnumbers || +(Math.random(10) * 1000000).toFixed();

/**
 * Expresso test suite for all `touch` related
 * memcached commands
 */
describe("Memcached TOUCH", function() {
  /**
   * Make sure that touching a key with 1 sec lifetime and getting it 1.1 sec after invoke deletion
   */
  it("changes lifetime", function(done) {
    var memcached = new Memcached(common.servers.single)
        , message = common.alphabet(256)
        , testnr = ++global.testnumbers
        , callbacks = 0;

      memcached.set("test:" + testnr, message, 1000, function(error, ok){
        ++callbacks;

        assert.ok(!error);
        ok.should.be.true;

        memcached.touch("test:" + testnr, 1, function(error, ok){
          ++callbacks;

          assert.ok(!error);
          ok.should.be.true;

          setTimeout(function(){
            memcached.get("test:" + testnr, function(error, answer){
              ++callbacks;

              assert.ok(!error);
              answer.should.be.false;

              memcached.end(); // close connections
              assert.equal(callbacks, 3);
              done();
            })}, 1100); // 1.1 sec after

        });
      });
  });

});
