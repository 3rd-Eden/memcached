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
 * For a proper CAS update in memcached you will need to know the CAS value
 * of a given key, this is done by the `gets` command. So we will need to make
 * sure that a `cas` key is given.
 */
  "set and gets for cas result": function(){
    var memcached = new Memcached(common.servers.single)
      , message = common.alphabet(256)
      , testnr = ++global.testnumbers;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.gets("test:" + testnr, function(error, answer){
        assert.ok(!error);
        
        assert.ok(typeof answer === 'object');
        assert.ok(!!answer.cas);
        answer["test:" + testnr].should.eql(message);
        memcached.end(); // close connections
      });
    });
  }

/**
 * Create a sucessful cas update
 */
, "successful cas update" : function(){
    var memcached = new Memcached(common.servers.single)
      , message = common.alphabet(256)
      , testnr = ++global.testnumbers;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.gets("test:" + testnr, function(error, answer){
        assert.ok(!error);
        assert.ok(!!answer.cas);
        
        // generate new message for the cas update
        message = common.alphabet(256);
        memcached.cas("test:" + testnr, message, answer.cas, 1000, function(error, answer){
          assert.ok(!error);
          
          memcached.get("test:" + testnr, function(error, answer){
            
            assert.ok(!error);
            answer.should.eql(message);
            
            memcached.end(); // close connections
          })
        });
      });
    });
  }
};