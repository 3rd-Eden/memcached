/**
 * Server ip addresses that get used during the tests
 * NOTE! Make sure you configure empty servers as they
 * will get flushed!.
 *
 * @type {Object}
 * @api public
 */
exports.servers = {
  single: '10.211.55.5:11211'
, multi: ['10.211.55.5:11211', '10.211.55.5:11212', '10.211.55.5:11213']
};

/**
 * Generate a random alphabetical string.
 *
 * @param {Number} n The length of the generated string
 * @returns {String} a random generated string
 * @api public
 */
exports.alphabet = function(n){
  for (var a = '', i = 0; i < n; i++) {
    a += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  }

  return a;
};

exports.numbers = function(n){
  for (var a = 0, i = 0; i < n; i++) {
    a += Math.floor(Math.random() * 26);
  }

  return a;
};