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
describe("Memcached GET SET", function() {
  /**
   * Make sure that the string that we send to the server is correctly
   * stored and retrieved. We will be storing random strings to ensure
   * that we are not retrieving old data.
   */
  it("set and get a regular string", function(done) {
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
        assert.equal(callbacks, 2);
        done();

      });
    });
  });

  it("set and get an empty string", function(done) {
    var memcached = new Memcached(common.servers.single)
      , testnr = ++global.testnumbers
      , callbacks = 0;

    memcached.set("test:" + testnr, "", 1000, function(error, ok){
      ++callbacks;

      assert.ok(!error);
      ok.should.be.true;

      memcached.get("test:" + testnr, function(error, answer){
        ++callbacks;

        assert.ok(!error);

        assert.ok(typeof answer === 'string');
        answer.should.eql("");

        memcached.end(); // close connections
        assert.equal(callbacks, 2);
        done();

      });
    });
  });

  /**
   * Set a stringified JSON object, and make sure we only return a string
   * this should not be flagged as JSON object
   */
  it("set and get a JSON.stringify string", function(done) {
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
        assert.equal(callbacks, 2);
        done();

      });
    });
  });

  /**
   * Setting and getting a unicode value should just work, we need to make sure
   * that we send the correct byteLength because utf8 chars can contain more bytes
   * than "str".length would show, causing the memcached server to complain.
   */
  it("set and get a regular string", function(done) {
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
        assert.equal(callbacks, 2);
        done();
      });
    });
  });

  /**
   * A common action when working with memcached servers, getting a key
   * that does not exist anymore.
   */
  it("get a non existing key", function(done) {
    var memcached = new Memcached(common.servers.single)
      , testnr = ++global.testnumbers
      , callbacks = 0;

    memcached.get("test:" + testnr, function(error, answer){
      ++callbacks;

      assert.ok(!error);
      assert.ok(answer===undefined);

      memcached.end(); // close connections
      assert.equal(callbacks, 1);
      done();
    });
  });

  /**
   * Make sure that Numbers are correctly send and stored on the server
   * retrieval of the number based values can be tricky as the client might
   * think that it was a INCR and not a SET operation.. So just to make sure..
   */
  it("set and get a regular number", function(done) {
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

        assert.ok(typeof answer === 'number');
        answer.should.eql(message);

        memcached.end(); // close connections
        assert.equal(callbacks, 2);
        done();
      });
    });
  });

  /**
   * Objects should be converted to a JSON string, send to the server
   * and be automagically JSON.parsed when they are retrieved.
   */
  it("set and get a object", function(done) {
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

        assert.ok(!Array.isArray(answer) && typeof answer === 'object');
        assert.ok(JSON.stringify(message) === JSON.stringify(answer));
        memcached.end(); // close connections
        assert.equal(callbacks, 2);
        done();
      });
    });
  });

  /**
   * Arrays should be converted to a JSON string, send to the server
   * and be automagically JSON.parsed when they are retrieved.
   */
  it("set and get a array", function(done) {
    var memcached = new Memcached(common.servers.single)
      , message = [{
            numbers: common.numbers(256)
          , alphabet: common.alphabet(256)
          , dates: new Date()
          , arrays: [1,2,3, 'foo', 'bar']
        }, {
            numbers: common.numbers(256)
          , alphabet: common.alphabet(256)
          , dates: new Date()
          , arrays: [1,2,3, 'foo', 'bar']
        }]
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
        assert.ok(JSON.stringify(answer) === JSON.stringify(message));
        memcached.end(); // close connections
        assert.equal(callbacks, 2);
        done();
      });
    });
  });

  /**
   * Buffers are commonly used for binary transports So we need to make sure
   * we support them properly. But please note, that we need to compare the
   * strings on a "binary" level, because that is the encoding the Memcached
   * client will be using, as there is no indication of what encoding the
   * buffer is in.
   */
  it("set and get <buffers> with a binary image", function(done) {
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
        assert.ok(answer.toString('binary') === message.toString('binary'));
        memcached.end(); // close connections
        assert.equal(callbacks, 2);
        done();
      });
    });
  });

  /**
   * Get binary of the lipsum.txt, send it over the connection and see
   * if after we retrieved it, it's still the same when we compare the
   * original with the memcached based version.
   *
   * A use case for this would be storing <buffers> with HTML data in
   * memcached as a single cache pool..
   */
  it("set and get <buffers> with a binary text file", function(done) {
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
        assert.equal(callbacks, 2);
        done();
      });
    });
  });

  /**
   * Set maximum amount of data (1MB), should trigger error, not crash.
   */
  it("set maximum data and check for correct error handling", function(done) {
    var memcached = new Memcached(common.servers.single)
      , message = fs.readFileSync(__dirname + '/fixtures/lipsum.txt').toString()
      , testnr = ++global.testnumbers
      , callbacks = 0;

    memcached.set("test:" + testnr, new Array(100).join(message), 1000, function(error, ok){
      ++callbacks;

      assert.equal(error, 'Error: The length of the value is greater than 1048576');
      ok.should.be.false;

      memcached.end(); // close connections
      assert.equal(callbacks, 1);
      done();
    });
  });

  /**
   * Not only small strings, but also large strings should be processed
   * without any issues.
   */
  it("set and get large text files", function(done) {
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
        assert.equal(callbacks, 2);
        done();
      });
    });
  });

  /**
   * A multi get on a single server is different than a multi server multi get
   * as a multi server multi get will need to do a multi get over multiple servers
   * yes, that's allot of multi's in one single sentence thanks for noticing
   */
  it("multi get single server", function(done) {
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
          assert.equal(callbacks, 3);
          done();
        });
      });
    });
  });

  /**
   * A multi get on a single server is different than a multi server multi get
   * as a multi server multi get will need to do a multi get over multiple servers
   * yes, that's allot of multi's in one single sentence thanks for noticing
   */
  it("multi get multi server", function(done) {
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
          assert.equal(callbacks, 3);
          done();
        });
      });
    });
  });

  /**
   * Make sure that a string beginning with OK is not interpreted as
   * a command response.
   */
  it("set and get a string beginning with OK", function(done) {
    var memcached = new Memcached(common.servers.single)
      , message = 'OK123456'
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
        assert.equal(callbacks, 2);
        done();
      });
    });
  });

  /**
   * Make sure that a string beginning with OK is not interpreted as
   * a command response.
   */
  it("set and get a string beginning with VALUE", function(done) {
    var memcached = new Memcached(common.servers.single)
      , message = 'VALUE hello, I\'m not really a value.'
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
        assert.equal(callbacks, 2);
        done();
      });
    });
  });

  /**
   * Make sure that a string containing line breaks are escaped and
   * unescaped correctly.
   */
  it("set and get a string with line breaks", function(done) {
    var memcached = new Memcached(common.servers.single)
      , message = '1\n2\r\n3\n\r4\\n5\\r\\n6\\n\\r7'
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
        assert.equal(callbacks, 2);
        done();
      });
    });
  });

  /**
   * Make sure long keys are hashed
   */
  it("make sure you can get really long strings", function(done) {
    var memcached = new Memcached(common.servers.single)
      , message = 'VALUE hello, I\'m not really a value.'
      , testnr = "01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789"+(++global.testnumbers)
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
        assert.equal(callbacks, 2);
        done();
      });
    });
  });

  /**
   * Make sure keys with spaces return an error
   */
  it("errors on spaces in strings", function(done) {
    var memcached = new Memcached(common.servers.single)
      , message = 'VALUE hello, I\'m not really a value.'
      , testnr = " "+(++global.testnumbers)
      , callbacks = 0;

    memcached.set("test:" + testnr, message, 1000, function(error, ok){
      ++callbacks;

      assert.ok(error);
      assert.ok(error.message === 'The key should not contain any whitespace or new lines');

      done();
    });
  });

  /*
    Make sure that getMulti calls work for very long keys.
    If the keys aren't hashed because they are too long, memcached will throw exceptions, so we need to make sure that exceptions aren't thrown.
  */
  it("make sure you can getMulti really long keys", function(done) {
    var memcached = new Memcached(common.servers.single)
      , message = 'My value is not relevant'
      , testnr1 = "01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789"+(++global.testnumbers)
      , testnr2 = "01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789"+(global.testnumbers)+"a"
      , callbacks = 0;

    memcached.getMulti([ testnr1, testnr2 ], function(error, ok) {
      ++callbacks;

      assert.ok(!error);
      memcached.end();
      assert.equal(callbacks, 1);
      done();
    });
  });
});
