/**
 * Test dependencies
 */

var common = require('./common')
  , assert = require('assert')
  , should = require('should')
  , Memcached = require('../');

/**
 * Expresso test suite for all `get` related
 * memcached commands
 */

module.exports = {
  "set and get a regular string":function(){
    var memcached = new Memcached(common.servers.single)
      , message = common.alphabet(256);
    
    memcached.set("test1", message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test1", function(error, answer){
        assert.ok(!error);
        
        assert.ok(typeof message === 'string')
        answer.should.eql(message);
        
        memcached.end(); // close connections
      });
    });
  }
, "set and get a regular number": function(){
    var memcached = new Memcached(common.servers.single)
      , message = common.numbers(256);
    
    memcached.set("test2", message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test2", function(error, answer){
        assert.ok(!error);
        
        assert.ok(typeof message === 'number')
        answer.should.eql(message);
        
        memcached.end(); // close connections
      });
    });

  }
}