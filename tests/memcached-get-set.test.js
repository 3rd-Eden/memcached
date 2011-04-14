/**
 * Test dependencies
 */

var assert = require('assert')
  , should = require('should')
  , fs = require('fs')
  , common = require('./common')
  , Memcached = require('../');
  
global.testnumbers = global.testnumbers || 0;

/**
 * Expresso test suite for all `get` related
 * memcached commands
 */

module.exports = {

/**
 * Make sure that the string that we send to the server is correctly
 * stored and retreived. We will be storing random strings to ensure
 * that we are not retreiving old data.
 */
  "set and get a regular string": function(){
    var memcached = new Memcached(common.servers.single)
      , message = common.alphabet(256)
      , testnr = ++global.testnumbers;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        assert.ok(!error);
        
        assert.ok(typeof answer === 'string');
        answer.should.eql(message);
        
        memcached.end(); // close connections
      });
    });
  }

/**
 * Set a stringified JSON object, and make sure we only return a string
 * this should not be flagged as JSON object
 */
, "set and get a JSON.stringify string": function(){
    var memcached = new Memcached(common.servers.single)
      , message = JSON.stringify({numbers:common.numbers(256),alphabet:common.alphabet(256),dates:new Date(),arrays: [1,2,3, 'foo', 'bar']})
      , testnr = ++global.testnumbers;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        assert.ok(!error);
        
        assert.ok(typeof answer === 'string');
        answer.should.eql(message);
        
        memcached.end(); // close connections
      });
    });
  }
  
/**
 * Make sure that Numbers are correctly send and stored on the server
 * retreival of the number based values can be tricky as the client might
 * think that it was a INCR and not a SET operation.. So just to make sure..
 */
, "set and get a regular number": function(){
    var memcached = new Memcached(common.servers.single)
      , message = common.numbers(256)
      , testnr = ++global.testnumbers;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        assert.ok(!error);
        
        assert.ok(typeof answer === 'string');
        answer.should.eql(answer);
        
        memcached.end(); // close connections
      });
    });
  }

/**
 * Objects should be converted to a JSON string, send to the server
 * and be automagically JSON.parsed when they are retreived.
 */
, "set and get a object": function(){
    var memcached = new Memcached(common.servers.single)
      , message = {
          numbers: common.numbers(256)
        , alphabet: common.alphabet(256)
        , dates: new Date()
        , arrays: [1,2,3, 'foo', 'bar']
        }
      , testnr = ++global.testnumbers;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        assert.ok(!error);
        
        assert.ok(!Array.isArray(answer) && typeof answer == 'object');
        assert.ok(JSON.stringify(message) == JSON.stringify(answer));
        memcached.end(); // close connections
      });
    });
  }

/**
 * Arrays should be converted to a JSON string, send to the server
 * and be automagically JSON.parsed when they are retreived.
 */
, "set and get a array": function(){
    var memcached = new Memcached(common.servers.single)
      , message = [
          {
            numbers: common.numbers(256)
          , alphabet: common.alphabet(256)
          , dates: new Date()
          , arrays: [1,2,3, 'foo', 'bar']
          }
        , {
            numbers: common.numbers(256)
          , alphabet: common.alphabet(256)
          , dates: new Date()
          , arrays: [1,2,3, 'foo', 'bar']
          }
        ]
      , testnr = ++global.testnumbers;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        assert.ok(!error);
        
        assert.ok(Array.isArray(answer));
        assert.ok(JSON.stringify(answer) == JSON.stringify(message));
        memcached.end(); // close connections
      });
    });
  }

/**
 * Bufers are commonly used for binary transports So we need to make sure
 * we support them propperly
 */
, "set and get buffers": function(){
    var memcached = new Memcached(common.servers.single)
      , message = fs.readFileSync(__dirname + '/fixtures/hotchicks.jpg')
      , testnr = ++global.testnumbers;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        assert.ok(answer.toString('binary') === answer.toString('binary'));
        memcached.end(); // close connections
      });
    });
  }

/**
 * Not only small strings, but also large strings should be procesed
 * without any issues.
 */
, "set and get large text files": function(){
    var memcached = new Memcached(common.servers.single)
      , message = fs.readFileSync(__dirname + '/fixtures/lipsum.txt', 'utf8')
      , testnr = ++global.testnumbers;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        assert.ok(!error);
        
        assert.ok(typeof answer === 'string');
        answer.should.eql(message);
        memcached.end(); // close connections
      });
    });
  }

/**
 * A multi get on a single server is different than a multi server multi get
 * as a multi server multi get will need to do a multi get over multiple servers
 * yes, that's allot of multi's in one single sentance thanks for noticing
 */
, "multi get single server": function(){
    var memcached = new Memcached(common.servers.single)
        , message = common.alphabet(256)
        , message2 = common.alphabet(256)
        , testnr = ++global.testnumbers;
      
    memcached.set("test1:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.set("test2:" + testnr, message2, 1000, function(error, ok){
        assert.ok(!error);
        ok.should.be.true;
        
        memcached.get(["test1:" + testnr, "test2:" + testnr], function(error, answer){
          assert.ok(!error);
          
          assert.ok(typeof answer === 'object');
          answer["test1:" + testnr].should.eql(message);
          answer["test2:" + testnr].should.eql(message2);
          
          memcached.end(); // close connections
        });
      });
    });
  }
/**
 * A multi get on a single server is different than a multi server multi get
 * as a multi server multi get will need to do a multi get over multiple servers
 * yes, that's allot of multi's in one single sentance thanks for noticing
 */
, "multi get multi server": function(){
    var memcached = new Memcached(common.servers.multi)
        , message = common.alphabet(256)
        , message2 = common.alphabet(256)
        , testnr = ++global.testnumbers;
      
    memcached.set("test1:" + testnr, message, 1000, function(error, ok){
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.set("test2:" + testnr, message2, 1000, function(error, ok){
        assert.ok(!error);
        ok.should.be.true;
        
        memcached.get(["test1:" + testnr,"test2:" + testnr], function(error, answer){
          assert.ok(!error);
          
          assert.ok(typeof answer === 'object');
          answer["test1:" + testnr].should.eql(message);
          answer["test2:" + testnr].should.eql(message2);
          
          memcached.end(); // close connections
        });
      });
    });
  }
};