/**
 * Test dependencies
 */

var assert = require('assert')
  , should = require('should')
  , common = require('./common')
  , Memcached = require('../');

global.testnumbers = global.testnumbers || 0;

/**
 * Expresso test suite for all `get` related
 * memcached commands
 */

module.exports = {

/**
 * Simple increments.. Just because.. we can :D
 */
  "simple incr": function(){
    var memcached = new Memcached(common.servers.single)
      , testnr = ++global.testnumbers;
    
    memcached.incr("test:" + testnr, 1, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        assert.ok(!error);
        assert.ok(+answer === 1);
        memcached.end(); // close connections
      });
    });
  }
  
/**
 * Simple decrement.. So we know that works as well. Nothing special here
 * move on.
 */
, "simple decr": function(){
    var memcached = new Memcached(common.servers.single)
      , testnr = ++global.testnumbers;
    
    memcached.incr("test:" + testnr, 10, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.decr("test:" + testnr, 1, function(error, answer){
        assert.ok(!error);
        ok.should.be.true;
        
        memcached.get("test:" + testnr, function(error, answer){
          assert.ok(!error);
          assert.ok(+answer === 9);
          memcached.end(); // close connections
        });
      });
    });
  }

/**
 * According to the spec, incr should just work fine on keys that
 * have intergers.. So lets test that. 
 */
, "set and get a regular string": function(){
    var memcached = new Memcached(common.servers.single)
      , message = common.numbers(10)
      , testnr = ++global.testnumbers;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.incr("test:" + testnr, 1, function(error, answer){
        assert.ok(!error);
        
        assert.ok(+answer === (message + 1));
        
        memcached.end(); // close connections
      });
    });
  }

/**
 * Just like the incr function, decrements should just work on keys
 * that do not exist yet.
 */
, "decrement on a unknown key": function(){
    var memcached = new Memcached(common.servers.single)
      , testnr = ++global.testnumbers;
    
    memcached.decr("test:" + testnr, 1, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        assert.ok(!error);
        assert.ok(+answer === -1);
        memcached.end(); // close connections
      });
    });
  }
};