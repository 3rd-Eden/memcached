/**
 * Benchmark dependencies
 */
var Benchmark = require('benchmark')
  , microtime = require('microtime')
  , http = require('http')
  , path = require('path')
  , fs = require('fs')
  , common = require('../tests/common');
  
/**
 * Different memcached drivers
 */
var Memcached = require('../')
  , Memcache = require('memcache');

/**
 * Generate data that will be used for testing
 */
var tinyString = common.alphabet(12)
  , smallString = common.alphabet(1E3)
  , mediumString = common.alphabet(25E3)
  , largeString = fs.readFileSync(path.join(__dirname, '../tests/fixtures/lipsum.txt'));

/**
 * Setup the different benchmarks and stress tests
 */
var suites = {}
  , memcached = new Memcached(common.servers.single)
  , memcache = new Memcache(common.servers.single.split(':')[0], common.servers.single.split(':')[1])

/**
 * Benchmark setting of small strings
 */
suites.tinySet = new Benchmark.Suite;
suites.tinySet
// memcached client
.add('Memcached, `set` command', function(){
  // fire and forget
  memcached.set('benchmark:set:1', tinyString, 0, function(){});
})

// memcache client
.add('Memcache, `set` command', function(){
  // fire and forget
  memcache.set('benchmark:set:1', tinyString, function(){});
})

// output logging
.on('cycle', function(bench){
  console.log("Executing benchmark:" + bench);
})
.on('complete', function(){
  console.log('Fastest is ' + this.filter('fastest').pluck('name'));
  setTimeout(function(){
    suites.smallSet.run();
  }, 25000); // let the memcache server rest for a while, before we hit it again
});

// setting small strings
suites.smallSet = new Benchmark.Suite;
suites.smallSet

// memcached client
.add('Memcached, `set` command', function(){
  // fire and forget
  memcached.set('benchmark:set:2', smallString, 0, function(){});
})

// memcache client
.add('Memcache, `set` command', function(){
  // fire and forget
  memcache.set('benchmark:set:2', smallString, function(){});
})

// output logging
.on('cycle', function(bench){
  console.log("Executing benchmark:" + bench);
})
.on('complete', function(){
  console.log('Fastest is ' + this.filter('fastest').pluck('name'));
  //setTimeout(function(){
  //  suites.smallSet.run();
  //}, 25000); // let the memcache server rest for a while, before we hit it again
});

/**
 * Run the suites
 */
suites.tinySet.run();