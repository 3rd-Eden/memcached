/**
 * Test dependencies
 */

var assert = require('assert')
  , should = require('should')
  , fs = require('fs')
  , common = require('./common')
  , Memcached = require('../');

global.testnumbers = global.testnumbers || +(Math.random(10) * 1000).toFixed();

/**
 * Expresso test suite for all `get` related
 * memcached commands
 */

module.exports = {

/**
 * Make sure that the string that we send to the server is correctly
 * stored and retrieved. We will be storing random strings to ensure
 * that we are not retrieving old data.
 */
  "set and get a regular string": function(exit){
    var memcached = new Memcached(common.servers.single)
      , message = common.alphabet(256)
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
      
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        ++callbacks;
        
        assert.ok(!error);
        
        assert.ok(typeof answer === 'string');
        answer.should.eql(message);
        
        memcached.end(); // close connections
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 2);
    });
  }

/**
 * Set a stringified JSON object, and make sure we only return a string
 * this should not be flagged as JSON object
 */
, "set and get a JSON.stringify string": function(exit){
    var memcached = new Memcached(common.servers.single)
      , message = JSON.stringify({numbers:common.numbers(256),alphabet:common.alphabet(256),dates:new Date(),arrays: [1,2,3, 'foo', 'bar']})
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
      
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        ++callbacks;
      
        assert.ok(!error);
        
        assert.ok(typeof answer === 'string');
        answer.should.eql(message);
        
        memcached.end(); // close connections
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 2);
    });
  }
  
/**
 * Setting and getting a unicode value should just work, we need to make sure
 * that we send the correct byteLength because utf8 chars can contain more bytes
 * than "str".length would show, causing the memcached server to complain.
 */
, "set and get a regular string": function(exit){
    var memcached = new Memcached(common.servers.single)
      , message = 'привет мир, Memcached и nodejs для победы'
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
      
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        ++callbacks;
        
        assert.ok(!error);
        
        assert.ok(typeof answer === 'string');
        answer.should.eql(message);
        
        memcached.end(); // close connections
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 2);
    });
  }
  
/**
 * A common action when working with memcached servers, getting a key
 * that does not exist anymore.
 */
, "get a non existing key": function(exit){
    var memcached = new Memcached(common.servers.single)
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.get("test:" + testnr, function(error, answer){
      ++callbacks;
        
      assert.ok(!error);
      answer.should.be.false;
      
      memcached.end(); // close connections
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 1);
    });
  }
  
/**
 * Make sure that Numbers are correctly send and stored on the server
 * retrieval of the number based values can be tricky as the client might
 * think that it was a INCR and not a SET operation.. So just to make sure..
 */
, "set and get a regular number": function(exit){
    var memcached = new Memcached(common.servers.single)
      , message = common.numbers(256)
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
        
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        ++callbacks;
        
        assert.ok(!error);
        
        assert.ok(typeof answer === 'string');
        answer.should.eql(answer);
        
        memcached.end(); // close connections
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 2);
    });
  }

/**
 * Objects should be converted to a JSON string, send to the server
 * and be automagically JSON.parsed when they are retrieved.
 */
, "set and get a object": function(exit){
    var memcached = new Memcached(common.servers.single)
      , message = {
          numbers: common.numbers(256)
        , alphabet: common.alphabet(256)
        , dates: new Date()
        , arrays: [1,2,3, 'foo', 'bar']
        }
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
        
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        ++callbacks;
        
        assert.ok(!error);
        
        assert.ok(!Array.isArray(answer) && typeof answer == 'object');
        assert.ok(JSON.stringify(message) == JSON.stringify(answer));
        memcached.end(); // close connections
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 2);
    });
  }

/**
 * Arrays should be converted to a JSON string, send to the server
 * and be automagically JSON.parsed when they are retrieved.
 */
, "set and get a array": function(exit){
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
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
        
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        ++callbacks;
        
        assert.ok(!error);
        
        assert.ok(Array.isArray(answer));
        assert.ok(JSON.stringify(answer) == JSON.stringify(message));
        memcached.end(); // close connections
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 2);
    });
  }

/**
 * Buffers are commonly used for binary transports So we need to make sure
 * we support them properly. But please note, that we need to compare the
 * strings on a "binary" level, because that is the encoding the Memcached
 * client will be using, as there is no indication of what encoding the
 * buffer is in.
 */
, "set and get <buffers> with a binary image": function(exit){
    var memcached = new Memcached(common.servers.single)
      , message = fs.readFileSync(__dirname + '/fixtures/hotchicks.jpg')
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
        
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        ++callbacks;
        
        assert.ok(!error);
        assert.ok(answer.toString('binary') === answer.toString('binary'));
        memcached.end(); // close connections
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 2);
    });
  }

/**
 * Get binary of the lipsum.txt, send it over the connection and see
 * if after we retrieved it, it's still the same when we compare the 
 * original with the memcached based version.
 *
 * A use case for this would be storing <buffers> with HTML data in
 * memcached as a single cache pool..
 */
, "set and get <buffers> with a binary text file": function(exit){
    var memcached = new Memcached(common.servers.single)
      , message = fs.readFileSync(__dirname + '/fixtures/lipsum.txt')
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
        
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        ++callbacks;
        
        assert.ok(!error);
        assert.ok(answer.toString('utf8') === answer.toString('utf8'));
        assert.ok(answer.toString('ascii') === answer.toString('ascii'));
        memcached.end(); // close connections
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 2);
    });
  }

/**
 * Not only small strings, but also large strings should be processed
 * without any issues.
 */
, "set and get large text files": function(exit){
    var memcached = new Memcached(common.servers.single)
      , message = fs.readFileSync(__dirname + '/fixtures/lipsum.txt', 'utf8')
      , testnr = ++global.testnumbers
      , callbacks = 0;
    
    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
        
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.get("test:" + testnr, function(error, answer){
        ++callbacks;
        
        assert.ok(!error);
        
        assert.ok(typeof answer === 'string');
        answer.should.eql(message);
        memcached.end(); // close connections
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 2);
    });
  }

/**
 * A multi get on a single server is different than a multi server multi get
 * as a multi server multi get will need to do a multi get over multiple servers
 * yes, that's allot of multi's in one single sentence thanks for noticing
 */
, "multi get single server": function(exit){
    var memcached = new Memcached(common.servers.single)
        , message = common.alphabet(256)
        , message2 = common.alphabet(256)
        , testnr = ++global.testnumbers
        , callbacks = 0;
      
    memcached.set("test1:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
        
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.set("test2:" + testnr, message2, 1000, function(error, ok){
        ++callbacks;
        
        assert.ok(!error);
        ok.should.be.true;
        
        memcached.get(["test1:" + testnr, "test2:" + testnr], function(error, answer){
          ++callbacks;
        
          assert.ok(!error);
          
          assert.ok(typeof answer === 'object');
          answer["test1:" + testnr].should.eql(message);
          answer["test2:" + testnr].should.eql(message2);
          
          memcached.end(); // close connections
        });
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 3);
    });
  }
  
/**
 * A multi get on a single server is different than a multi server multi get
 * as a multi server multi get will need to do a multi get over multiple servers
 * yes, that's allot of multi's in one single sentence thanks for noticing
 */
, "multi get multi server": function(exit){
    var memcached = new Memcached(common.servers.multi)
        , message = common.alphabet(256)
        , message2 = common.alphabet(256)
        , testnr = ++global.testnumbers
        , callbacks = 0;
      
    memcached.set("test1:" + testnr, message, 1000, function(error, ok){
      ++callbacks;
        
      assert.ok(!error);
      ok.should.be.true;
      
      memcached.set("test2:" + testnr, message2, 1000, function(error, ok){
        ++callbacks;
        
        assert.ok(!error);
        ok.should.be.true;
        
        memcached.get(["test1:" + testnr,"test2:" + testnr], function(error, answer){
          ++callbacks;
        
          assert.ok(!error);
          
          assert.ok(typeof answer === 'object');
          answer["test1:" + testnr].should.eql(message);
          answer["test2:" + testnr].should.eql(message2);
          
          memcached.end(); // close connections
        });
      });
    });
    
    // make sure all callbacks are called
    exit(function(){
      assert.equal(callbacks, 3);
    });
  }
};