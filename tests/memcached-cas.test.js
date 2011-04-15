/**
 * Test dependencies
 */

var assert = require('assert')
  , should = require('should')
  , common = require('./common')
  , Memcached = require('../');

global.testnumbers = global.testnumbers || +(Math.random(10) * 1000).toFixed();

/**
 * Expresso test suite for all `get` related
 * memcached commands
 */

module.exports = {

/**
 * For a proper CAS update in memcached you will need to know the CAS value
 * of a given key, this is done by the `gets` command. So we will need to make
 * sure that a `cas` key is given.
 */
  "set and gets for cas result": function(exit){
    var memcached = new Memcached(common.servers.single)
      , message = common.alphabet(256)
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
      
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.gets("test:" + testnr, function(error, answer){
        ++callbacks;
        
        assert.ok(!error);
        
        assert.ok(typeof answer === 'object');
        assert.ok(!!answer.cas);
        answer["test:" + testnr].should.eql(message);
        
        memcached.end(); // close connections
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 2);
    });
  }

/**
 * Create a successful cas update, so we are sure we send a cas request correctly.
 */
, "successful cas update" : function(exit){
    var memcached = new Memcached(common.servers.single)
      , message = common.alphabet(256)
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.gets("test:" + testnr, function(error, answer){
        ++callbacks;
        assert.ok(!error);
        assert.ok(!!answer.cas);
        
        // generate new message for the cas update
        message = common.alphabet(256);
        memcached.cas("test:" + testnr, message, answer.cas, 1000, function(error, answer){
          ++callbacks;
          assert.ok(!error);
          assert.ok(!!answer);
          
          memcached.get("test:" + testnr, function(error, answer){
            ++callbacks;
            
            assert.ok(!error);
            answer.should.eql(message);
            
            memcached.end(); // close connections
          })
        });
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 4);
    });
  }
  
/**
 * Create a unsuccessful cas update, which would indicate that the server has changed
 * while we where doing nothing.
 */
, "unsuccessful cas update" : function(exit){
    var memcached = new Memcached(common.servers.single)
      , message = common.alphabet(256)
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.gets("test:" + testnr, function(error, answer){
        ++callbacks;
        assert.ok(!error);
        assert.ok(!!answer.cas);
        
        // generate new message
        message = common.alphabet(256);
        memcached.set("test:" + testnr, message, 1000, function(){
          ++callbacks;
          
          memcached.cas("test:" + testnr, message, answer.cas, 1000, function(error, answer){
            ++callbacks;
            assert.ok(!error);
            assert.ok(!answer);
            
            memcached.get("test:" + testnr, function(error, answer){
              ++callbacks;
              
              assert.ok(!error);
              answer.should.eql(message);
              
              memcached.end(); // close connections
            })
          });
        });
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 5);
    });
  }
};