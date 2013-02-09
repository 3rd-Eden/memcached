/*globals servers, portnumber, expect */
describe('Memcached', function () {
  'use strict';

  var Memcached = require('../');

  describe('Memcached.compile()', function () {
    it('generates a custom function');
  });

  describe('new Memcached()', function () {
    it('parses the servers');

    it('applies the options');
  });

  describe('Memcached#configure', function () {
    it('sets up the failover');

    it('generates the API methods');
  });

  describe('Memcached#select', function () {
    it('fetches generates a new connection');

    it('fails when the server does not exist');

    it('emits `error:connection` when a connection errors');

    it('allocates the connections');
  });
});
