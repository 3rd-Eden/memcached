/*
	Thanks @sh1mmer for the gist :)!
	http://gist.github.com/500926
*/

var assert = require('assert'),
    sys = require('sys');

var pass = function(message) {
    sys.error('\033[32mPASS\033[0m: ' + message);
};

var fail = function(message) {
    sys.error('\n\033[31mFAIL\033[0m: ' + message + '\n');
};

exports.fail = function (actual, expected, message, operator) {
    try {
        assert.fail(actual, expected, message, operator);
        pass(message);
    }
    catch (e) {
        fail(message);
    }
};

exports.ok = function (value, message) {
    try {
        assert.ok(value, message);
        pass(message);
    }
    catch (e) {
        fail(message);
    }
};

exports.equal = function (actual, expected, message) {
    try {
        assert.equal(actual, expected, message);
        pass(message);
    }
    catch (e) {
        fail(message);
    }
};

exports.notEqual = function (actual, expected, message) {
    try {
        assert.notEqual(actual, expected, message);
        pass(message);
    }
    catch (e) {
        fail(message);
    }
};

exports.deepEqual = function (actual, expected, message) {
    try {
        assert.deepEqual(actual, expected, message);
        pass(message);
    }
    catch (e) {
        fail(message);
    }
};

exports.notDeepEqual = function (actual, expected, message) {
    try {
        assert.notDeepEqual(actual, expected, message);
        pass(message);
    }
    catch (e) {
        fail(message);
    }
};

exports.strictEqual = function (actual, expected, message) {
    try {
        assert.strictEqual(actual, expected, message);
        pass(message);
    }
    catch (e) {
        fail(message);
    }
};

exports.notStrictEqual = function (actual, expected, message) {
    try {
        assert.notStrictEqual(actual, expected, message);
        pass(message);
    }
    catch (e) {
        fail(message);
    }
};

exports.throws = function (block, error, message) {
    try {
        assert.throws(block, error, message);
        pass(message);
    }
    catch (e) {
        fail(message);
    }
};

exports.doesNotThrow = function (block, error, message) {
    try {
        assert.doesNotThrow(block, error, message);
        pass(message);
    }
    catch (e) {
        fail(message);
    }
};

exports.ifError = function (error, message) {
    try {
        assert.ifError(error);
        pass(message);
    }
    catch (e) {
        fail(message);
    }
};