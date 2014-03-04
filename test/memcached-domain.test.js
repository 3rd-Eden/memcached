/**
 * Test dependencies
 */

var assert = require('assert')
  , common = require('./common')
  , Memcached = require('../')
  , domain = require('domain');

global.testnumbers = global.testnumbers || +(Math.random(10) * 1000000).toFixed();

/**
 * Expresso test suite for domain handling
 */
describe("Memcached domain awareness", function() {
  var memcached = new Memcached(common.servers.single);

  it('should restore the domain properly after each calls', function(done) {
    var message = common.alphabet(256)
      , testnr = ++global.testnumbers
      , dA = domain.createDomain()
      , dB = domain.createDomain();

    dA.enter(); // enter domain A
    memcached.set('test:' + testnr, message, 1000, function (error, ok) {
      dB.enter(); // enter domain B
      memcached.set('test:' + testnr, message, 1000, function (error, ok) {
        // Leave all domains
        while (process.domain) {
          process.domain.exit();
        }
        done();
      });
    });
  });

  it('should not enter a domain when there is none', function(done) {
    var message = common.alphabet(256)
      , testnr = ++global.testnumbers;

    assert.equal(process.domain, undefined);
    memcached.set('test:' + testnr, message, 1000, function (error, ok) {
      assert.equal(process.domain, undefined);

      memcached.end(); // close connections
      done();
    });
  });
});
