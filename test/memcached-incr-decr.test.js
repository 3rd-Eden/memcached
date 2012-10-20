/**
 * Test dependencies
 */

var assert = require('assert')
  , common = require('./common')
  , Memcached = require('../');

global.testnumbers = global.testnumbers || +(Math.random(10) * 1000000).toFixed();

/**
 * Expresso test suite for all `get` related
 * memcached commands
 */
describe("Memcached INCR DECR", function() {
  /**
   * Simple increments.. Just because.. we can :D
   */
  it("simple incr", function(done) {
     var memcached = new Memcached(common.servers.single)
        , testnr = ++global.testnumbers
        , callbacks = 0;

      memcached.set("test:" + testnr, 1, 1000, function(error, ok){
        ++callbacks;

        assert.ok(!error);
        ok.should.be.true;

        memcached.incr("test:" + testnr, 1, function(error, ok){
          ++callbacks;

          assert.ok(!error);
          ok.should.be.equal(2);

          memcached.end(); // close connections
          assert.equal(callbacks, 2);
          done();
        });
      });
  });

  /**
   * Simple decrement.. So we know that works as well. Nothing special here
   * move on.
   */
  it("simple decr", function(done) {
    var memcached = new Memcached(common.servers.single)
        , testnr = ++global.testnumbers
        , callbacks = 0;

      memcached.set("test:" + testnr, 0, 1000, function(error, ok){
        ++callbacks;

        assert.ok(!error);
        ok.should.be.true;

        memcached.incr("test:" + testnr, 10, function(error, ok){
          ++callbacks;

          assert.ok(!error);
          ok.should.be.equal(10);

          memcached.decr("test:" + testnr, 1, function(error, answer){
            ++callbacks;

            assert.ok(!error);
            answer.should.be.equal(9);

            memcached.end(); // close connections
            assert.equal(callbacks, 3);
            done();
          });
        });
      });
  });

  /**
   * According to the spec, incr should just work fine on keys that
   * have intergers.. So lets test that.
   */
  it("simple increment on a large number", function(done) {
    var memcached = new Memcached(common.servers.single)
        , message = common.numbers(10)
        , testnr = ++global.testnumbers
        , callbacks = 0;

      memcached.set("test:" + testnr, message, 1000, function(error, ok){
        ++callbacks;

        assert.ok(!error);
        ok.should.be.true;

        memcached.incr("test:" + testnr, 1, function(error, answer){
          ++callbacks;

          assert.ok(!error);
          assert.ok(+answer === (message + 1));

          memcached.end(); // close connections
          assert.equal(callbacks, 2);
          done();
        });
      });
  });

  /**
   * decrementing on a unkonwn key should fail.
   */
  it("decrement on a unknown key", function(done) {
    var memcached = new Memcached(common.servers.single)
        , testnr = ++global.testnumbers
        , callbacks = 0;

      memcached.decr("test:" + testnr, 1, function(error, ok){
        ++callbacks;

        assert.ok(!error);
        ok.should.be.false;


        memcached.end(); // close connections
        assert.equal(callbacks, 1);
        done();
      });
  });

  /**
   * We can only increment on a integer, not on a string.
   */
  it("incrementing on a non string value throws a client_error", function(done) {
    var memcached = new Memcached(common.servers.single)
        , testnr = ++global.testnumbers
        , callbacks = 0;

      memcached.set("test:" + testnr, "zing!", 0, function(error, ok){
        ++callbacks;

        assert.ok(!error);
        ok.should.be.true;

        memcached.incr("test:" + testnr, 1, function(error, ok){
          ++callbacks;

          assert.ok(error);
          ok.should.be.false;

          memcached.end(); // close connections;
          assert.equal(callbacks, 2);
          done();
        });
      });
  });
});
